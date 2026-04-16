# Minimal Supabase Migration Plan (Wariant A)
> Status: Commented / Optional step for the future. NOT EXECUTED YET.

## Goal
Add minimal non-breaking additive fields to the existing `restaurants` table. This allows fast taxonomy execution natively via Postgres filtering without impacting any legacy systems.

## The Minimal Migration Script
```sql
-- Dodawane do istniejącej tabeli restaurants
-- Bez migracji danych legacy — kolumny nullable ze smart fallback options

ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS
  categories       TEXT[]    DEFAULT '{}', -- e.g. ['burgers', 'sushi']
  tags             TEXT[]    DEFAULT '{}', -- e.g. ['spicy', 'vege', 'delivery']
  price_level      SMALLINT  DEFAULT 2 CHECK (price_level BETWEEN 1 AND 4),
  supports_delivery BOOLEAN   DEFAULT FALSE;
```

## How This Integrates (Future Phase)

### 1. The Query update
Once the data is populated, `findHandler` and `queryUnderstanding` logic will perform:
```ts
// Instead of scanning JSON blobs on the JS runtime...
const query = supabase
  .from('restaurants')
  .select('*')

if (parsedTags.length > 0) {
  // Uses Contains operation (<@) in PostgreSQL
  query.contains('tags', parsedTags); 
}

if (parsedCategories.length > 0) {
  // Overlaps operator (&&) in Postgres 
  query.overlaps('categories', parsedCategories);
}
```

### 2. Manual Data Tagging
Currently the `restaurantFeatureAdapter.ts` will parse and map legacy JSON and string values into predictable categories and tags at runtime. Once you are comfortable with the inference mapping quality, we can write a simple background process to do a one-off update passing `.mapRestaurantToFeatures(restaurant)` output to populate the new additive SQL columns. 

### Why Avoid Migrating Now? 
Keeping this out of DB migration logic enables immediate iterative testing in the app via the runtime filters `discoveryFilter.ts`. There's zero risk of corrupting database records for restaurants.
