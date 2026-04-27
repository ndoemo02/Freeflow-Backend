/**
 * DisambiguationService.js
 * Deterministyczna warstwa ujednoznaczniania pozycji w menu.
 *
 * Zasady:
 * - jeśli restauracja jest znana: szukamy tylko w tej restauracji
 * - jeśli restauracja nie jest znana: używamy lekkiego globalMenuIndex do wyboru kandydatów restauracji
 * - brak blind-substitution: przy niskim score zwracamy clarify zamiast automatycznego ADD_ITEM
 */

import { supabase } from '../../_supabase.js';
import { normalizeDish, fuzzyIncludes, findBestDishMatch } from '../helpers.js';
import { searchGlobalMenuIndex } from '../nlu/globalMenuIndex.js';

const MIN_CANDIDATE_SCORE = 0.52;
const AUTO_RESOLVE_SCORE = 1.08;
const LOW_CONFIDENCE_SCORE = 0.9;
const MIN_SCORE_GAP = 0.14;

export const DISAMBIGUATION_RESULT = {
    ITEM_NOT_FOUND: 'ITEM_NOT_FOUND',
    ADD_ITEM: 'ADD_ITEM',
    DISAMBIGUATION_REQUIRED: 'DISAMBIGUATION_REQUIRED',
};

function normalizeComparable(value = '') {
    return normalizeDish(String(value || ''));
}

function tokenize(value = '') {
    return normalizeComparable(value)
        .split(' ')
        .map((token) => token.trim())
        .filter(Boolean);
}

function scoreToken(queryToken = '', candidateToken = '') {
    if (!queryToken || !candidateToken) return 0;
    if (queryToken === candidateToken) return 1;
    if (candidateToken.startsWith(queryToken) || queryToken.startsWith(candidateToken)) return 0.85;
    if (queryToken.length >= 4 && candidateToken.length >= 4 && fuzzyIncludes(candidateToken, queryToken)) return 0.65;
    return 0;
}

function scoreMenuCandidate(inputText = '', candidate = {}) {
    const query = normalizeComparable(inputText);
    const baseName = normalizeComparable(candidate?.base_name || '');
    const itemName = normalizeComparable(candidate?.name || '');

    if (!query || (!baseName && !itemName)) return 0;
    if (query === baseName || query === itemName) return 1.4;

    const corpus = [baseName, itemName].filter(Boolean);
    if (corpus.some((value) => value.includes(query) || query.includes(value))) return 1.06;

    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return 0;

    let best = 0;
    for (const value of corpus) {
        const targetTokens = tokenize(value);
        if (targetTokens.length === 0) continue;

        let overlap = 0;
        for (const queryToken of queryTokens) {
            let tokenBest = 0;
            for (const candidateToken of targetTokens) {
                tokenBest = Math.max(tokenBest, scoreToken(queryToken, candidateToken));
                if (tokenBest === 1) break;
            }
            overlap += tokenBest;
        }

        const normalizedOverlap = overlap / queryTokens.length;
        const prefixBoost = value.startsWith(query) ? 0.14 : 0;
        const fuzzyBoost = fuzzyIncludes(value, query) ? 0.1 : 0;
        best = Math.max(best, normalizedOverlap + prefixBoost + fuzzyBoost);
    }

    return best;
}

async function fetchMenuItems(restaurantIds = []) {
    const uniqueIds = [...new Set((restaurantIds || []).filter(Boolean))];
    const query = supabase
        .from('menu_items_v2')
        .select('id, name, base_name, category, price_pln, restaurant_id');

    let result;
    if (uniqueIds.length > 0 && query && typeof query.in === 'function') {
        result = await query.in('restaurant_id', uniqueIds);
    } else {
        result = await query;
    }

    if (result?.error) {
        return { data: [], error: result.error };
    }

    const rows = Array.isArray(result?.data) ? result.data : [];
    if (uniqueIds.length === 0 || (query && typeof query.in === 'function')) {
        return { data: rows, error: null };
    }

    // Fallback for mocked queries without `.in()`
    return {
        data: rows.filter((row) => uniqueIds.includes(row?.restaurant_id)),
        error: null,
    };
}

