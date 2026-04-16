/**
 * discoveryFilter.ts
 * ─────────────────────────────────────────────────────────────
 * Publiczne API (niezmienione — backward compatible):
 *
 *   matchQueryToTaxonomy(query)     → ParsedQuery
 *   filterRestaurantsByDiscovery()  → LegacyRestaurant[]  ← sorting dodany
 *   explainFilter()                 → { passed, score, reasons }
 *
 * Nowe publiczne API (addytywne):
 *
 *   scoreRestaurant(query, restaurant)   → number
 *   rankRestaurantsByDiscovery(q, list)  → ScoredRestaurant[]
 *   runDiscovery(query, restaurants)     → DiscoveryResult
 *
 * Scoring weights:
 *   topGroup match   +3
 *   category match   +2
 *   tag match        +1
 *   exact keyword    +2 (z rawText query → restaurant corpus)
 *   open_now boost   +3 (jeśli open_now requested i restauracja open)
 *
 * AND enforcement:
 *   Gdy confidence === 'deterministic' (structure + strict tags razem)
 *   → WSZYSTKIE tagi w zapytaniu traktowane jako hard requirement.
 *   Gdy confidence === 'partial'
 *   → tylko STRICT_TAGS (vege, delivery) są hard requirement.
 * ─────────────────────────────────────────────────────────────
 */

import {
  TopGroupID,
  CategoryID,
  CoreTag,
  ParsedQuery,
  TOP_GROUP_KEYWORDS,
  CATEGORY_KEYWORDS,
  CORE_TAG_KEYWORDS,
} from './taxonomy.runtime.js';

import {
  LegacyRestaurant,
  mapRestaurantToFeatures,
} from './restaurantFeatureAdapter.js';

// ─── Types ────────────────────────────────────────────────────

export interface ScoredRestaurant {
  restaurant: LegacyRestaurant;
  score: number;
  scoreBreakdown: ScoreBreakdown;
}

export interface ScoreBreakdown {
  topGroupScore: number;    // n * 3
  categoryScore: number;    // n * 2
  tagScore: number;         // n * 1
  keywordScore: number;     // n * 2 (exact text tokens)
  openNowBoost: number;     // 0 lub +3
  total: number;
}

export type DiscoveryFallback = 'llm' | null;

export interface DiscoveryResult {
  items: ScoredRestaurant[];          // posortowane score DESC
  fallback: DiscoveryFallback;        // 'llm' → przekaż do LLM refiner
  fallbackReason?: string;            // tylko gdy fallback !== null
  totalBeforeFilter: number;          // ile restauracji weszło na wejście
  totalAfterFilter: number;           // ile przeszło filtr
}

// ─── Scoring constants ────────────────────────────────────────

const SCORE = {
  TOP_GROUP:   3,
  CATEGORY:    2,
  TAG:         1,
  KEYWORD:     2,
  OPEN_NOW:    3,
} as const;

// Tagi które są hard requirement (AND) zawsze, niezależnie od confidence
const ALWAYS_STRICT_TAGS: CoreTag[] = ['vege', 'delivery'];

// ─── Query Matching (bez zmian API) ──────────────────────────

/**
 * matchQueryToTaxonomy
 *
 * Parsuje surowe zapytanie na ParsedQuery.
 * Deterministyczne — bez LLM.
 *
 * confidence:
 *   'deterministic' — ≥2 sygnały (parser wystarczający)
 *   'partial'       — 1 sygnał (parser niepewny, ale coś znalazł)
 *   'empty'         — 0 sygnałów (sygnał dla LLM fallback)
 */
export function matchQueryToTaxonomy(queryText: string): ParsedQuery {
  const text = queryText.toLowerCase().trim();

  const topGroups: TopGroupID[] = [];
  const categories: CategoryID[] = [];
  const tags: CoreTag[] = [];

  for (const [group, keywords] of Object.entries(TOP_GROUP_KEYWORDS) as [TopGroupID, string[]][]) {
    if (keywords.some(kw => text.includes(kw))) {
      topGroups.push(group);
    }
  }

  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS) as [CategoryID, string[]][]) {
    if (keywords.some(kw => text.includes(kw))) {
      categories.push(cat);
    }
  }

  for (const [tag, keywords] of Object.entries(CORE_TAG_KEYWORDS) as [CoreTag, string[]][]) {
    if (keywords.some(kw => text.includes(kw))) {
      tags.push(tag);
    }
  }

  const open_now = CORE_TAG_KEYWORDS.open_now.some(kw => text.includes(kw));

  const signalCount = topGroups.length + categories.length + tags.length;
  const confidence: ParsedQuery['confidence'] =
    signalCount === 0 ? 'empty'  :
    signalCount >= 2  ? 'deterministic' :
                        'partial';

  return { topGroups, categories, tags, open_now, confidence, rawText: queryText };
}

