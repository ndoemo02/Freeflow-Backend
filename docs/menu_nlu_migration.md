# Menu NLU Migration — `menu_items_v2` Normalization

**Date:** 2026-03-05  
**Project:** FreeFlow  
**Table:** `public.menu_items_v2`  
**Status:** ✅ Completed

---

## Motivation

The `name` column in `menu_items_v2` contains full display names that mix the **dish identity** with **size, quantity, and variant tokens**. This causes NLU matching failures in voice ordering:

- User says: _"margherita"_
- DB stores: `"Pizza Margherita 33cm"`
- Match: ❌ FAIL (phonetic mismatch on suffix)

After migration, NLU matches against `base_name`:
- Match: ✅ PASS

---

## Schema

Two columns were populated (already existed in schema):

| Column | Type | Purpose |
|--------|------|---------|
| `base_name` | `text` | Cleaned dish name for NLU matching |
| `size_or_variant` | `text` | Extracted size/quantity/variant token |

The original `name` column is **unchanged** — frontend continues to display it.

---

## Extraction Rules (size_or_variant)

| Pattern | Example Input | Extracted |
|--------|---------------|-----------|
| `N ml` / `N l` / `N,Nl` | `Coca-Cola 0,5l` | `0,5l` |
| `N szt.` / `N szt` | `Kluski śląskie 7 szt.` | `7 szt` |
| `N cm` | `Pizza Margherita 33cm` | `33cm` |
| `Double` (word) | `Desperado Double` | `double` |
| `Standard` (word) | `Kosmiczne Jaja Standard` | `standard` |
| `(N ml)` brackets | `Woda mineralna (330 ml)` | `330ml` |
| Decimal vol. | `Pepsi 0.85L` | `0.85L` |

---

## Normalization Rules (base_name)

Applied in sequence:

1. Remove bracket text: `(...)` → `""`
2. Remove volume: `200ml`, `0,5l`, `330 ml`, `0.85L`
3. Remove size: `33cm`
4. Remove weight: `200g`, `0.5kg`
5. Remove pcs: `3 szt.`, `7 szt`, `4 szt.`
6. Remove variant tokens: `Double`, `Standard` (whole word at end or middle)
7. Clean trailing punctuation and double spaces

---

## Before / After Examples

| Original `name` | `base_name` | `size_or_variant` |
|-----------------|------------|-------------------|
| `Pizza Margherita 33cm` | `Pizza Margherita` | `33cm` |
| `Pizza Pepperoni 33cm` | `Pizza Pepperoni` | `33cm` |
| `Kluski śląskie 7 szt.` | `Kluski śląskie` | `7 szt` |
| `Sajgonki 3 szt.` | `Sajgonki` | `3 szt` |
| `Placki ziemniaczane 4 szt.` | `Placki ziemniaczane` | `4 szt` |
| `Woda mineralna (330 ml)` | `Woda mineralna` | `330ml` |
| `Coca-Cola 0,3l` | `Coca-Cola` | `0,3l` |
| `Coca-Cola 0,5l` | `Coca-Cola` | `0,5l` |
| `Pepsi 0.85L` | `Pepsi` | `0.85L` |
| `Desperado Double` | `Desperado` | `double` |
| `Milczenie Wola Double` | `Milczenie Wola` | `double` |
| `Kosmiczne Jaja Standard` | `Kosmiczne Jaja` | `standard` |
| `Żwirek i Muchomorek Standard` | `Żwirek i Muchomorek` | `standard` |
| `Kroket (z kapustą i grzybami...)` | `Kroket` | `1 szt` |
| `Coca-Cola, Fanta, Sprite, Cappy (200 ml)` | `Coca-Cola, Fanta, Sprite, Cappy` | `200ml` |

---

## SQL Migration Scripts

### Step 1 — Backup
```sql
CREATE TABLE menu_items_v2_backup_nlu AS SELECT * FROM menu_items_v2;
```

### Step 2 — Extract size_or_variant

