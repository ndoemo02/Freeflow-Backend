-- ============================================================
-- MIGRATION: stage-a-restaurants.sql
-- Table:     restaurants
-- Type:      ADDITIVE ONLY — no drops, no renames, no alters of existing columns
-- Status:    DRAFT — NOT EXECUTED
-- Date:      2026-04-09
-- Project:   FreeFlow (ezemaacyyvbpjlagchds)
--
-- PRE-FLIGHT: columns already confirmed PRESENT in production (DO NOT ADD):
--   opening_hours     JSONB nullable  ← already exists
--   delivery_available BOOLEAN        ← already exists (maps to supports_delivery in code)
--   is_open           BOOLEAN         ← already exists
--
-- Backfill order after applying:
--   1. Run backfill-restaurants-taxonomy.ts (auto-fills taxonomy_* from runtime adapter)
--   2. Manually validate taxonomy_groups/taxonomy_cats on sample rows
--   3. Expand SELECT in repository.js to include new columns
--   4. Add GIN indexes only after backfill completes
-- ============================================================

BEGIN;

-- ── 1. description ───────────────────────────────────────────
-- Already used by restaurantFeatureAdapter.ts but MISSING from repository.js SELECT.
-- Nullable: YES — many legacy rows may have no description.
-- Backfill: none needed — content filled by restaurant operators.
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS description TEXT;

-- ── 2. price_level ───────────────────────────────────────────
-- Nullable: NO — defaults to 2 (mid-range) when unknown.
-- Backfill: backfill-restaurants-taxonomy.ts writes resolved value.
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS price_level SMALLINT DEFAULT 2;

ALTER TABLE restaurants
  ADD CONSTRAINT IF NOT EXISTS chk_restaurants_price_level
    CHECK (price_level BETWEEN 1 AND 4);

-- ── 3. supports_delivery — SKIPPED ───────────────────────────
-- delivery_available (BOOLEAN) already exists in production.
-- Code fallback resolveSupportsDelivery() already reads r.deliveryAvailable.
-- No new column needed. Alias mapping is handled in runtime only.
-- (Do NOT add supports_delivery — would duplicate delivery_available)

-- ── 4. taxonomy_groups ───────────────────────────────────────
-- Pre-computed L1 TopGroupID[] from taxonomy.runtime.ts.
-- Values: 'fast_food' | 'pizza_italian' | 'asian' | 'polish' | 'grill' | 'desserts_cafe'
-- Nullable: NO — empty array = unclassified (not null).
-- Backfill: backfill-restaurants-taxonomy.ts fills via mapRestaurantToFeatures().
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS taxonomy_groups TEXT[] DEFAULT '{}';

-- ── 5. taxonomy_cats ─────────────────────────────────────────
-- Pre-computed L2 CategoryID[] from taxonomy.runtime.ts.
-- Values: 'sushi' | 'pizza' | 'burgers' | 'kebab' | ... (full list in taxonomy.runtime.ts)
-- Nullable: NO — empty array = unclassified.
-- Backfill: backfill-restaurants-taxonomy.ts fills via mapRestaurantToFeatures().
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS taxonomy_cats TEXT[] DEFAULT '{}';

-- ── 6. taxonomy_tags ─────────────────────────────────────────
-- Pre-computed CoreTags per restaurant.
-- Values: 'spicy' | 'vege' | 'quick' | 'delivery'
-- NOTE: 'open_now' is NEVER stored here — it is always runtime-only.
-- Nullable: NO — empty array = no known tags.
-- Backfill: backfill-restaurants-taxonomy.ts fills (filters out 'open_now').
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS taxonomy_tags TEXT[] DEFAULT '{}';

-- ── 7. opening_hours — SKIPPED ───────────────────────────────
-- opening_hours (JSONB nullable) already exists in production.
-- Format is already in place. No migration needed.
-- Population of hours data remains a manual operator task (unchanged).

COMMIT;

-- ============================================================
-- POST-BACKFILL: Indexes (run separately after backfill completes)
-- Do NOT run at migration time — columns will be mostly empty '{}' arrays.
-- ============================================================

-- CREATE INDEX IF NOT EXISTS idx_restaurants_taxonomy_groups
--   ON restaurants USING GIN (taxonomy_groups);

-- CREATE INDEX IF NOT EXISTS idx_restaurants_taxonomy_cats
--   ON restaurants USING GIN (taxonomy_cats);

-- CREATE INDEX IF NOT EXISTS idx_restaurants_taxonomy_tags
--   ON restaurants USING GIN (taxonomy_tags);

-- CREATE INDEX IF NOT EXISTS idx_restaurants_delivery
--   ON restaurants (supports_delivery)
--   WHERE supports_delivery = TRUE;
