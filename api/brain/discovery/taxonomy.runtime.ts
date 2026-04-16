/**
 * taxonomy.runtime.ts
 * ─────────────────────────────────────────────────────────────
 * Statyczny config taksonomii na podstawie:
 * freeflow-food-taxonomy.md v2 (source of truth)
 *
 * NIE wymaga migracji DB. Działa jako warstwa runtime.
 * Importuj z tego pliku — nie hardcoduj keywords w handlerach.
 * ─────────────────────────────────────────────────────────────
 */

// ─── L1: Top Groups ──────────────────────────────────────────

export type TopGroupID =
  | 'fast_food'
  | 'pizza_italian'
  | 'asian'
  | 'polish'
  | 'grill'
  | 'desserts_cafe';

// ─── L2: Categories (dzieci L1) ──────────────────────────────

export type CategoryID =
  // fast_food
  | 'burgers' | 'kebab' | 'pizza_takeaway' | 'hot_snacks'
  // pizza_italian
  | 'pizza' | 'pasta' | 'risotto'
  // asian
  | 'sushi' | 'ramen_noodles' | 'vietnamese' | 'chinese' | 'thai'
  // polish
  | 'pierogi' | 'zupy' | 'tradycyjne'
  // grill
  | 'kebab_grill' | 'steak' | 'bbq'
  // desserts_cafe
  | 'cafe' | 'cake_bakery' | 'ice_cream';

// ─── Core Tags (cross-cutting) ────────────────────────────────
// Tylko 5 tagów na teraz. Reszta (dietary, vibe) — w kolejnym kroku.

export type CoreTag = 'spicy' | 'vege' | 'quick' | 'open_now' | 'delivery';

// ─── Parsed Query — output parsera ───────────────────────────

export interface ParsedQuery {
  topGroups: TopGroupID[];     // L1 matches z zapytania
  categories: CategoryID[];    // L2 matches z zapytania
  tags: CoreTag[];             // cross-cutting tagi z zapytania
  open_now: boolean;           // wyekstrahowane osobno — nie jest tagiem filtrującym, jest flagą
  confidence: 'deterministic' | 'partial' | 'empty'; // ile sygnałów parser znalazł
  rawText: string;             // oryginalny tekst zapytania
}

// ─── Keyword maps (deterministic, bez LLM) ───────────────────
// Każde słowo kluczowe musi być samodzielnym tokenem PL.
// Używamy dopasowania na słowach (word-boundary safe) — patrz matchKeyword() w discoveryFilter.ts

export const TOP_GROUP_KEYWORDS: Record<TopGroupID, string[]> = {
  fast_food: [
    'fast food', 'burger', 'burgery', 'hot dog', 'hotdog',
    'zapiekanka', 'frytki', 'nuggets', 'szybkie jedzenie', 'na szybko',
  ],
  pizza_italian: [
    'pizza', 'pizzę', 'pizzy', 'pizzeria', 'pizzerii', 'pizzerię', 'pasta', 'spaghetti',
    'carbonara', 'bolognese', 'lasagne', 'risotto', 'włoska', 'włoskie',
  ],
  asian: [
    'sushi', 'ramen', 'wok', 'maki', 'nigiri', 'pho',
    'pad thai', 'dim sum', 'azjatyckie', 'azja', 'chińskie', 'chinka',
    'tajskie', 'japońskie', 'wietnamskie',
  ],
  polish: [
    'pierogi', 'żurek', 'barszcz', 'schabowy', 'bigos',
    'kotlet', 'rosół', 'gołąbki', 'polskie', 'polska kuchnia', 'domowe', 'tradycyjne',
  ],
  grill: [
    'kebab', 'döner', 'doner', 'stek', 'steki', 'wołowina',
    'żeberka', 'bbq', 'z rusztu', 'grill', 'grillowane',
  ],
  desserts_cafe: [
    'kawa', 'kawę', 'cappuccino', 'latte', 'espresso',
    'ciasto', 'tort', 'lody', 'naleśniki', 'waffle', 'gofry',
    'deser', 'desery', 'kawiarnia', 'cukiernia',
  ],
};

export const CATEGORY_KEYWORDS: Record<CategoryID, string[]> = {
  // fast_food
  burgers:       ['burger', 'burgery', 'hamburger', 'cheeseburger', 'smash burger'],
  kebab:         ['kebab', 'döner', 'doner', 'shawarma', 'falafel', 'gyros'],
  pizza_takeaway:['pizza na wynos', 'pizza z dostawą'],
  hot_snacks:    ['frytki', 'nuggets', 'hot dog', 'hotdog', 'zapiekanka', 'tortilla'],

  // pizza_italian
  pizza:         ['pizza', 'pizzę', 'pizzy', 'pizzeria', 'pizzerii', 'pizzerię', 'neapolitańska', 'margarita'],
  pasta:         ['pasta', 'spaghetti', 'carbonara', 'bolognese', 'lasagne', 'tagliatelle'],
  risotto:       ['risotto', 'bruschetta', 'tiramisu'],

  // asian
  sushi:         ['sushi', 'maki', 'nigiri', 'temaki', 'sashimi', 'uramaki', 'japońskie'],
  ramen_noodles: ['ramen', 'udon', 'soba', 'pad thai', 'lo mein', 'makaron azjatycki'],
  vietnamese:    ['pho', 'bun bo', 'banh mi', 'wietnamskie', 'wietnam'],
  chinese:       ['chińskie', 'wok', 'dim sum', 'chow mein', 'chinka'],
  thai:          ['tajskie', 'pad thai', 'green curry', 'tom yum'],

  // polish
  pierogi:       ['pierogi', 'kopytka', 'uszka'],
  zupy:          ['żurek', 'barszcz', 'rosół', 'zupa', 'flaki', 'grochówka', 'zupy'],
  tradycyjne:    ['schabowy', 'bigos', 'kotlet', 'gołąbki', 'zrazy', 'tradycyjne'],

  // grill
  kebab_grill:   ['kebab z grilla', 'kebab sit-down'],
  steak:         ['stek', 'steki', 'wołowina', 't-bone', 'ribeye', 'antrykot'],
  bbq:           ['bbq', 'żeberka', 'pulled pork', 'smoker', 'wędzony'],

  // desserts_cafe
  cafe:          ['kawa', 'kawę', 'espresso', 'cappuccino', 'latte', 'americano', 'kawiarnia'],
  cake_bakery:   ['ciasto', 'tort', 'croissant', 'muffin', 'chleb', 'piekarnia', 'cukiernia'],
  ice_cream:     ['lody', 'gelato', 'naleśniki', 'waffle', 'gofry'],
};

export const CORE_TAG_KEYWORDS: Record<CoreTag, string[]> = {
  spicy:    ['ostre', 'pikantne', 'pikantny', 'chilli', 'sriracha', 'piekące'],
  vege:     ['wege', 'wegetariańskie', 'wegetariański', 'bez mięsa', 'wegańskie', 'vegan', 'roślinne'],
  quick:    ['szybko', 'szybkie', 'szybki', 'na szybko', 'express', 'fast'],
  open_now: ['teraz', 'otwarte', 'otwarta', 'czynne', 'czynna', 'otwarta teraz', 'czy otwarte'],
  delivery: ['dostawa', 'dowóz', 'przynieś', 'wolt', 'uber eats', 'glovo', 'z dostawą', 'na wynos z dostawą'],
};

// ─── Pomocniczy typ dla adapterów ────────────────────────────

export interface TaxonomyMatch {
  topGroups: TopGroupID[];
  categories: CategoryID[];
  tags: CoreTag[];
}
