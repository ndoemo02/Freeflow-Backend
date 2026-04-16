# Supabase Schema Extension Plan — Discovery Fields
> Status: DESIGNED, NOT EXECUTED. Additive only — zero breaking changes.
> Data: 2026-04-09 (v2 — Stage A / Stage B split)

---

## 0. Diagnoza: Co robi runtime, czego brakuje w DB

### Co adapter (`restaurantFeatureAdapter.ts`) wnioskuje w locie

| Pole inferowane | Źródło w runtime | Problem |
|---|---|---|
| `topGroups[]` | `name + cuisine_type + description + tags[]` keyword scan | Nie ma w DB — re-compute przy każdym requeście |
| `categories[]` | j.w. | j.w. |
| `tags.spicy / vege / quick` | corpus keyword scan | Skanuje cały menu JSON per restauracja per request |
| `tags.delivery` | 3-way fallback (`supportsDelivery` / `supports_delivery` / `deliveryAvailable`) | Brak kanonicznego pola |
| `_price_level` | keyword scan + `price_level` jeśli istnieje | Partial w DB, reszta = educated guess |
| `tags.open_now` | Brak `opening_hours` w DB | open_now = boost-only signal, nigdy deterministyczny |

### Co `findHandler.js` robi z `menu_items_v2` (item-led discovery)

`searchRestaurantsByItemInCity()` robi:
1. Pobiera wszystkie restauracje dla miasta (do 80 rekordów)
2. Pobiera do **5000 menu items** dla tych restauracji
3. Buduje aliasy per query (`buildItemAliases` + `ITEM_FAMILY_DICTIONARY`)
4. Scoruje każdy item (`scoreMenuItemMatch`) przez substring match na `base_name || name`
5. Grupuje po `restaurant_id`, zwraca top 10

**Problem**: aliasy są budowane dynamicznie w runtime z hardcoded `ITEM_FAMILY_DICTIONARY`.
Gdyby `item_family` i `item_aliases` były w DB — można by queryować bezpośrednio zamiast pobierać 5000 rekordów i filtrować w JS.

### Co `repository.js` pobiera z DB (aktualnie)

```sql
-- searchRestaurants + searchNearby:
SELECT id, name, address, city, cuisine_type, lat, lng
-- BRAK: description, price_level, supports_delivery, taxonomy_*

-- getMenu:
SELECT id, name, price_pln, description, category, available
-- BRAK: base_name, item_family, item_tags, dietary_flags
```

---

## Stage A: Restaurant Discovery Fields

> Tabela: `restaurants`
> Cel: eliminacja runtime keyword inference dla topGroups/categories/tags/delivery/price

### A1. Migration SQL

```sql
-- ============================================================
-- MIGRATION: restaurants_discovery_fields
-- Table: restaurants
-- Type: ADDITIVE ONLY — ADD COLUMN IF NOT EXISTS
-- ============================================================

ALTER TABLE restaurants
  -- Corpus dostępny dla adaptera (brakuje w SELECT)
  ADD COLUMN IF NOT EXISTS description        TEXT,

  -- Ujednolicony price_level (część rekordów już to ma, constraint dodaje bezpieczeństwo)
  ADD COLUMN IF NOT EXISTS price_level        SMALLINT  DEFAULT 2
                                              CHECK (price_level BETWEEN 1 AND 4),

  -- Kanoniczne pole dostawy (zastępuje 3-way fallback w adapterze)
  ADD COLUMN IF NOT EXISTS supports_delivery  BOOLEAN   DEFAULT FALSE,

  -- Pre-computed L1 taxonomy (TopGroupID[])
  -- Wartości: 'fast_food' | 'pizza_italian' | 'asian' | 'polish' | 'grill' | 'desserts_cafe'
  ADD COLUMN IF NOT EXISTS taxonomy_groups    TEXT[]    DEFAULT '{}',

  -- Pre-computed L2 taxonomy (CategoryID[])
  -- Wartości: 'sushi' | 'pizza' | 'burgers' | ... (pełna lista w taxonomy.runtime.ts)
  ADD COLUMN IF NOT EXISTS taxonomy_cats      TEXT[]    DEFAULT '{}',

  -- Pre-computed CoreTags (bez 'open_now' — open_now jest zawsze runtime)
  -- Wartości: 'spicy' | 'vege' | 'quick' | 'delivery'
  ADD COLUMN IF NOT EXISTS taxonomy_tags      TEXT[]    DEFAULT '{}',

  -- Godziny pracy — warunek konieczny dla deterministycznego open_now
  -- NULL = nieznane → open_now pozostaje boost-only (jak teraz)
  -- Format: {"mon": "10:00-22:00", "tue": "10:00-22:00", "sat": null, ...}
  ADD COLUMN IF NOT EXISTS opening_hours      JSONB     DEFAULT NULL;
```

