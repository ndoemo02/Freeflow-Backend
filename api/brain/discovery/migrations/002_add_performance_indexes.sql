-- ============================================================================
-- 002_add_performance_indexes.sql
-- ────────────────────────────────────────────────────────────────────────────
-- Indeksy wydajnościowe dla discovery flow (find_nearby).
--
-- Problem: ILIKE '%city%' i ILIKE '%cuisine_type%' wykonują sequential scan
-- na tabeli restaurants. Bounding-box query (lat/lng) również bez indexu.
--
-- Rozwiązanie:
--   1. GIN trigram index na city → przyspiesza ILIKE '%...%'
--   2. GIN trigram index na cuisine_type → j/w
--   3. Composite index na (lat, lng) → przyspiesza bounding-box queries
--
-- Instalacja: skopiuj i uruchom w Supabase SQL Editor.
-- Czas wykonania: ~100ms na 10-100 wierszach, ~2s na 100k+ wierszach.
-- ============================================================================

-- Włącz rozszerzenie pg_trgm (jeśli jeszcze nie włączone)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 1. GIN trigram index dla ILIKE '%city%'
--    Bez indexu: Seq Scan (100ms+ na małej tabeli)
--    Z indexem:  Bitmap Index Scan (<5ms)
CREATE INDEX IF NOT EXISTS idx_restaurants_city_trgm
    ON restaurants USING GIN (city gin_trgm_ops);

-- 2. GIN trigram index dla ILIKE '%cuisine_type%'
CREATE INDEX IF NOT EXISTS idx_restaurants_cuisine_type_trgm
    ON restaurants USING GIN (cuisine_type gin_trgm_ops);

-- 3. Composite index na (lat, lng) dla bounding-box queries
--    Zapytania typu: WHERE lat BETWEEN x AND y AND lng BETWEEN a AND b
CREATE INDEX IF NOT EXISTS idx_restaurants_lat_lng
    ON restaurants (lat, lng);

-- 4. Index na menu_items_v2.restaurant_id (dla fetchCityMenuRows)
--    Zapytania: WHERE restaurant_id IN (...)
CREATE INDEX IF NOT EXISTS idx_menu_items_v2_restaurant_id
    ON menu_items_v2 (restaurant_id);