async function fetchRestaurantsByIds(restaurantIds = []) {
    const uniqueIds = [...new Set((restaurantIds || []).filter(Boolean))];
    if (uniqueIds.length === 0) return [];

    const query = supabase.from('restaurants').select('id, name');
    if (query && typeof query.in === 'function') {
        const { data, error } = await query.in('id', uniqueIds);
        if (error || !Array.isArray(data)) return [];
        return data;
    }

    const { data, error } = await query;
    if (error || !Array.isArray(data)) return [];
    return data.filter((row) => uniqueIds.includes(row?.id));
}

function buildSessionMenuFallbackCandidates(menu = [], restaurantId = null) {
    if (!restaurantId || !Array.isArray(menu) || menu.length === 0) return [];
    return menu
        .filter((item) => Boolean(item?.name || item?.base_name))
        .map((item) => ({
            id: item?.id || null,
            name: item?.name || item?.base_name || '',
            base_name: item?.base_name || item?.name || '',
            category: item?.category || null,
            price_pln: item?.price_pln ?? item?.price ?? null,
            restaurant_id: restaurantId,
        }));
}

function scoreCandidatePool(itemName = '', pool = []) {
    const scored = (pool || [])
        .map((item) => ({
            item,
            score: scoreMenuCandidate(itemName, item),
        }))
        .filter((entry) => entry.score >= MIN_CANDIDATE_SCORE)
        .sort((a, b) => b.score - a.score);

    const uniqueByKey = new Map();
    for (const entry of scored) {
        const key = entry?.item?.id
            ? `id:${entry.item.id}`
            : `${entry?.item?.restaurant_id || 'na'}::${normalizeComparable(entry?.item?.base_name || entry?.item?.name || '')}`;
        if (!uniqueByKey.has(key)) uniqueByKey.set(key, entry);
    }
    return [...uniqueByKey.values()];
}

function buildRestaurantGroups(candidates = []) {
    const grouped = candidates.reduce((acc, candidate) => {
        const rid = candidate?.restaurant_id;
        if (!rid) return acc;

        if (!acc[rid]) {
            acc[rid] = {
                restaurant: candidate?.restaurants || { id: rid, name: 'Unknown' },
                items: [],
            };
        }
        acc[rid].items.push(candidate);
        return acc;
    }, {});

    return Object.values(grouped);
}

function buildItemClarifyPayload(options = [], query = '', context = {}) {
    const normalizedOptions = (options || []).slice(0, 2).map((entry) => ({
        id: entry?.id || null,
        name: entry?.name || entry?.base_name || null,
        restaurant: entry?.restaurants || null,
        score: Number(Number(entry?.matchScore || 0).toFixed(3)),
    }));

    return {
        status: DISAMBIGUATION_RESULT.DISAMBIGUATION_REQUIRED,
        clarifyType: 'item',
        query: normalizeComparable(query),
        options: normalizedOptions,
        candidateCount: Number(context?.candidateCount || normalizedOptions.length || 0),
        topScore: Number(Number(context?.topScore || 0).toFixed(3)),
    };
}

function shouldForceClarify(scoredCandidates = []) {
    if (!Array.isArray(scoredCandidates) || scoredCandidates.length === 0) return false;

    const top = scoredCandidates[0];
    const second = scoredCandidates[1] || null;
    if (!top) return false;
    const topScore = Number(top?.score ?? top?.matchScore ?? 0);
    if (topScore < LOW_CONFIDENCE_SCORE) return true;
    if (!second) return false;
    const secondScore = Number(second?.score ?? second?.matchScore ?? 0);
    return (topScore - secondScore) < MIN_SCORE_GAP;
}

