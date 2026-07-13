-- Supabase SQL: Funkcje RPC dla Amber Self-Learning
-- Ten plik zawiera funkcje potrzebne do działania systemu uczenia maszynowego Amber
-- MANUAL INSTALLATION ONLY: review schema, RLS and vector dimensions before execution.
-- This file is documentation and is not executed by the application or deployment.
--
-- INSTRUKCJA INSTALACJI:
-- 1. Otwórz Supabase Dashboard → SQL Editor
-- 2. Skopiuj i wykonaj poniższe zapytania SQL
-- 3. Upewnij się, że tabela `amber_knowledge` ma kolumnę `embedding` typu `vector(1536)`

-- ============================================================================
-- 1. ROZSZERZENIE pgvector (wymagane dla embeddings)
-- ============================================================================
-- Upewnij się, że rozszerzenie pgvector jest zainstalowane:
-- CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- 2. FUNKCJA RPC: match_learning_embeddings
-- ============================================================================
-- Wyszukuje podobne rekordy uczenia na podstawie embeddings (cosine similarity)
--
-- Parametry:
--   - query_embedding: vector(1536) - embedding tekstu do wyszukania
--   - match_threshold: float (0.0-1.0) - próg podobieństwa (0.78 = 78% podobieństwa)
--   - match_count: int - maksymalna liczba wyników
--
-- Zwraca:
--   - id, intent, input_text, feedback_score, similarity

CREATE OR REPLACE FUNCTION match_learning_embeddings(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.78,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  intent text,
  input_text text,
  feedback_score numeric,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ak.id,
    ak.intent,
    ak.input_text,
    ak.feedback_score,
    1 - (ak.embedding <=> query_embedding) as similarity
  FROM amber_knowledge ak
  WHERE ak.embedding IS NOT NULL
    AND 1 - (ak.embedding <=> query_embedding) > match_threshold
  ORDER BY ak.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ============================================================================
-- 3. INDEKS dla szybkiego wyszukiwania embeddings (OPCJONALNE, ale ZALECANE)
-- ============================================================================
-- Indeks HNSW znacznie przyspiesza wyszukiwanie podobnych embeddings
--
-- UWAGA: Tworzenie indeksu może zająć dużo czasu dla dużych tabel!
-- Użyj tego tylko jeśli masz dużo danych (>1000 rekordów)

-- CREATE INDEX IF NOT EXISTS amber_knowledge_embedding_idx
-- ON amber_knowledge
-- USING hnsw (embedding vector_cosine_ops)
-- WITH (m = 16, ef_construction = 64);

-- ============================================================================
-- 4. STRUKTURA TABELI amber_knowledge (referencja)
-- ============================================================================
-- Przykładowa struktura tabeli (jeśli jeszcze nie istnieje):
/*
CREATE TABLE IF NOT EXISTS amber_knowledge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL DEFAULT 'anonymous',
  intent text NOT NULL,
  input_text text NOT NULL,
  parsed_entities jsonb DEFAULT '{}',
  response text,
  feedback_score numeric CHECK (feedback_score >= 0 AND feedback_score <= 1),
  embedding vector(1536),  -- OpenAI text-embedding-3-small = 1536 wymiarów
  created_at timestamptz DEFAULT now()
);

-- Indeksy dla szybkiego wyszukiwania
CREATE INDEX IF NOT EXISTS idx_amber_knowledge_intent ON amber_knowledge(intent);
CREATE INDEX IF NOT EXISTS idx_amber_knowledge_feedback ON amber_knowledge(feedback_score);
CREATE INDEX IF NOT EXISTS idx_amber_knowledge_created_at ON amber_knowledge(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_amber_knowledge_user_id ON amber_knowledge(user_id);
*/
-- ============================================================================
-- 5. TEST FUNKCJI (OPCJONALNE)
-- ============================================================================
-- Test funkcji match_learning_embeddings:
/*
-- Najpierw dodaj przykładowy rekord z embeddingiem
INSERT INTO amber_knowledge (intent, input_text, feedback_score, embedding)
VALUES (
  'find_nearby',
  'Gdzie mogę zjeść w pobliżu?',
  1,
  -- Tutaj wstaw przykładowy embedding (1536 wartości)
  -- W rzeczywistości embedding będzie generowany przez OpenAI API
  '[0.1, 0.2, ...]'::vector(1536)
);

-- Następnie przetestuj wyszukiwanie:
SELECT * FROM match_learning_embeddings(
  '[0.1, 0.2, ...]'::vector(1536),  -- query embedding
  0.78,  -- threshold
  5  -- max results
);
*/

-- ============================================================================
-- UWAGI I WSKAZÓWKI
-- ============================================================================
-- 1. Rozmiar embeddings: OpenAI text-embedding-3-small używa 1536 wymiarów
-- 2. Threshold: 0.78 oznacza 78% podobieństwa (dopasuj do swoich potrzeb)
-- 3. Performance: HNSW indeks znacznie przyspiesza wyszukiwanie dla dużych zbiorów danych
-- 4. Fallback: Jeśli funkcja RPC nie działa, system użyje fallbackSimilaritySearch()
-- 5. Koszt: Generowanie embeddings kosztuje ~$0.02 za 1M tokenów (OpenAI)