### A2. Justyfikacja pól

| Kolumna | Typ | Dlaczego teraz |
|---|---|---|
| `description` | `TEXT` | Adapter czyta `r.description`, ale repository go nie selectuje — inference traci dane |
| `price_level` | `SMALLINT` | Istnieje fragmentarycznie; CHECK constraint ujednolica zakres i umożliwia filtr w SQL |
| `supports_delivery` | `BOOLEAN` | `resolveSupportsDelivery()` robi 3-way OR + corpus fallback — jedno kanoniczne pole to eliminuje |
| `taxonomy_groups` | `TEXT[]` | L1 classification — bez tego adapter re-compute per request zamiast czytać z DB |
| `taxonomy_cats` | `TEXT[]` | L2 classification — j.w. |
| `taxonomy_tags` | `TEXT[]` | CoreTags per restauracja — stabilne, nie zależą od query |
| `opening_hours` | `JSONB` | Bez tego `open_now` nigdy nie będzie działał poprawnie — tylko false boost |

### A3. Indeksy (po backfill — nie przy migracji)

```sql
-- Dla operacji .contains() i .overlaps() na TEXT[]:
CREATE INDEX IF NOT EXISTS idx_restaurants_taxonomy_groups
  ON restaurants USING GIN (taxonomy_groups);

CREATE INDEX IF NOT EXISTS idx_restaurants_taxonomy_cats
  ON restaurants USING GIN (taxonomy_cats);

CREATE INDEX IF NOT EXISTS idx_restaurants_taxonomy_tags
  ON restaurants USING GIN (taxonomy_tags);

-- Partial index — tylko restauracje z dostawą (mały zbiór, szybki lookup):
CREATE INDEX IF NOT EXISTS idx_restaurants_delivery
  ON restaurants (supports_delivery)
  WHERE supports_delivery = TRUE;
```

### A4. Backfill Strategy

`mapRestaurantToFeatures()` z adaptera robi całą pracę — skrypt tylko persystuje wynik.

```ts
// backfill-restaurants-taxonomy.ts
// Uruchamiać jednorazowo — lokalnie lub jako Supabase Edge Function

import { supabase } from '../_supabase.js';
import { mapRestaurantToFeatures } from './discovery/restaurantFeatureAdapter.js';

async function backfillRestaurants() {
  let cursor = 0;
  const PAGE = 100;

  while (true) {
    // WAŻNE: selectujemy WSZYSTKIE pola które adapter może potrzebować
    const { data, error } = await supabase
      .from('restaurants')
      .select('id, name, cuisine_type, description, tags, price_level, supportsDelivery, supports_delivery, deliveryAvailable, menu')
      .range(cursor, cursor + PAGE - 1);

    if (error || !data?.length) break;

    for (const r of data) {
      const features = mapRestaurantToFeatures(r);

      // Kanoniczny resolve dostawy (replika logiki adaptera)
      const delivery = !!(r.supportsDelivery || r.supports_delivery || r.deliveryAvailable || features.tags.includes('delivery'));

      // Kanoniczny resolve price_level
      const priceLevel = (typeof r.price_level === 'number' && r.price_level >= 1 && r.price_level <= 4)
        ? r.price_level : 2;

      // open_now NIE jest zapisywane — jest zawsze runtime
      const tagsForDb = features.tags.filter(t => t !== 'open_now');

      await supabase
        .from('restaurants')
        .update({
          taxonomy_groups:   features.topGroups,
          taxonomy_cats:     features.categories,
          taxonomy_tags:     tagsForDb,
          supports_delivery: delivery,
          price_level:       priceLevel,
        })
        .eq('id', r.id);
    }

    cursor += PAGE;
    console.log(`[Stage A backfill] ${cursor} restaurants done`);
  }
}
```

