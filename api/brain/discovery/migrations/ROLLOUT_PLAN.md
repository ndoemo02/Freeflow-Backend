# DB Rollout Execution Plan
> Project: FreeFlow — `ezemaacyyvbpjlagchds` (eu-west-3, ACTIVE_HEALTHY)
> Date: 2026-04-09
> Status: READY TO EXECUTE
> Code Read-Path: ✅ ALREADY IMPLEMENTED (repository.js, findHandler.js, restaurantFeatureAdapter.ts)

---

## Pre-flight: Live Schema Facts

Confirmed from production schema audit:

| Column | Table | Exists? | Impact |
|---|---|---|---|
| `opening_hours` | restaurants | **YES** | Skip in Stage A — already in place |
| `delivery_available` | restaurants | **YES** | Skip `supports_delivery` — already mapped in runtime |
| `is_open` | restaurants | **YES** | No change |
| `description` | restaurants | **NO** | → ADD in Stage A |
| `price_level` | restaurants | **NO** | → ADD in Stage A |
| `taxonomy_groups/cats/tags` | restaurants | **NO** | → ADD in Stage A |
| `base_name` | menu_items_v2 | **YES** | Skip — already in SELECT |
| `size_or_variant` | menu_items_v2 | **YES** | Skip `item_variant` — equivalent |
| `spicy` | menu_items_v2 | **YES** | Use for `item_tags` backfill |
| `is_vege` | menu_items_v2 | **YES** | Use for `item_tags` backfill |
| `item_family` | menu_items_v2 | **NO** | → ADD in Stage B |
| `item_aliases` | menu_items_v2 | **NO** | → ADD in Stage B |
| `item_tags` | menu_items_v2 | **NO** | → ADD in Stage B |
| `dietary_flags` | menu_items_v2 | **NO** | → ADD in Stage B |
| `popularity_score` | menu_items_v2 | **NO** | → ADD in Stage B |

**Net columns to add: 3 + 5 = 8 total**
(down from 7 + 7 in original plan due to existing columns)

---

## Rollout Order

```
PHASE 1  MIGRATE          ← safe at any time, zero app impact
PHASE 2  BACKFILL         ← offline or as low-priority task
PHASE 3  CODE READ-PATH   ← ✅ DONE — already implemented, no action needed
PHASE 4  INDEXES          ← off-peak, after backfill validated
PHASE 5  MANUAL DATA      ← ongoing, no code dependency
```

> **Active execution sequence: Phase 1 → Phase 2 → Phase 4 → Phase 5**
> Phase 3 is complete. Validation checklist runs immediately after Phase 2.

---

## Phase 1 — MCP Migration Sequence

### ☑ ROLLBACK CHECKPOINT A
*Run before Phase 1. No rollback needed yet — this is the safe state.*

### Stage A: restaurants (execute first)

**MCP call:**
```
tool: apply_migration
project_id: ezemaacyyvbpjlagchds
name: stage_a_restaurant_discovery_fields
query: [contents of stage-a-restaurants.sql — BEGIN...COMMIT block only]
```

**Adds:**
- `restaurants.description` TEXT nullable
- `restaurants.price_level` SMALLINT DEFAULT 2 + CHECK constraint
- `restaurants.taxonomy_groups` TEXT[] DEFAULT '{}'
- `restaurants.taxonomy_cats` TEXT[] DEFAULT '{}'
- `restaurants.taxonomy_tags` TEXT[] DEFAULT '{}'

**Verification SQL (run immediately after):**
```sql
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'restaurants'
  AND column_name IN ('description','price_level','taxonomy_groups','taxonomy_cats','taxonomy_tags')
ORDER BY column_name;
```
Expected: 5 rows returned.

### Stage B: menu_items_v2 (execute second, independent)

**MCP call:**
```
tool: apply_migration
project_id: ezemaacyyvbpjlagchds
name: stage_b_menu_items_v2_discovery_fields
query: [contents of stage-b-menu-items-v2.sql — BEGIN...COMMIT block only]
```

**Adds:**
- `menu_items_v2.item_family` TEXT nullable
- `menu_items_v2.item_aliases` TEXT[] DEFAULT '{}'
- `menu_items_v2.item_tags` TEXT[] DEFAULT '{}'
- `menu_items_v2.dietary_flags` TEXT[] DEFAULT '{}'
- `menu_items_v2.popularity_score` SMALLINT DEFAULT 0 + CHECK constraint