function logDisambiguationSummary({
    restaurantLocked = false,
    candidateCount = 0,
    topMatch = null,
    topScore = null,
    source = 'scoped',
}) {
    const safeTopMatch = topMatch ? String(topMatch).slice(0, 80) : null;
    const safeTopScore = Number.isFinite(topScore) ? Number(topScore.toFixed(3)) : null;
    console.log('[DISAMBIGUATION_MIN]', JSON.stringify({
        restaurantLocked: Boolean(restaurantLocked),
        candidateCount: Number(candidateCount || 0),
        topMatch: safeTopMatch,
        score: safeTopScore,
        source,
    }));
}

/**
 * Rozwiązuje konflikty nazw dań w menu.
 *
 * @param {string} itemName
 * @param {object} context
 * @returns {Promise<{status: string, item?: object, restaurant?: object, candidates?: array}>}
 */
export async function resolveMenuItemConflict(itemName, context = {}) {
    if (!itemName) return { status: DISAMBIGUATION_RESULT.ITEM_NOT_FOUND };

    const normalizedInput = normalizeComparable(itemName);
    if (!normalizedInput) return { status: DISAMBIGUATION_RESULT.ITEM_NOT_FOUND };

    const entities = context?.entities || {};
    const session = context?.session || {};
    const restaurantId =
        entities?.restaurantId ||
        context?.restaurant_id ||
        session?.currentRestaurant?.id ||
        session?.lastRestaurant?.id ||
        null;

    const restaurantLocked = Boolean(restaurantId);
    let source = restaurantLocked ? 'scoped_restaurant' : 'global_index';

    let searchPool = [];
    if (restaurantLocked) {
        const { data, error } = await fetchMenuItems([restaurantId]);
        if (error) {
            console.error('[DISAMBIGUATION_DB_ERROR]', error?.message || String(error || ''));
            return { status: DISAMBIGUATION_RESULT.ITEM_NOT_FOUND };
        }
        searchPool = data || [];

        if (searchPool.length === 0) {
            const sessionMenu = context?.session?.last_menu || context?.last_menu || [];
            searchPool = buildSessionMenuFallbackCandidates(sessionMenu, restaurantId);
        }
    } else {
        const indexResult = await searchGlobalMenuIndex(itemName, {
            minScore: 0.44,
            limit: 60,
            restaurantLimit: 5,
        });
        const candidateRestaurantIds = (indexResult?.candidateRestaurants || [])
            .map((candidate) => candidate?.restaurant_id)
            .filter(Boolean);

        if (candidateRestaurantIds.length === 0) {
            logDisambiguationSummary({
                restaurantLocked,
                candidateCount: 0,
                source,
            });
            return { status: DISAMBIGUATION_RESULT.ITEM_NOT_FOUND };
        }

        const { data, error } = await fetchMenuItems(candidateRestaurantIds);
        if (error) {
            console.error('[DISAMBIGUATION_DB_ERROR]', error?.message || String(error || ''));
            return { status: DISAMBIGUATION_RESULT.ITEM_NOT_FOUND };
        }
        searchPool = data || [];
        source = `global_index:${candidateRestaurantIds.length}`;
    }

    if (!Array.isArray(searchPool) || searchPool.length === 0) {
        logDisambiguationSummary({
            restaurantLocked,
            candidateCount: 0,
            source,
        });
        return { status: DISAMBIGUATION_RESULT.ITEM_NOT_FOUND };
    }

    const scored = scoreCandidatePool(normalizedInput, searchPool);
    const top = scored[0] || null;
    logDisambiguationSummary({
        restaurantLocked,
        candidateCount: scored.length,
        topMatch: top?.item?.name || top?.item?.base_name || null,
        topScore: top?.score,
        source,
    });

    if (scored.length === 0) {
        return { status: DISAMBIGUATION_RESULT.ITEM_NOT_FOUND };
    }

    const restaurantIds = [...new Set(scored.map((entry) => entry?.item?.restaurant_id).filter(Boolean))];
    const restaurants = await fetchRestaurantsByIds(restaurantIds);
    const restaurantsById = new Map((restaurants || []).map((restaurant) => [String(restaurant.id), restaurant]));

    const candidates = scored.map((entry) => ({
        ...entry.item,
        matchScore: entry.score,
        restaurants: restaurantsById.get(String(entry?.item?.restaurant_id))
            || { id: entry?.item?.restaurant_id, name: 'Unknown' },
    }));

    // Jeśli restauracja jest znana -> tylko ta restauracja, bez fallback cross-restaurant.
    if (restaurantLocked) {
        const inRestaurant = candidates.filter((candidate) => String(candidate.restaurant_id) === String(restaurantId));
        if (inRestaurant.length === 0) {
            return { status: DISAMBIGUATION_RESULT.ITEM_NOT_FOUND };
        }

        const topScoped = inRestaurant[0];
        if (inRestaurant.length === 1 && topScoped.matchScore >= AUTO_RESOLVE_SCORE) {
            return {
                status: DISAMBIGUATION_RESULT.ADD_ITEM,
                item: topScoped,
                restaurant: topScoped.restaurants,
            };
        }

        if (shouldForceClarify(inRestaurant)) {
            return buildItemClarifyPayload(inRestaurant, itemName, {
                topScore: topScoped?.matchScore,
                candidateCount: inRestaurant.length,
            });
        }

        if (inRestaurant.length > 1) {
            // Use helper for deterministic best pick only if confidence is strong.
            const deterministicBest = findBestDishMatch(itemName, inRestaurant);
            if (deterministicBest) {
                const matched = inRestaurant.find((item) => String(item.id) === String(deterministicBest.id)) || inRestaurant[0];
                if (matched.matchScore >= AUTO_RESOLVE_SCORE) {
                    return {
                        status: DISAMBIGUATION_RESULT.ADD_ITEM,
                        item: matched,
                        restaurant: matched.restaurants,
                    };
                }
            }
            return buildItemClarifyPayload(inRestaurant, itemName, {
                topScore: topScoped?.matchScore,
                candidateCount: inRestaurant.length,
            });
        }

        return {
            status: DISAMBIGUATION_RESULT.ADD_ITEM,
            item: topScoped,
            restaurant: topScoped.restaurants,
        };
    }

    // Restauracja nieznana -> global index już zawęził pulę.
    const topGlobal = candidates[0];
    const secondGlobal = candidates[1] || null;
    if (
        topGlobal &&
        topGlobal.matchScore >= AUTO_RESOLVE_SCORE &&
        (!secondGlobal || (topGlobal.matchScore - secondGlobal.matchScore) >= MIN_SCORE_GAP)
    ) {
        return {
            status: DISAMBIGUATION_RESULT.ADD_ITEM,
            item: topGlobal,
            restaurant: topGlobal.restaurants,
        };
    }

    if (shouldForceClarify(candidates)) {
        return buildItemClarifyPayload(candidates, itemName, {
            topScore: topGlobal?.matchScore,
            candidateCount: candidates.length,
        });
    }

    const restaurantGroups = buildRestaurantGroups(candidates);
    if (restaurantGroups.length === 1) {
        const only = restaurantGroups[0];
        const best = only?.items?.[0] || null;
        if (best && best.matchScore >= AUTO_RESOLVE_SCORE) {
            return {
                status: DISAMBIGUATION_RESULT.ADD_ITEM,
                item: best,
                restaurant: best.restaurants,
            };
        }
        return buildItemClarifyPayload(only.items || [], itemName, {
            topScore: best?.matchScore,
            candidateCount: (only.items || []).length,
        });
    }

    return {
        status: DISAMBIGUATION_RESULT.DISAMBIGUATION_REQUIRED,
        clarifyType: 'restaurant',
        candidates: restaurantGroups,
    };
}
