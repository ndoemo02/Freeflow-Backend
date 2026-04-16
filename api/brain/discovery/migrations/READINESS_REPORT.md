# Implementation Readiness Report
> Date: 2026-04-09
> Scope: stage-a-restaurants.sql + stage-b-menu-items-v2.sql vs live code
> Verdict: READY TO MIGRATE — 3 code changes required post-backfill (none pre-migration)

---

## 1. repository.js — SELECT update required?

**YES — after backfill, not before.**

Current SELECTs fetch only:

```js
// searchRestaurants + searchNearby:
'id, name, address, city, cuisine_type, lat, lng'
// Missing post-migration: description, price_level, supports_delivery,
//                         taxonomy_groups, taxonomy_cats, taxonomy_tags
```

Reading new columns before backfill = every row returns `null` / `'{}'`.
Expanding SELECT *before* backfill is harmless but pointless.

**Recommended action** (post-backfill only):

```js
// searchRestaurants + searchNearby:
'id, name, address, city, cuisine_type, description, lat, lng, ' +
'price_level, supports_delivery, taxonomy_groups, taxonomy_cats, taxonomy_tags'
```

`getMenu` in `repository.js` already selects `description` — no change needed there.
`getMenu` does NOT need `item_family` / `item_aliases` — those are used only by the
**inline query in `findHandler.js`** (see issue #2 below).

---

## 2. findHandler.js — inline queries not going through repository.js

**TWO inline Supabase queries exist in `findHandler.js` that bypass `repository.js`:**

### 2a. `searchRestaurantsByItemInCity` — restaurants query (line 253–257)

```js
.from('restaurants')
.select('id, name, address, city, cuisine_type, lat, lng')  // ← missing new columns
```

This query also needs an expanded SELECT post-backfill — same fields as `repository.js`.
It is independent of `repository.js`, so it must be updated **separately**.

### 2b. `searchRestaurantsByItemInCity` — menu items query (line 265–269)

```js
.from('menu_items_v2')
.select('id, name, base_name, restaurant_id, available')  // ← base_name already there
```

`base_name` is already in this SELECT. Post-backfill this should expand to:

```js
.select('id, name, base_name, item_family, item_aliases, restaurant_id, available')
```

This enables short-circuit: if `item_family` matches query → skip `scoreMenuItemMatch`
alias scan for that item. If `item_aliases` non-empty → use DB aliases instead of
calling `buildItemAliases()`.

**Count of SELECT changes required post-backfill: 3**
| File | Query | Change |
|---|---|---|
| `repository.js` | `searchRestaurants` | Add 6 columns |
| `repository.js` | `searchNearby` | Add 6 columns |
| `findHandler.js` | inline restaurants query | Add 6 columns |
| `findHandler.js` | inline menu items query | Add `item_family`, `item_aliases` |

---

## 3. restaurantFeatureAdapter.ts — breaking change risk?

**NO breaking change. Fully backward-compatible as-is.**

The `LegacyRestaurant` interface has `[key: string]: unknown` catch-all.
New DB columns (`taxonomy_groups`, `taxonomy_cats`, `taxonomy_tags`, `supports_delivery`)
will arrive as regular fields on the object once SELECTs are expanded.

Key detail: `resolveSupportsDelivery()` already checks `r.supports_delivery` (exact name):

```ts
if (typeof r.supports_delivery === 'boolean') return r.supports_delivery;  // ← already correct
```

Once the canonical `supports_delivery` column is in DB and in SELECT, this branch fires
immediately — the 3-way fallback below it becomes dead code for backfilled rows, but
`if / else if` chaining means it cannot break.

**Recommended optimization post-backfill** (not blocking):

```ts
// In mapRestaurantToFeatures() — add short-circuit at top:
if (
  Array.isArray((r as any).taxonomy_groups) &&
  (r as any).taxonomy_groups.length > 0
) {
  return {
    topGroups:  (r as any).taxonomy_groups,
    categories: (r as any).taxonomy_cats  ?? [],
    tags:       (r as any).taxonomy_tags  ?? [],
  };
}
// Fall through to keyword scan for unclassified restaurants
```

This is an optimization, not a requirement. The adapter is safe to ship without it.

---

## 4. discoveryFilter.ts — changes needed?

**NO changes required — zero.**

`discoveryFilter.ts` never reads DB directly.
Its full pipeline is: `matchQueryToTaxonomy(text)` → `mapRestaurantToFeatures(r)` → scoring.

`mapRestaurantToFeatures` is the only boundary. If the adapter short-circuits using
DB values (point 3 above), `discoveryFilter` benefits automatically with no modification.

All scoring constants, AND-enforcement logic, and `open_now` boost remain correct as-is.

---

## 5. Fallbacks that must remain after backfill

| Fallback | Stays permanently? | Reason |
|---|---|---|
| Keyword corpus scan in `mapRestaurantToFeatures` | **YES** | Restaurants with `taxonomy_groups = '{}'` (not yet backfilled, new entries, low-confidence rows) |
| `resolveSupportsDelivery` 3-way OR | **YES** | Restaurants added post-backfill may not have `supports_delivery` set immediately |
| `buildItemAliases()` / `ITEM_FAMILY_DICTIONARY` | **YES** | Items with `item_aliases = '{}'` (new items, unclassified families) |
| `scoreMenuItemMatch()` substring scoring | **YES** | Family/alias matching in DB covers known items only — novel queries still need JS scan |
| `open_now` runtime boost | **YES — forever** | Cannot be precomputed; depends on current wall-clock time |
| Nearby city fallback (`NEARBY_CITY_MAP`) | **YES** | Unrelated to schema — stays in `findHandler` regardless |

**Rule**: DB values are an accelerator, not a replacement.
Runtime inference is always the safety net for untagged/new data.

---

## 6. Rollout Order

```
STEP 1 — MIGRATE (safe at any time, zero app impact)
  Apply stage-a-restaurants.sql
  Apply stage-b-menu-items-v2.sql
  Verify columns exist: SELECT column_name FROM information_schema.columns
                        WHERE table_name IN ('restaurants', 'menu_items_v2')

STEP 2 — BACKFILL (run offline or as Edge Function)
  Run backfill-restaurants-taxonomy.ts     ← fills taxonomy_*, supports_delivery, price_level
  Run backfill-menu-base-names.ts          ← fills base_name NULLs
  Run backfill-menu-item-families.ts       ← fills item_family where score >= 100
  Manual review: spot-check 10-20 rows per table

STEP 3 — CODE READ-PATH SWITCH (one PR, after backfill verified)
  Expand SELECT in repository.js (searchRestaurants + searchNearby)
  Expand SELECT in findHandler.js (inline restaurants query + menu items query)
  Add short-circuit in restaurantFeatureAdapter.ts (optional but recommended)
  Deploy — no flag needed, fallbacks ensure zero regression

STEP 4 — INDEXES (after step 3 stabilized, off-peak)
  CREATE INDEX idx_restaurants_taxonomy_groups ... USING GIN
  CREATE INDEX idx_restaurants_taxonomy_cats  ... USING GIN
  CREATE INDEX idx_restaurants_taxonomy_tags  ... USING GIN
  CREATE INDEX idx_restaurants_delivery       ... WHERE supports_delivery = TRUE
  CREATE INDEX idx_menu_item_family           ... WHERE item_family IS NOT NULL
  CREATE INDEX idx_menu_item_aliases          ... USING GIN (conditional)
  CREATE INDEX idx_menu_item_tags             ... USING GIN (conditional)

STEP 5 — MANUAL DATA (no code dependency)
  Fill opening_hours per restaurant (enables deterministic open_now)
  Fill item_aliases, item_tags, dietary_flags per item family group
  Fill popularity_score from analytics pipeline
```

---

## Summary — Blocking Issues Before Migration

| Issue | Blocking? |
|---|---|
| SQL inconsistency with existing schema | **None found** — all ADD COLUMN IF NOT EXISTS |
| repository.js needs change | Not before migration — safe to delay |
| adapter breaking change | None — catch-all interface |
| discoveryFilter needs change | None |
| `base_name` pre-existence risk | Handled — `IF NOT EXISTS` + rollback note |
| `description` pre-existence risk | Handled — `IF NOT EXISTS` |

**Migration is safe to run as written. No SQL edits required.**
