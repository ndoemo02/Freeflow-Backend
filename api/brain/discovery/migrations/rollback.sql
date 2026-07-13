-- ============================================================
-- ROLLBACK: rollback.sql
-- Covers:   stage-a-restaurants.sql + stage-b-menu-items-v2.sql
-- Type:     DESTRUCTIVE — drops added columns and constraints only
--           (does NOT touch original columns or data)
-- Status:   DRAFT — NOT EXECUTED
-- Date:     2026-04-09
--
-- SAFETY RULES before running rollback:
--   1. Confirm no application code is reading the new columns in production.
--   2. Confirm repository.js SELECT has NOT yet been expanded to include new columns.
--   3. Rollback is safe if run BEFORE or immediately AFTER migration (no backfill data loss concern).
--   4. After backfill has run: dropping taxonomy_* columns loses computed data.
--      In that case, prefer zeroing-out over dropping (see "Safe Partial Rollback" below).
-- ============================================================

BEGIN;

-- ════════════════════════════════════════════════════════════
-- STAGE A ROLLBACK — restaurants
-- ════════════════════════════════════════════════════════════

-- Drop constraint before dropping column (Postgres requires this order)
ALTER TABLE restaurants
  DROP CONSTRAINT IF EXISTS chk_restaurants_price_level;

ALTER TABLE restaurants
  DROP COLUMN IF EXISTS opening_hours,
  DROP COLUMN IF EXISTS taxonomy_tags,
  DROP COLUMN IF EXISTS taxonomy_cats,
  DROP COLUMN IF EXISTS taxonomy_groups,
  DROP COLUMN IF EXISTS supports_delivery,
  DROP COLUMN IF EXISTS price_level,
  DROP COLUMN IF EXISTS description;

-- ════════════════════════════════════════════════════════════
-- STAGE B ROLLBACK — menu_items_v2
-- ════════════════════════════════════════════════════════════

ALTER TABLE menu_items_v2
  DROP CONSTRAINT IF EXISTS chk_menu_items_popularity_score;

ALTER TABLE menu_items_v2
  DROP COLUMN IF EXISTS popularity_score,
  DROP COLUMN IF EXISTS dietary_flags,
  DROP COLUMN IF EXISTS item_tags,
  DROP COLUMN IF EXISTS item_aliases,
  DROP COLUMN IF EXISTS item_variant,
  DROP COLUMN IF EXISTS item_family,
  DROP COLUMN IF EXISTS base_name;

-- NOTE: base_name may have existed before Stage B migration in some environments.
-- If base_name was a pre-existing column, remove it from this DROP list before running.

COMMIT;

-- ============================================================
-- INDEX ROLLBACK (run only if post-backfill indexes were created)
-- ============================================================

-- DROP INDEX IF EXISTS idx_restaurants_taxonomy_groups;
-- DROP INDEX IF EXISTS idx_restaurants_taxonomy_cats;
-- DROP INDEX IF EXISTS idx_restaurants_taxonomy_tags;
-- DROP INDEX IF EXISTS idx_restaurants_delivery;
-- DROP INDEX IF EXISTS idx_menu_item_family;
-- DROP INDEX IF EXISTS idx_menu_item_aliases;
-- DROP INDEX IF EXISTS idx_menu_item_tags;

-- ============================================================
-- SAFE PARTIAL ROLLBACK — use when backfill has run and data loss is unacceptable
-- Zeroes out computed values without dropping columns.
-- Keeps columns intact so no code changes needed.
-- ============================================================

-- UPDATE restaurants SET
--   taxonomy_groups   = '{}',
--   taxonomy_cats     = '{}',
--   taxonomy_tags     = '{}',
--   supports_delivery = FALSE,
--   opening_hours     = NULL;
-- -- NOTE: do NOT zero out price_level — it may be pre-existing data.

-- UPDATE menu_items_v2 SET
--   item_family     = NULL,
--   item_variant    = NULL,
--   item_aliases    = '{}',
--   item_tags       = '{}',
--   dietary_flags   = '{}',
--   popularity_score = 0;
