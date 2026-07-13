-- Migration 001: Dodanie kolumn taxonomy_vibes i taxonomy_dietarys do tabeli restaurants
-- Data: 2026-05-01
-- Projekt: FreeFlow (ezemaacyyvbpjlagchds)
--
-- Wykonaj w Supabase SQL Editor:
--   https://supabase.com/dashboard/project/ezemaacyyvbpjlagchds/sql/new

ALTER TABLE restaurants
ADD COLUMN IF NOT EXISTS taxonomy_vibes TEXT[] DEFAULT '{}';

ALTER TABLE restaurants
ADD COLUMN IF NOT EXISTS taxonomy_dietarys TEXT[] DEFAULT '{}';

-- Weryfikacja
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'restaurants'
  AND column_name LIKE 'taxonomy%';