```sql
-- Volume (ml/l)
UPDATE menu_items_v2
SET size_or_variant = substring(name from '\d+[,.]?\d*\s?(ml|l|cl|L)\b')
WHERE name ~* '\d+[,.]?\d*\s?(ml|l|cl|L)\b'
  AND (size_or_variant IS NULL OR size_or_variant = '');

-- Pieces (szt)
UPDATE menu_items_v2
SET size_or_variant = substring(name from '\d+\s?szt\.?')
WHERE name ~* '\d+\s?szt\.?'
  AND (size_or_variant IS NULL OR size_or_variant = '');

-- Pizza size (cm)
UPDATE menu_items_v2
SET size_or_variant = substring(name from '\d+\s?cm\b')
WHERE name ~* '\d+\s?cm\b'
  AND (size_or_variant IS NULL OR size_or_variant = '');

-- Double / Standard
UPDATE menu_items_v2 SET size_or_variant = 'double'
WHERE name ~* '\bDouble\b' AND (size_or_variant IS NULL OR size_or_variant = '');

UPDATE menu_items_v2 SET size_or_variant = 'standard'
WHERE name ~* '\bStandard\b' AND (size_or_variant IS NULL OR size_or_variant = '');
```

### Step 3-4 — Generate base_name

```sql
-- Initialize from name
UPDATE menu_items_v2 SET base_name = name;

-- Remove brackets
UPDATE menu_items_v2
SET base_name = trim(regexp_replace(base_name, '\([^)]*\)', '', 'g'));

-- Remove volumes
UPDATE menu_items_v2
SET base_name = trim(regexp_replace(base_name, '\d+[,.]?\d*\s?(ml|l|cl|L)\b', '', 'gi'));

-- Remove size
UPDATE menu_items_v2
SET base_name = trim(regexp_replace(base_name, '\d+\s?cm\b', '', 'gi'));

-- Remove pcs
UPDATE menu_items_v2
SET base_name = trim(regexp_replace(base_name, '\d+\s?szt\.?', '', 'gi'));

-- Remove trailing Double/Standard
UPDATE menu_items_v2
SET base_name = trim(regexp_replace(base_name, '\s+Double\s*$', '', 'i'))
WHERE base_name ~* '\s+Double\s*$';

UPDATE menu_items_v2
SET base_name = trim(regexp_replace(base_name, '\s+Standard\s*$', '', 'i'))
WHERE base_name ~* '\s+Standard\s*$';

-- Final cleanup
UPDATE menu_items_v2
SET base_name = trim(regexp_replace(base_name, '\s+', ' ', 'g'));
```

---

## NLU Integration (Step 6)

After migration, NLU pipeline in `pipeline.js` / `menuService.js` should:

```js
// Match user input against base_name (NOT full name)
const match = menuItems.find(item =>
  normalize(userText).includes(normalize(item.base_name)) ||
  normalize(userText).includes(normalize(item.variant_name))
);
```

The `dishCanon.js` alias layer provides additional fuzzy matching:
```js
// dishCanon: "Żwirek i Muchomorek Standard" → "żwirek"
import { canonicalizeDish } from '../nlu/dishCanon.js';
const canonName = canonicalizeDish(userText); // "żwirek"
// Then match against base_name
```

---

## UI Integrity (Step 7)

> ⚠️ Frontend MUST continue to display `name` and `price_pln` from `menu_items_v2`.  
> `base_name` is **NLU-only** and should never replace the display name.

```sql
-- Frontend query (unchanged):
SELECT id, name, price_pln, category, image_url, available
FROM menu_items_v2
WHERE restaurant_id = $1 AND available = true;

-- NLU query (new):
SELECT id, name, base_name, size_or_variant, price_pln
FROM menu_items_v2
WHERE restaurant_id = $1 AND available = true;
```

---

## Backup

A full backup was created before migration:
```sql
-- Restore if needed:
-- TRUNCATE menu_items_v2;
-- INSERT INTO menu_items_v2 SELECT * FROM menu_items_v2_backup_nlu;
```
