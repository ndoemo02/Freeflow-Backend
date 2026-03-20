/**
 * recoEngine.js  —  Reco V1: Rule-based dish recommendation engine
 * ─────────────────────────────────────────────────────────────────
 * Pure in-memory scoring; zero extra DB calls.
 * Gate: process.env.RECO_V1_ENABLED === 'true'
 * Debug: process.env.RECO_V1_DEBUG  === 'true'
 *
 * Scoring dimensions (weights must sum to 1.0):
 *   intentMatch   0.45  – item matches what user mentioned
 *   popularity    0.20  – menu position proxy (higher = more curated)
 *   priceBand     0.20  – mid-range value sweet-spot
 *   timeOfDay     0.15  – breakfast/lunch/dinner alignment
 */

const WEIGHTS = {
  intentMatch: 0.45,
  popularity:  0.20,
  priceBand:   0.20,
  timeOfDay:   0.15,
};

// Intents where recommendations make sense (menu is visible)
const RECO_ELIGIBLE_INTENTS = new Set([
  'menu_request', 'show_menu', 'create_order', 'choose_restaurant',
  'confirm_add_to_cart', 'recommend',
]);

// ── Scoring helpers ────────────────────────────────────────────────

function scoreIntentMatch(item, targetItems) {
  if (!targetItems || !targetItems.length) return 0;
  const name = (item.name || '').toLowerCase();
  const cat  = (item.category || '').toLowerCase();
  for (const raw of targetItems) {
    const tok = String(raw || '').toLowerCase().trim();
    if (!tok || tok.length < 2) continue;
    if (name.includes(tok) || tok.includes(name) || cat.includes(tok)) return 1.0;
    // Partial prefix overlap (≥3 chars)
    if (tok.length >= 3 && name.includes(tok.slice(0, 3))) return 0.5;
  }
  return 0;
}

function scorePriceBand(item, allItems) {
  const prices = allItems.map(i => Number(i.price_pln ?? i.price ?? 0)).filter(p => p > 0);
  if (!prices.length) return 0.5;
  const min   = Math.min(...prices);
  const range = Math.max(...prices) - min || 1;
  const p     = Number(item.price_pln ?? item.price ?? 0);
  // Bell curve: peak at 0.40 of price range (value-for-money sweet-spot)
  return Math.max(0, Math.min(1, 1 - Math.abs((p - min) / range - 0.40) * 1.5));
}

function scoreTimeOfDay(item) {
  const hour = new Date().getHours();
  const text = `${item.name || ''} ${item.category || ''}`.toLowerCase();

  const isBreakfast = /śniadanie|jajka?|naleśnik|granola|jogurt|owsianka|kanapka|tost/.test(text);
  const isLunch     = /zupa|sałat|lunch|lekk|pierogi/.test(text);
  const isDinner    = /obiad|kolacja|steak|stek|kotlet|filet|burger|pizza|pasta/.test(text);

  if (hour >= 6  && hour < 11) return isBreakfast ? 1.0 : isDinner ? 0.3 : 0.6;
  if (hour >= 11 && hour < 16) return isLunch ? 1.0 : isBreakfast ? 0.4 : 0.7;
  return isDinner ? 1.0 : isBreakfast ? 0.3 : 0.6;
}

function scorePopularity(index, total) {
  // Earlier positions in menu = stronger restaurant curation signal
  return 1 - (index / Math.max(total - 1, 1)) * 0.8;
}

function buildWhy(scores) {
  if (scores.intentMatch >= 0.8)  return 'Pasuje do Twojego zamówienia';
  if (scores.timeOfDay  >= 0.9)  return 'Polecane na tę porę dnia';
  if (scores.priceBand  >= 0.70) return 'Dobry stosunek ceny do jakości';
  return 'Popularne danie w tej restauracji';
}

// ── Public API ─────────────────────────────────────────────────────

/**
 * Returns top recommendations (≤5) scored against already-fetched menu items.
 *
 * @param {object[]} menuItems   - Items from DB; available:false are filtered defensively.
 * @param {object}   opts
 * @param {string}     opts.intent      - Current NLU intent (guards eligibility)
 * @param {string[]}   opts.targetItems - User-mentioned tokens (e.g. ['burger','frytki'])
 * @param {number}     opts.topN        - Max results (default 5, hard cap 5)
 * @returns {{ item: object, score: number, why: string }[]}
 */
export function getRecommendations(menuItems, { intent = '', targetItems = [], topN = 5 } = {}) {
  if (!Array.isArray(menuItems) || !menuItems.length) return [];

  // Skip intents where recommendations don't belong
  if (intent && !RECO_ELIGIBLE_INTENTS.has(intent)) return [];

  // Defensive availability filter
  const candidates = menuItems.filter(i => i.available !== false && i.is_available !== false);
  if (!candidates.length) return [];

  const scored = candidates.map((item, index) => {
    const scores = {
      intentMatch: scoreIntentMatch(item, targetItems),
      popularity:  scorePopularity(index, candidates.length),
      priceBand:   scorePriceBand(item, candidates),
      timeOfDay:   scoreTimeOfDay(item),
    };
    const total = Object.entries(WEIGHTS).reduce((acc, [k, w]) => acc + (scores[k] || 0) * w, 0);
    return { item, score: total, scores, why: buildWhy(scores) };
  });

  scored.sort((a, b) => b.score - a.score);

  const cap = Math.min(Math.max(1, topN), 5);
  const top = scored.slice(0, cap);

  if (process.env.RECO_V1_DEBUG === 'true') {
    console.log('[RECO_V1] Top picks:', top.map(r => ({
      name: r.item.name,
      score: r.score.toFixed(3),
      why: r.why,
    })));
  }

  return top.map(({ item, score, why }) => ({ item, score, why }));
}

// Expose weight config for tests / admin introspection
export { WEIGHTS, RECO_ELIGIBLE_INTENTS };
