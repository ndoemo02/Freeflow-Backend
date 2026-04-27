import { supabase } from '../../_supabase.js';
import { normalizeDish, levenshtein } from '../helpers.js';

const DEFAULT_CACHE_TTL_MS = 60 * 1000;
const DEFAULT_SEARCH_LIMIT = 40;
const DEFAULT_MIN_SCORE = 0.42;
const DEFAULT_RESTAURANT_LIMIT = 4;

let indexCache = {
    expiresAt: 0,
    entries: [],
};

function normalizeIndexName(value = '') {
    return normalizeDish(String(value || ''));
}

function tokenize(value = '') {
    return normalizeIndexName(value)
        .split(' ')
        .map((token) => token.trim())
        .filter(Boolean);
}

function scoreTokenSimilarity(queryToken = '', targetToken = '') {
    if (!queryToken || !targetToken) return 0;
    if (queryToken === targetToken) return 1;
    if (targetToken.startsWith(queryToken) || queryToken.startsWith(targetToken)) return 0.88;
    if (queryToken.length >= 4 && targetToken.length >= 4 && levenshtein(queryToken, targetToken) <= 1) return 0.7;
    return 0;
}

export function scoreGlobalMenuEntry(inputText = '', entry = {}) {
    const query = normalizeIndexName(inputText);
    const target = normalizeIndexName(entry?.normalized_name || entry?.item_name || '');
    if (!query || !target) return 0;

    if (query === target) return 1.4;
    if (target.includes(query) || query.includes(target)) return 1.08;

    const queryTokens = tokenize(query);
    const targetTokens = tokenize(target);
    if (queryTokens.length === 0 || targetTokens.length === 0) return 0;

    let overlapScore = 0;
    for (const queryToken of queryTokens) {
        let best = 0;
        for (const targetToken of targetTokens) {
            best = Math.max(best, scoreTokenSimilarity(queryToken, targetToken));
            if (best === 1) break;
        }
        overlapScore += best;
    }

    const normalizedOverlap = overlapScore / queryTokens.length;
    const prefixBoost = target.startsWith(query) ? 0.18 : 0;
    const categoryBoost = normalizeIndexName(entry?.category || '').includes('pizza') && query.includes('pizza') ? 0.05 : 0;
    return normalizedOverlap + prefixBoost + categoryBoost;
}

function normalizeMenuRow(row = {}) {
    const itemName = String(row?.base_name || row?.name || '').trim();
    const normalizedName = normalizeIndexName(itemName);
    if (!row?.restaurant_id || !itemName || !normalizedName) return null;

    return {
        restaurant_id: row.restaurant_id,
        item_name: itemName,
        category: String(row?.category || '').trim() || null,
        normalized_name: normalizedName,
    };
}

export function buildGlobalMenuIndex(rows = []) {
    const unique = new Map();
    for (const row of rows || []) {
        const normalized = normalizeMenuRow(row);
        if (!normalized) continue;
        const key = `${normalized.restaurant_id}::${normalized.normalized_name}`;
        if (!unique.has(key)) unique.set(key, normalized);
    }
    return [...unique.values()];
}

export async function loadGlobalMenuIndex({ forceRefresh = false, ttlMs = DEFAULT_CACHE_TTL_MS } = {}) {
    const now = Date.now();
    if (!forceRefresh && indexCache.entries.length > 0 && indexCache.expiresAt > now) {
        return indexCache.entries;
    }

    const { data, error } = await supabase
        .from('menu_items_v2')
        .select('restaurant_id, name, base_name, category');

    if (error) {
        console.warn('[GLOBAL_MENU_INDEX_ERROR]', {
            message: error?.message || String(error || ''),
        });
        return indexCache.entries || [];
    }

    const entries = buildGlobalMenuIndex(data || []);
    indexCache = {
        entries,
        expiresAt: now + Math.max(1, Number(ttlMs) || DEFAULT_CACHE_TTL_MS),
    };
    return entries;
}

export async function searchGlobalMenuIndex(inputText = '', opts = {}) {
    const query = normalizeIndexName(inputText);
    if (!query) {
        return { matches: [], candidateRestaurants: [] };
    }

    const entries = await loadGlobalMenuIndex(opts);
    if (!Array.isArray(entries) || entries.length === 0) {
        return { matches: [], candidateRestaurants: [] };
    }

    const minScore = Number(opts?.minScore ?? DEFAULT_MIN_SCORE);
    const limit = Math.max(1, Number(opts?.limit ?? DEFAULT_SEARCH_LIMIT));
    const restaurantLimit = Math.max(1, Number(opts?.restaurantLimit ?? DEFAULT_RESTAURANT_LIMIT));

    const scored = entries
        .map((entry) => ({
            ...entry,
            score: scoreGlobalMenuEntry(query, entry),
        }))
        .filter((entry) => entry.score >= minScore)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

    const byRestaurant = new Map();
    for (const match of scored) {
        const key = String(match.restaurant_id || '');
        if (!key) continue;
        const previous = byRestaurant.get(key);
        if (!previous) {
            byRestaurant.set(key, {
                restaurant_id: key,
                score: match.score,
                candidateCount: 1,
                topItem: match.item_name,
            });
            continue;
        }
        previous.candidateCount += 1;
        if (match.score > previous.score) {
            previous.score = match.score;
            previous.topItem = match.item_name;
        }
    }

    const candidateRestaurants = [...byRestaurant.values()]
        .sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return b.candidateCount - a.candidateCount;
        })
        .slice(0, restaurantLimit);

    return { matches: scored, candidateRestaurants };
}

export function resetGlobalMenuIndexCache() {
    indexCache = { expiresAt: 0, entries: [] };
}