**Verification SQL (run immediately after):**
```sql
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'menu_items_v2'
  AND column_name IN ('item_family','item_aliases','item_tags','dietary_flags','popularity_score')
ORDER BY column_name;
```
Expected: 5 rows returned.

### ☑ ROLLBACK CHECKPOINT B — After Phase 1
*Decision: are all 10 new columns visible? If NO → run rollback.sql Phase 1 block.*

> ⚠️ Code read-path is already live. New columns are already in SELECT statements.
> After migration, the app will receive `null`/`'{}'` for new columns until backfill runs.
> This is safe — runtime fallbacks handle empty arrays and nulls correctly.
> Taxonomy inference continues from existing fields (keyword scan remains active).

```sql
-- Quick post-migration sanity check:
SELECT COUNT(*) AS total,
       COUNT(*) FILTER (WHERE taxonomy_groups IS NOT NULL) AS has_taxonomy,
       COUNT(*) FILTER (WHERE description IS NOT NULL) AS has_description
FROM restaurants;
-- Expected: total=1, has_taxonomy=1 (= '{}'), has_description depends on data
```

---

## Phase 2 — Backfill Sequence

### Stage A backfill (restaurants — 1 row currently)

**Step A1 — Auto backfill: taxonomy_groups / taxonomy_cats / taxonomy_tags / price_level**
```
Run: backfill-restaurants-taxonomy.ts
  Reads: name, cuisine_type, description, delivery_available
  Writes: taxonomy_groups, taxonomy_cats, taxonomy_tags, price_level
  Method: mapRestaurantToFeatures() from restaurantFeatureAdapter.ts
  Idempotent: YES (UPDATE WHERE id = ...)
```

**Step A2 — Spot verify (MCP execute_sql):**
```sql
SELECT name, taxonomy_groups, taxonomy_cats, taxonomy_tags, price_level
FROM restaurants
LIMIT 10;
```
Expected: taxonomy_groups not empty for restaurants with identifiable cuisine.

---

### Stage B backfill (menu_items_v2 — 269 rows)

**Step B1 — Semi-auto: item_family (score >= 100 only)**
```
Run: backfill-menu-item-families.ts
  Reads: name, base_name, description
  Writes: item_family
  Threshold: scoreMenuItemMatch >= 100 (exact/prefix match only)
  Idempotent: YES
```

**Step B2 — Verify family coverage:**
```sql
SELECT item_family, COUNT(*) AS count
FROM menu_items_v2
GROUP BY item_family
ORDER BY count DESC;
```
Expected: NULL row (unclassified) + rows per known family.

**Step B3 — Auto: item_tags from existing spicy/is_vege columns**
```sql
-- Run via MCP execute_sql (safe batch update):
UPDATE menu_items_v2
SET item_tags = ARRAY_REMOVE(
  ARRAY[
    CASE WHEN spicy    = TRUE THEN 'spicy' END,
    CASE WHEN is_vege  = TRUE THEN 'vege'  END
  ],
  NULL
)
WHERE item_tags = '{}'
  AND (spicy = TRUE OR is_vege = TRUE);
```
This is pure derivation — zero data loss risk. Idempotent (WHERE item_tags = '{}').

**Step B4 — Verify item_tags:**
```sql
SELECT item_tags, COUNT(*) FROM menu_items_v2
GROUP BY item_tags
ORDER BY COUNT(*) DESC;
```

### ☑ ROLLBACK CHECKPOINT C — After Phase 2
*Decision: does backfill data look correct? If NO → use Safe Partial Rollback from rollback.sql.*

> ✅ Code read-path is already live. Backfill data activates immediately upon commit — no deploy needed.
> Run validation checklist queries (below) immediately after backfill to confirm quality.
> If taxonomy data is wrong: safe partial rollback zeros arrays → runtime fallbacks reactivate.

---

## Phase 3 — Code Read-Path Switch ✅ COMPLETED

**Already implemented. No action required.**

Completed changes (confirmed by developer):
1. `repository.js` — searchRestaurants + searchNearby SELECT expanded
2. `findHandler.js` — inline restaurants query + inline menu items query expanded
3. `restaurantFeatureAdapter.ts` — short-circuit for `taxonomy_groups` added

> New columns return `null`/`'{}'` from DB until backfill runs.
> Runtime fallbacks in adapter and discoveryFilter handle this correctly.
> No regression — existing keyword scan path stays active for empty arrays.

---

## Phase 4 — Index Creation

**Execute after Phase 2 (backfill) is verified. Off-peak hours.**