---

## Stage B: Item-Led Discovery Fields in `menu_items_v2`

> Tabela: `menu_items_v2` — produkcyjna, kanoniczna tabela pozycji menu.
> Cel: eliminacja 5000-rekordowego JS scan w item-led discovery.

### B1. Kontekst: Jak działa item-led discovery teraz

```
searchRestaurantsByItemInCity(location, itemQuery)
  ↓
  1. SELECT restaurants WHERE city ILIKE location  LIMIT 80
  2. SELECT menu_items_v2 WHERE restaurant_id IN (...)  LIMIT 5000
  ↓
  3. buildItemAliases(itemQuery) → aliasy z ITEM_FAMILY_DICTIONARY
  4. scoreMenuItemMatch(item.base_name || item.name, aliases)
     → substring/prefix/token match → score 60–140
  5. Filter score < 85, group by restaurant_id, sort DESC
  ↓
  6. Return top 10 restaurants z matched_menu_items[]
```

**Bottleneck**: krok 2–4 ładuje do 5000 rekordów do JS runtime i filtruje tam.
Gdyby `item_family` był w DB — query mogłoby filtrować bezpośrednio:
```sql
WHERE item_family = 'kebab' AND available = TRUE
```

### B2. Migration SQL

```sql
-- ============================================================
-- MIGRATION: menu_items_v2_discovery_fields
-- Table: menu_items_v2 (PRODUKCYJNA — nie zastępujemy)
-- Type: ADDITIVE ONLY — ADD COLUMN IF NOT EXISTS
-- ============================================================

ALTER TABLE menu_items_v2
  -- Normalizowana forma nazwy (findHandler już używa base_name || name — może być null)
  ADD COLUMN IF NOT EXISTS base_name          TEXT,

  -- Rodzina produktu z ITEM_FAMILY_DICTIONARY
  -- Wartości: 'kebab' | 'rollo' | 'calzone' | 'schabowy' | 'nalesnik' | 'pierogi' | 'zurek' | NULL
  -- NULL = item poza słownikiem (większość pozycji) — brak filtrowania po rodzinie
  ADD COLUMN IF NOT EXISTS item_family        TEXT      DEFAULT NULL,

  -- Wariant w ramach rodziny (opcjonalny)
  -- Przykład: item_family='kebab', item_variant='durum' | 'box' | 'falafel'
  -- Umożliwia precyzyjne wyszukiwanie "kebab durum" bez fuzzy matchowania całej nazwy
  ADD COLUMN IF NOT EXISTS item_variant       TEXT      DEFAULT NULL,

  -- Pre-computed aliasy do matchowania (zastępuje buildItemAliases() dla znanych itemów)
  -- Przykład: ['kebab', 'döner', 'doner', 'rollo kebab', 'kebab rollo']
  -- Puste = brak pre-computed aliasów → runtime buildItemAliases() jako fallback (jak teraz)
  ADD COLUMN IF NOT EXISTS item_aliases       TEXT[]    DEFAULT '{}',

  -- Tagi smakowe/charakterystyczne dla dania
  -- Wartości: podzbiór CoreTag: 'spicy' | 'vege'
  ADD COLUMN IF NOT EXISTS item_tags          TEXT[]    DEFAULT '{}',

  -- Precyzyjniejsze diety — nie duplikują CoreTag, idą głębiej
  -- Wartości: 'gluten_free' | 'lactose_free' | 'vegan' | 'halal' | 'kosher'
  ADD COLUMN IF NOT EXISTS dietary_flags      TEXT[]    DEFAULT '{}',

  -- Sygnał rankingowy przy braku query match (confidence=empty lub item bez family)
  -- 0 = nieznane, 1–100 = rosnąca popularność (uzupełniane z analytics / manualnie)
  ADD COLUMN IF NOT EXISTS popularity_score   SMALLINT  DEFAULT 0;
```

### B3. Justyfikacja nowych pól