// ─── Scoring ──────────────────────────────────────────────────

/**
 * tokenizeQuery
 *
 * Wyciąga użyteczne tokeny z rawText zapytania.
 * Używane do "exact keyword match" bonusu.
 * Filtruje stop-words i tokeny < 4 znaki (unikamy false-positive na "na", "do", "z").
 */
function tokenizeQuery(rawText: string): string[] {
  const STOPWORDS = new Set([
    'jest', 'mam', 'mają', 'coś', 'proszę', 'poproszę',
    'chcę', 'chciałbym', 'chciałabym', 'dajcie', 'podaj',
    'teraz', 'dzisiaj', 'jutro', 'gdzie', 'jakie', 'czy',
    'macie', 'możecie', 'może', 'proszę', 'bardzo', 'dobrze',
    'dziś', 'trochę', 'jakieś', 'jakiś', 'będzie',
  ]);

  return rawText
    .toLowerCase()
    .replace(/[.,?!;:()\[\]"']/g, ' ')
    .split(/\s+/)
    .filter(token => token.length >= 4 && !STOPWORDS.has(token));
}

/**
 * buildRestaurantCorpus
 *
 * Pobiera corpus tekstowy restauracji (uproszczona wersja — nie duplikuje logiki adaptera).
 * Używany tylko do exact keyword match scoring.
 */
function buildRestaurantCorpus(r: LegacyRestaurant): string {
  const parts: string[] = [];
  if (r.name)         parts.push(r.name);
  if (r.cuisine_type) parts.push(r.cuisine_type);
  if (r.description)  parts.push(r.description);
  if (Array.isArray(r.tags)) parts.push(...r.tags);
  if (r.menu) {
    try {
      parts.push(typeof r.menu === 'string' ? r.menu : JSON.stringify(r.menu));
    } catch { /* ignore */ }
  }
  return parts.join(' ').toLowerCase();
}

/**
 * scoreRestaurant
 *
 * Oblicza numeryczny score dopasowania restauracji do zapytania.
 * Wyższy score = lepsze dopasowanie.
 *
 * Nie filtruje — tylko ocenia. Filtrowanie → filterRestaurantsByDiscovery().
 */
export function scoreRestaurant(
  parsedQuery: ParsedQuery,
  r: LegacyRestaurant,
): ScoreBreakdown {
  const features = mapRestaurantToFeatures(r);
  const corpus = buildRestaurantCorpus(r);

  // topGroup matches
  const matchedGroups = parsedQuery.topGroups.filter(g => features.topGroups.includes(g));
  const topGroupScore = matchedGroups.length * SCORE.TOP_GROUP;

  // category matches
  const matchedCategories = parsedQuery.categories.filter(c => features.categories.includes(c));
  const categoryScore = matchedCategories.length * SCORE.CATEGORY;

  // tag matches (bez open_now — jest osobno)
  const queryTagsWithoutOpenNow = parsedQuery.tags.filter(t => t !== 'open_now');
  const matchedTags = queryTagsWithoutOpenNow.filter(t => features.tags.includes(t));
  const tagScore = matchedTags.length * SCORE.TAG;

  // exact keyword match — tokeny z rawText które trafiają w corpus restauracji
  const queryTokens = tokenizeQuery(parsedQuery.rawText);
  const uniqueMatchedTokens = new Set(queryTokens.filter(token => corpus.includes(token)));
  // Cap na 3 tokeny żeby nie inflation-ować score przy długich zapytaniach
  const keywordScore = Math.min(uniqueMatchedTokens.size, 3) * SCORE.KEYWORD;

  // open_now boost — SOFT: nie eliminuje, tylko boost gdy restaurant open
  let openNowBoost = 0;
  if (parsedQuery.open_now) {
    // Sprawdzamy czy restauracja ma open_now tag (inferencja z corpus: "otwarte", "czynne", etc.)
    if (features.tags.includes('open_now')) {
      openNowBoost = SCORE.OPEN_NOW;
    }
    // Nie ma tagu → brak penalty, brak boost
    // (runtime check godzin pracy powinien być w findHandler.js)
  }

  const total = topGroupScore + categoryScore + tagScore + keywordScore + openNowBoost;

  return {
    topGroupScore,
    categoryScore,
    tagScore,
    keywordScore,
    openNowBoost,
    total,
  };
}

// ─── Filtering (backward-compatible + sort by score) ─────────

/**
 * shouldIncludeRestaurant
 *
 * Predykat filtrowania — separacja od scoringu.
 *
 * AND enforcement rules:
 *
 *   confidence === 'deterministic' AND query has structure (topGroups/categories) AND has tags
 *   → WSZYSTKIE tagi są hard requirement (spicy, quick też).
 *   Rationale: user powiedział wyraźnie "ostre sushi z dostawą" — wszystkie 3 warunki muszą być spełnione.
 *
 *   confidence === 'partial' OR brak struktury
 *   → tylko ALWAYS_STRICT_TAGS (vege, delivery) są hard requirement.
 *   Rationale: user powiedział tylko "ostre" → preferuj, ale nie eliminuj.
 */
function shouldIncludeRestaurant(
  parsedQuery: ParsedQuery,
  r: LegacyRestaurant,
): boolean {
  const features = mapRestaurantToFeatures(r);

  const hasStructure = parsedQuery.topGroups.length > 0 || parsedQuery.categories.length > 0;
  const hasStrictTags = parsedQuery.tags.some(t => ALWAYS_STRICT_TAGS.includes(t));
  const enforceAllTags =
    parsedQuery.confidence === 'deterministic' && hasStructure && hasStrictTags;

  // 1. topGroups — OR: przynajmniej jedna
  if (parsedQuery.topGroups.length > 0) {
    if (!parsedQuery.topGroups.some(g => features.topGroups.includes(g))) return false;
  }

  // 2. categories — OR: przynajmniej jedna
  if (parsedQuery.categories.length > 0) {
    if (!parsedQuery.categories.some(c => features.categories.includes(c))) return false;
  }

  // 3. Tags enforcement
  const tagsToEnforce = enforceAllTags
    ? parsedQuery.tags                  // wszystkie tagi jako AND
    : ALWAYS_STRICT_TAGS.filter(t => parsedQuery.tags.includes(t)); // tylko strict

  for (const tag of tagsToEnforce) {
    if (tag === 'open_now') continue;   // open_now nigdy nie filtruje — jest boost-only
    if (!features.tags.includes(tag)) return false;
  }

  return true;
}

/**
 * filterRestaurantsByDiscovery
 *
 * ← Backward-compatible: ta sama sygnatura, zwraca LegacyRestaurant[].
 *
 * Zmiany vs poprzednia wersja:
 *  - wyniki są sortowane score DESC
 *  - AND enforcement zależy od confidence (nie tylko od STRICT_TAGS hardcoded)
 *  - confidence === 'empty' → brak filtrów, oryginalna kolejność (brak danych = brak ranku)
 */
export function filterRestaurantsByDiscovery(
  parsedQuery: ParsedQuery,
  restaurants: LegacyRestaurant[],
): LegacyRestaurant[] {
  if (parsedQuery.confidence === 'empty') {
    return restaurants; // brak sygnałów → nie filtruj, nie sortuj
  }

  const filtered = restaurants.filter(r => shouldIncludeRestaurant(parsedQuery, r));

  // Sort by score DESC
  filtered.sort((a, b) => {
    const scoreA = scoreRestaurant(parsedQuery, a).total;
    const scoreB = scoreRestaurant(parsedQuery, b).total;
    return scoreB - scoreA;
  });

  return filtered;
}

// ─── Ranking (nowe API — addytywne) ──────────────────────────

/**
 * rankRestaurantsByDiscovery
 *
 * Jak filterRestaurantsByDiscovery, ale zwraca ScoredRestaurant[] z pełnym breakdown.
 * Używaj gdy potrzebujesz wiedzieć DLACZEGO restauracja dostała dany score.
 */
export function rankRestaurantsByDiscovery(
  parsedQuery: ParsedQuery,
  restaurants: LegacyRestaurant[],
): ScoredRestaurant[] {
  if (parsedQuery.confidence === 'empty') {
    // Brak sygnałów → score = 0 dla wszystkich, oryginalna kolejność
    return restaurants.map(r => ({
      restaurant: r,
      score: 0,
      scoreBreakdown: { topGroupScore: 0, categoryScore: 0, tagScore: 0, keywordScore: 0, openNowBoost: 0, total: 0 },
    }));
  }

  const results: ScoredRestaurant[] = [];

  for (const r of restaurants) {
    if (!shouldIncludeRestaurant(parsedQuery, r)) continue;
    const breakdown = scoreRestaurant(parsedQuery, r);
    results.push({ restaurant: r, score: breakdown.total, scoreBreakdown: breakdown });
  }

  results.sort((a, b) => b.score - a.score);
  return results;
}

// ─── Main Orchestrator ────────────────────────────────────────

/**
 * runDiscovery
 *
 * Główny entry point dla warstwy discovery.
 * Łączy filtrowanie + ranking + obsługę fallback.
 *
 * Użycie w findHandler.js (OPCJONALNE — nie breaking):
 *   const result = runDiscovery(parsedQuery, restaurantsFromDB);
 *   if (result.fallback === 'llm') { ... pass to LLM refiner ... }
 *   else { const ranked = result.items; ... }
 *
 * @returns DiscoveryResult z ScoredRestaurant[] lub fallback signal
 */
export function runDiscovery(
  parsedQuery: ParsedQuery,
  restaurants: LegacyRestaurant[],
): DiscoveryResult {

  // LLM Fallback Signal — jeśli parser nic nie znalazł
  if (parsedQuery.confidence === 'empty') {
    return {
      items: [],
      fallback: 'llm',
      fallbackReason: `Parser nie znalazł żadnych sygnałów taksonomicznych w: "${parsedQuery.rawText}". Przekaż do LLM refiner.`,
      totalBeforeFilter: restaurants.length,
      totalAfterFilter: 0,
    };
  }

  const ranked = rankRestaurantsByDiscovery(parsedQuery, restaurants);

  return {
    items: ranked,
    fallback: null,
    totalBeforeFilter: restaurants.length,
    totalAfterFilter: ranked.length,
  };
}

// ─── Debug helper ─────────────────────────────────────────────

/**
 * explainFilter
 * Zwraca szczegółowy log dla jednej restauracji.
 * Rozszerzone vs poprzednia wersja — zawiera score breakdown.
 */
export function explainFilter(
  parsedQuery: ParsedQuery,
  r: LegacyRestaurant,
): { passed: boolean; score: number; reasons: string[] } {
  const features = mapRestaurantToFeatures(r);
  const breakdown = scoreRestaurant(parsedQuery, r);
  const reasons: string[] = [];
  const passed = shouldIncludeRestaurant(parsedQuery, r);

  const hasStructure = parsedQuery.topGroups.length > 0 || parsedQuery.categories.length > 0;
  const hasStrictTags = parsedQuery.tags.some(t => ALWAYS_STRICT_TAGS.includes(t));
  const enforceAllTags = parsedQuery.confidence === 'deterministic' && hasStructure && hasStrictTags;

  reasons.push(`Features: topGroups=[${features.topGroups}] categories=[${features.categories}] tags=[${features.tags}]`);
  reasons.push(`Score: ${breakdown.total} (group:${breakdown.topGroupScore} cat:${breakdown.categoryScore} tag:${breakdown.tagScore} kw:${breakdown.keywordScore} open:${breakdown.openNowBoost})`);
  reasons.push(`AND mode: ${enforceAllTags ? 'ALL tags enforced (deterministic)' : 'only strict tags (vege/delivery)'}`);

  if (parsedQuery.topGroups.length > 0) {
    const match = parsedQuery.topGroups.some(g => features.topGroups.includes(g));
    reasons.push(`topGroups [${parsedQuery.topGroups}]: ${match ? '✓' : '✗'}`);
  }

  if (parsedQuery.categories.length > 0) {
    const match = parsedQuery.categories.some(c => features.categories.includes(c));
    reasons.push(`categories [${parsedQuery.categories}]: ${match ? '✓' : '✗'}`);
  }

  const relevantTags = enforceAllTags
    ? parsedQuery.tags
    : ALWAYS_STRICT_TAGS.filter(t => parsedQuery.tags.includes(t));

  for (const tag of relevantTags) {
    if (tag === 'open_now') continue;
    const match = features.tags.includes(tag);
    reasons.push(`tag [${tag}] (${enforceAllTags ? 'AND-enforced' : 'strict'}): ${match ? '✓' : '✗'}`);
  }

  return { passed, score: breakdown.total, reasons };
}