```sql
-- MCP: execute_sql (not apply_migration — indexes are non-structural)

CREATE INDEX IF NOT EXISTS idx_restaurants_taxonomy_groups
  ON restaurants USING GIN (taxonomy_groups)
  WHERE array_length(taxonomy_groups, 1) > 0;

CREATE INDEX IF NOT EXISTS idx_restaurants_taxonomy_cats
  ON restaurants USING GIN (taxonomy_cats)
  WHERE array_length(taxonomy_cats, 1) > 0;

CREATE INDEX IF NOT EXISTS idx_restaurants_taxonomy_tags
  ON restaurants USING GIN (taxonomy_tags)
  WHERE array_length(taxonomy_tags, 1) > 0;

CREATE INDEX IF NOT EXISTS idx_menu_item_family
  ON menu_items_v2 (item_family)
  WHERE item_family IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_menu_item_aliases
  ON menu_items_v2 USING GIN (item_aliases)
  WHERE array_length(item_aliases, 1) > 0;
```

The `delivery_available` boolean and `opening_hours` already exist — index if query plans demand it.

---

## Phase 5 — Manual Data (ongoing, no deadline)

| Data | Table | Column | Method |
|---|---|---|---|
| Item aliases | menu_items_v2 | `item_aliases` | Manual per item_family group |
| Dietary flags | menu_items_v2 | `dietary_flags` | Manual / operator input |
| Opening hours | restaurants | `opening_hours` | Already exists — operator fills |
| Popularity score | menu_items_v2 | `popularity_score` | Analytics pipeline |

---

## Validation Checklist (run after Phase 2 — backfill)

> Code read-path is already live. Validation applies immediately after backfill.
> Run as API queries and verify AI response quality:

### ✅ pizza in Piekary

```
Query: "pizza Piekary"
Expected:
  - taxonomy_cats CONTAINS 'pizza'
  - city ILIKE '%Piekary%'
  - Result: pizza restaurants list (not empty)
  - No item-led path triggered
Regression risk: LOW — taxonomy_cats replaces runtime keyword scan
```

### ✅ kebab spicy

```
Query: "kebab spicy" or "kebab ostry"
Expected:
  - taxonomy_cats CONTAINS 'kebab' (restaurant filter)
  - item_tags CONTAINS 'spicy' (dish filter)
  - Results: only restaurants serving spicy kebab items
  - item_tags populated from step B3 (spicy=TRUE rows)
Regression risk: MEDIUM — depends on spicy column having correct data
```

### ✅ rollo in Piekary

```
Query: "rollo Piekary"
Expected:
  - item_family = 'rollo' hits in menu_items_v2
  - searchRestaurantsByItemInCity path triggered
  - Results include restaurants in Piekary with item_family='rollo'
  - No JS scan of all 269 items — direct SQL WHERE clause
Regression risk: HIGH — item_family backfill must be correct for 'rollo' items
Verify: SELECT id, name, item_family FROM menu_items_v2 WHERE item_family = 'rollo';
```

### ✅ delivery

```
Query: "dostawa" or "z dowozem"
Expected:
  - delivery_available = TRUE filter applied (existing column)
  - taxonomy_tags may also CONTAIN 'delivery' (if backfilled)
  - Results: only delivery-enabled restaurants
Regression risk: LOW — delivery_available already exists, runtime fallback stays active
```

### ✅ open_now

```
Query: "otwarte teraz" or "open now"
Expected:
  - Runtime wall-clock boost ALWAYS applied (never DB column)
  - opening_hours JSONB used if non-null (existing column — already in DB)
  - Restaurants with NULL opening_hours still returned (no hard filter)
Regression risk: NONE — open_now is permanently runtime-only
```

---

## Rollback Decision Matrix

| After | Condition | Action |
|---|---|---|
| Phase 1 (migration) | Columns not created | Run `rollback.sql` — DROP block |
| Phase 1 (migration) | App errors discovery | Unlikely — runtime fallbacks cover empty arrays |
| Phase 2 (backfill) | Bad taxonomy data | Run `rollback.sql` — Safe Partial Reset (zero arrays, not DROP) |
| Phase 2 (backfill) | Bad item_family | Safe Partial Reset → fix backfill script → re-run |
| Phase 4 (indexes) | Slow queries during index build | `DROP INDEX` only — zero app impact |

> Phase 3 (code) is already deployed — no code rollback needed.
> If taxonomy quality is wrong, fix via data (backfill re-run), not code revert.