| Kolumna | Typ | Uzasadnienie z kodu runtime |
|---|---|---|
| `base_name` | `TEXT` | `findHandler` już używa `item.base_name \|\| item.name` — pole istnieje w SELECT ale może być null dla starszych rekordów |
| `item_family` | `TEXT` | `ITEM_FAMILY_DICTIONARY` w `findHandler` hardcoduje rodziny. Przeniesienie do DB pozwala queryować `WHERE item_family = X` zamiast JS scan 5000 rekordów |
| `item_variant` | `TEXT` | `buildItemAliases()` próbuje rozpoznać wariant przez fuzzy containment — precyzyjny variant w DB eliminuje false-positive (np. "kebab box" vs "kebab durum") |
| `item_aliases` | `TEXT[]` | `buildItemAliases()` generuje aliasy dynamicznie z `ITEM_FAMILY_DICTIONARY` per request. Pre-computed aliases dla znanych itemów redukuje runtime alias computation do fallback-only |
| `item_tags` | `TEXT[]` | Tagi smakowe per danie — teraz wymagają scan menu blob przez adapter |
| `dietary_flags` | `TEXT[]` | Filtry diety precyzyjniejsze niż `vege` CoreTag — przyszłościowe filtry w discovery |
| `popularity_score` | `SMALLINT` | Fallback ranking gdy `confidence=empty` — teraz wyniki alfabetyczne lub w kolejności DB |

### B4. Relacja `item_family` z `ITEM_FAMILY_DICTIONARY`

Aktualny słownik w `findHandler.js`:

```js
const ITEM_FAMILY_DICTIONARY = {
  rollo:    ['rollo', 'rolo', 'rollo kebab', 'kebab rollo', 'durum rollo'],
  calzone:  ['calzone', 'pizza calzone'],
  schabowy: ['schabowy', 'kotlet schabowy', 'schab tradycyjny'],
  nalesnik: ['nalesnik', 'nalesniki', 'naleśnik', 'naleśniki'],
  pierogi:  ['pierogi', 'pierog', 'pieróg'],
  zurek:    ['zurek', 'żurek', 'zur slaski', 'żur śląski'],
};
```

Dozwolone wartości `item_family` to klucze słownika + `NULL`.
**Słownik pozostaje w runtime** jako source of truth — DB value powinno być spójne z kluczami słownika, nie odwrotnie.

### B5. Backfill Strategy — `menu_items_v2`

**Co można backfill-ować automatycznie**: `base_name` (normalizacja `name`)
**Co wymaga manualnego tagowania**: `item_family`, `item_variant`, `item_aliases`, `item_tags`, `dietary_flags`
**Co pochodzi z analytics**: `popularity_score`

```ts
// backfill-menu-base-names.ts
// Uzupełnia base_name dla rekordów gdzie jest NULL

const { data } = await supabase
  .from('menu_items_v2')
  .select('id, name, base_name')
  .is('base_name', null);

for (const item of data ?? []) {
  const normalized = item.name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')  // strip PL diakrytyki
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  await supabase
    .from('menu_items_v2')
    .update({ base_name: normalized })
    .eq('id', item.id);
}
```

```ts
// backfill-menu-item-families.ts
// Semi-automated: matchuje item_family z ITEM_FAMILY_DICTIONARY przez ten sam scoring co runtime
// Zapisuje tylko gdy score >= 100 (exact/prefix match) — reszta wymaga manualnego review

import { buildItemAliases, scoreMenuItemMatch } from '../domains/food/findHandler.js';

const ITEM_FAMILIES = ['rollo', 'calzone', 'schabowy', 'nalesnik', 'pierogi', 'zurek'];

const { data: items } = await supabase
  .from('menu_items_v2')
  .select('id, name, base_name')
  .is('item_family', null);

for (const item of items ?? []) {
  const itemName = item.base_name || item.name;
  let bestFamily: string | null = null;
  let bestScore = 0;

  for (const family of ITEM_FAMILIES) {
    const aliases = buildItemAliases(family);
    const score = scoreMenuItemMatch(itemName, aliases);
    if (score > bestScore) { bestScore = score; bestFamily = family; }
  }

  if (bestScore >= 100 && bestFamily) {
    await supabase
      .from('menu_items_v2')
      .update({ item_family: bestFamily })
      .eq('id', item.id);
  }
}
```

### B6. Indeksy (po backfill — nie przy migracji)

