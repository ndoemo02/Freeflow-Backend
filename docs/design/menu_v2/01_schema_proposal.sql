-- SCHEMA PROPOSAL FOR MENU_V2 TOKENIZATION
-- Context: FreeFlow / Menu Items V2
-- Database: Supabase (PostgreSQL)
-- DESIGN DOCUMENT ONLY: do not run this file directly on the demo database.
-- Convert the accepted design into an idempotent, reviewed migration first.

-- 1. Table: ingredients
-- Przechowuje atomowe składniki używane w daniach.
CREATE TABLE ingredients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    -- Lista aliasów dla NLP/Search (np. ["ogórek", "ogórka", "kiszonego"])
    aliases JSONB DEFAULT '[]'::jsonb,
    -- Flagi w formacie JSONB dla elastyczności (allergen, meat, veg, vegan, spicy)
    flags JSONB DEFAULT '{}'::jsonb,
    -- Bazowa cena składnika (gdy dodawany jako extra, jeśli nie nadpisana w menu_item)
    price_pln NUMERIC(10, 2) DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Indeks GIN na aliasy dla szybkiego wyszukiwania @>
CREATE INDEX idx_ingredients_aliases ON ingredients USING GIN (aliases);
-- Indeks GIN na flagi (np. wyszukiwanie wegańskich)
CREATE INDEX idx_ingredients_flags ON ingredients USING GIN (flags);


-- 2. Table: modifiers
-- Przechowuje "sztywne" modyfikatory niebędące prostymi składnikami (np. Rozmiar, Stopień wypieczenia).
-- UWAGA: Akcje typu "Bez X", "Extra X" (gdzie X to składnik) są obsługiwane przez logikę ingredient_id + action, nie tutaj.
CREATE TABLE modifiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL, -- np. "Rozmiar Duży", "Ciasto Cienkie"
    -- Typ modyfikatora: SIZE, VARIANT, PREPARATION, OPTION
    type TEXT NOT NULL CHECK (type IN ('SIZE', 'VARIANT', 'PREPARATION', 'OPTION')),
    aliases JSONB DEFAULT '[]'::jsonb,
    price_delta_pln NUMERIC(10, 2) DEFAULT 0.00, -- np. +10.00 PLN za dużą pizzę
    constraints JSONB DEFAULT '{}'::jsonb, -- opcjonalne metadane
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_modifiers_type ON modifiers(type);


-- 3. Table: menu_item_ingredients
-- Tabela łącząca (Join Table) definiująca skład dania.
-- Określa co jest w standardzie i co można zmienić.
CREATE TABLE menu_item_ingredients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    menu_item_id UUID NOT NULL REFERENCES menu_items_v2(id) ON DELETE CASCADE,
    ingredient_id UUID NOT NULL REFERENCES ingredients(id) ON DELETE RESTRICT,

    -- Czy składnik jest domyślnie w daniu?
    -- TRUE = Bazowy składnik (można zrobić REMOVE).
    -- FALSE = Opcjonalny dodatek (można zrobić ADD/EXTRA).
    default_included BOOLEAN DEFAULT TRUE,

    -- Czy klient może usunąć ten składnik? (dla default_included=TRUE)
    is_optional BOOLEAN DEFAULT TRUE,

    -- Ile razy można dodać ten składnik jako EXTRA? (0 = nie można dodać/podwoić)
    max_extra INTEGER DEFAULT 2,

    -- Nadpisanie ceny dla konkretnego dania (opcjonalne)
    price_override_pln NUMERIC(10, 2),

    UNIQUE(menu_item_id, ingredient_id)
);

CREATE INDEX idx_mii_menu_item_id ON menu_item_ingredients(menu_item_id);


-- 4. Table: menu_item_modifiers
-- Definiuje jakie "sztywne" modyfikatory są dostępne dla dania.
-- Np. Pizza Margherita -> [Rozmiar Mały, Rozmiar Duży]
CREATE TABLE menu_item_modifiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    menu_item_id UUID NOT NULL REFERENCES menu_items_v2(id) ON DELETE CASCADE,
    modifier_id UUID NOT NULL REFERENCES modifiers(id) ON DELETE RESTRICT,

    -- Czy jest to domyślna opcja? (np. Rozmiar Średni = default)
    is_default BOOLEAN DEFAULT FALSE,

    UNIQUE(menu_item_id, modifier_id)
);

CREATE INDEX idx_mim_menu_item_id ON menu_item_modifiers(menu_item_id);