```sql
-- item_family lookup (selectywny — większość NULL):
CREATE INDEX IF NOT EXISTS idx_menu_item_family
  ON menu_items_v2 (item_family)
  WHERE item_family IS NOT NULL;

-- item_aliases GIN (dla future .contains() queries):
CREATE INDEX IF NOT EXISTS idx_menu_item_aliases
  ON menu_items_v2 USING GIN (item_aliases)
  WHERE array_length(item_aliases, 1) > 0;

-- item_tags GIN (dla filtrowania 'spicy', 'vege' na poziomie dania):
CREATE INDEX IF NOT EXISTS idx_menu_item_tags
  ON menu_items_v2 USING GIN (item_tags)
  WHERE array_length(item_tags, 1) > 0;
```

---

## Co zostaje w runtime, co przechodzi do DB

### Runtime — na zawsze

| Element | Powód |
|---|---|
| `matchQueryToTaxonomy()` | Parser query użytkownika — po stronie zapytania, nie danych |
| `shouldIncludeRestaurant()` / `scoreRestaurant()` | Zależne od konkretnego parsed query — niemożliwe w SQL |
| `open_now` boost | Wymaga aktualnej godziny — nie precompute-owalny |
| `runDiscovery()` + LLM fallback signal | Orchestracja warstwy aplikacji |
| `ITEM_FAMILY_DICTIONARY` | Source of truth dla `item_family` — DB wartości muszą być spójne z kluczami |
| `buildItemAliases()` | Fallback dla itemów bez `item_aliases` w DB |
| `scoreMenuItemMatch()` | Scoring — join query×data, w JS |

### Do DB (po backfill)

| Element | Teraz | Docelowo |
|---|---|---|
| `topGroups / categories` per restaurant | Runtime inference | `taxonomy_groups`, `taxonomy_cats` |
| `tags` (spicy, vege, delivery) | Runtime inference | `taxonomy_tags`, `supports_delivery` |
| `price_level` | Partial | `price_level` z CHECK constraint |
| `description` | W obiekcie, poza SELECT | Dodać do SELECT w `repository.js` |
| `opening_hours` | Nie istnieje | `opening_hours JSONB` (manualnie) |
| `item_family` per menu item | Hardcoded dict w JS | `item_family` TEXT — query zamiast JS scan |
| `item_variant` | Brak | `item_variant` TEXT |
| `item_aliases` per item | `buildItemAliases()` per request | `item_aliases TEXT[]` — pre-computed |
| `base_name` | Częściowo null | Uzupełnić null-owe rekordy |

---

## Priorytety wykonania

### Stage A — Restaurants

| Priorytet | Działanie | Ryzyko |
|---|---|---|
| 🟢 A-P0 | Dodaj `description` do SELECT w `repository.js` | Zero — tylko SELECT |
| 🟢 A-P0 | Migration `restaurants_discovery_fields` | Zero — ADD COLUMN IF NOT EXISTS |
| 🟡 A-P1 | Backfill `backfill-restaurants-taxonomy.ts` | Niskie — safe writes, idempotentny |
| 🔵 A-P2 | GIN indeksy na `taxonomy_*` | Średnie — index build time |
| 🔵 A-P2 | Uzupełnij `opening_hours` manualnie | Manualny proces — bez automatyzacji |
| 🔵 A-P2 | Rozszerz SELECT w `repository.js` o nowe kolumny | Zero po backfill |

### Stage B — menu_items_v2

| Priorytet | Działanie | Ryzyko |
|---|---|---|
| 🟢 B-P0 | Migration `menu_items_v2_discovery_fields` | Zero — ADD COLUMN IF NOT EXISTS |
| 🟡 B-P1 | Backfill `base_name` dla null-owych rekordów | Niskie — fill nulls |
| 🟡 B-P1 | Semi-auto backfill `item_family` (score >= 100) | Niskie — tylko high-confidence matches |
| 🔵 B-P2 | Manual review + tag `item_family` dla pozostałych | Manualny proces |
| 🔵 B-P2 | Manual tag `item_aliases`, `item_tags`, `dietary_flags` | Manualny proces |
| 🔵 B-P2 | Indeksy na `item_family`, `item_aliases`, `item_tags` | Średnie — po backfill |
| 🔵 B-P3 | `popularity_score` z analytics | Zewnętrzna zależność |
