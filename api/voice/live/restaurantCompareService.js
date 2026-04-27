import { supabase } from '../../_supabase.js';
import { scoreGlobalMenuEntry, searchGlobalMenuIndex } from '../../brain/nlu/globalMenuIndex.js';

const DEFAULT_CITY = 'Piekary Slaskie';
const DEFAULT_MAX_RESTAURANTS = 3;
const DEFAULT_MAX_ITEMS_PER_RESTAURANT = 2;
const MAX_RESTAURANTS_CAP = 3;
const MAX_ITEMS_PER_RESTAURANT_CAP = 3;
const MENU_MATCH_MIN_SCORE = 0.52;
const CLARIFY_THRESHOLD = 0.9;
const CLARIFY_MIN_GAP = 0.12;

function clampInt(value, min, max, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    const rounded = Math.floor(parsed);
    if (!Number.isFinite(rounded)) return fallback;
    if (rounded < min) return min;
    if (rounded > max) return max;
    return rounded;
}

function normalizeLoose(value = '') {
    return String(value || '')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function cleanText(value, maxLen = 120) {
    const text = String(value || '').trim();
    if (!text) return '';
    return text.slice(0, maxLen);
}

function isGenericQuerySignal(value = '') {
    const normalized = normalizeLoose(value);
    if (!normalized) return true;
    if (/\b(cena|ceny|cen|miedzy nimi|miedzy nimi|nimi|tymi|tych restaurac|porownanie|ranking)\b/i.test(normalized)) {
        return true;
    }
    return normalized.length < 4;
}

function normalizeMetric(rawMetric = '') {
    const metric = normalizeLoose(rawMetric).replace(/\s+/g, '_');
    if (!metric) return 'best_match';
    if (metric.includes('lowest') || metric.includes('cheapest') || metric.includes('najtans')) return 'lowest_price';
    if (metric === 'price') return 'lowest_price';
    return 'best_match';
}

function cityMatches(cityValue, cityFilter) {
    if (!cityFilter) return true;
    const rowCity = normalizeLoose(cityValue || '');
    const requestedCity = normalizeLoose(cityFilter || '');
    if (!rowCity || !requestedCity) return false;
    return rowCity.includes(requestedCity) || requestedCity.includes(rowCity);
}

function pickCity(args = {}, session = {}) {
    const argsCity = cleanText(args?.city, 120);
    if (argsCity) return argsCity;

    const sessionCandidates = [
        session?.last_location,
        session?.currentRestaurant?.city,
        session?.lastRestaurant?.city,
    ];
    for (const candidate of sessionCandidates) {
        const safe = cleanText(candidate, 120);
        if (safe) return safe;
    }

    return DEFAULT_CITY;
}

function uniqueStrings(values = [], limit = 3) {
    const out = [];
    const seen = new Set();
    for (const value of values) {
        const safe = cleanText(value, 120);
        if (!safe) continue;
        const key = normalizeLoose(safe);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push(safe);
        if (out.length >= limit) break;
    }
    return out;
}

function asPrice(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function formatPrice(value) {
    const parsed = asPrice(value);
    if (parsed == null) return 'n/a';
    return `${parsed.toFixed(2)} zl`;
}

async function queryRestaurantsByIds(ids = []) {
    const uniqueIds = [...new Set((ids || []).filter(Boolean))];
    if (uniqueIds.length === 0) return [];

    const query = supabase
        .from('restaurants')
        .select('id, name, city');

    let result;
    if (query && typeof query.in === 'function') {
        result = await query.in('id', uniqueIds);
    } else {
        result = await query;
    }

    if (result?.error || !Array.isArray(result?.data)) return [];
    if (query && typeof query.in === 'function') return result.data;
    return result.data.filter((row) => uniqueIds.includes(row?.id));
}

async function queryRestaurantsByCity(city, limit = 12) {
    const query = supabase
        .from('restaurants')
        .select('id, name, city')
        .limit(limit);

    const result = await query;
    if (result?.error || !Array.isArray(result?.data)) return [];
    const rows = result.data || [];
    return rows.filter((row) => cityMatches(row?.city, city));
}

async function queryMenuByRestaurantIds(ids = []) {
    const uniqueIds = [...new Set((ids || []).filter(Boolean))];
    if (uniqueIds.length === 0) return [];

    const query = supabase
        .from('menu_items_v2')
        .select('id, name, base_name, category, price_pln, restaurant_id, available');

    let result;
    if (query && typeof query.in === 'function') {
        result = await query.in('restaurant_id', uniqueIds);
    } else {
        result = await query;
    }

    if (result?.error || !Array.isArray(result?.data)) return [];
    const rows = result.data || [];
    if (query && typeof query.in === 'function') return rows;
    return rows.filter((row) => uniqueIds.includes(row?.restaurant_id));
}

function groupMenuByRestaurant(rows = []) {
    const grouped = new Map();
    for (const row of rows || []) {
        const restaurantId = row?.restaurant_id;
        if (!restaurantId) continue;
        if (!grouped.has(restaurantId)) grouped.set(restaurantId, []);
        grouped.get(restaurantId).push(row);
    }
    return grouped;
}

function scoreMenuItems(query, items = []) {
    const normalizedQuery = cleanText(query, 120);
    if (!normalizedQuery) return [];

    return (items || [])
        .map((item) => {
            const entry = {
                item_name: item?.name || '',
                category: item?.category || '',
                normalized_name: item?.base_name || item?.name || '',
            };
            const score = scoreGlobalMenuEntry(normalizedQuery, entry);
            return { item, score };
        })
        .filter((entry) => entry.score >= MENU_MATCH_MIN_SCORE)
        .sort((a, b) => b.score - a.score);
}

function filterByCategory(category, items = []) {
    const normalizedCategory = normalizeLoose(category);
    if (!normalizedCategory) return [...(items || [])];
    return (items || []).filter((item) => {
        const itemCategory = normalizeLoose(item?.category || '');
        return itemCategory.includes(normalizedCategory) || normalizedCategory.includes(itemCategory);
    });
}

function buildClarifyReply(query, globalMatches = []) {
    const options = uniqueStrings(globalMatches.map((match) => match?.item_name), 2);
    if (options.length >= 2) {
        return `Czy chodzilo Ci o "${options[0]}" czy "${options[1]}"?`;
    }
    if (query) {
        return `Nie jestem pewna, co porownac dla "${query}". Doprecyzuj prosze nazwe pozycji.`;
    }
    return 'Nie jestem pewna, co porownac. Doprecyzuj prosze pozycje lub kategorie.';
}

function buildComparisonReply({ query, category, city, metric, results = [] }) {
    if (!Array.isArray(results) || results.length === 0) {
        const target = query || category || 'podana fraze';
        return `Nie znalazlam dopasowan dla "${target}" w ${city}.`;
    }

    const headerTarget = query || category || 'pozycje';
    const modeLabel = metric === 'lowest_price' ? 'Najtansze opcje' : 'Porownanie';
    const lines = [`${modeLabel} dla "${headerTarget}" w ${city}:`];

    results.forEach((restaurant, idx) => {
        const itemsSummary = (restaurant.items || [])
            .map((item) => `${item.name} (${formatPrice(item.price_pln)})`)
            .join(', ');
        lines.push(`${idx + 1}. ${restaurant.name}: ${itemsSummary || 'brak pozycji'}`);
    });

    return lines.join(' ');
}

export async function compareRestaurantsForLive({ args = {}, session = {} } = {}) {
    const rawQuery = cleanText(args?.query, 120);
    const rawCategory = cleanText(args?.category, 80);
    const sessionQuerySeed = cleanText(session?.last_compare_query || session?.pendingDish || '', 120);
    const sessionCategorySeed = cleanText(session?.last_compare_category || '', 80);
    const query = (!rawQuery || isGenericQuerySignal(rawQuery))
        ? (sessionQuerySeed || rawQuery)
        : rawQuery;
    const category = rawCategory || (!query ? sessionCategorySeed : '');
    const city = pickCity(args, session);
    const metric = normalizeMetric(args?.metric);
    const maxRestaurants = clampInt(args?.max_restaurants, 1, MAX_RESTAURANTS_CAP, DEFAULT_MAX_RESTAURANTS);
    const maxItemsPerRestaurant = clampInt(
        args?.max_items_per_restaurant,
        1,
        MAX_ITEMS_PER_RESTAURANT_CAP,
        DEFAULT_MAX_ITEMS_PER_RESTAURANT,
    );

    let globalMatches = [];
    let candidateRestaurantIds = [];

    if (query) {
        const indexResult = await searchGlobalMenuIndex(query, {
            minScore: 0.38,
            limit: 120,
            restaurantLimit: 12,
        });
        globalMatches = Array.isArray(indexResult?.matches) ? indexResult.matches : [];
        candidateRestaurantIds = (indexResult?.candidateRestaurants || [])
            .map((row) => row?.restaurant_id)
            .filter(Boolean);
    }

    if (!query && Array.isArray(session?.last_restaurants_list) && session.last_restaurants_list.length > 0) {
        candidateRestaurantIds = session.last_restaurants_list
            .map((row) => row?.id || row?.restaurant_id)
            .filter(Boolean);
    }

    let restaurants = [];
    if (candidateRestaurantIds.length > 0) {
        restaurants = await queryRestaurantsByIds(candidateRestaurantIds);
        restaurants = restaurants.filter((row) => cityMatches(row?.city, city));
    }

    if (restaurants.length === 0) {
        restaurants = await queryRestaurantsByCity(city, 16);
    }

    const restaurantIds = restaurants.map((row) => row?.id).filter(Boolean);
    if (restaurantIds.length === 0) {
        return {
            ok: true,
            reply: `Nie mam aktywnych restauracji w ${city}.`,
            restaurants: [],
            comparison: {
                query: query || null,
                category: category || null,
                city,
                metric,
                results: [],
            },
            candidateCount: 0,
            topMatch: null,
            score: 0,
        };
    }

    const menuRows = await queryMenuByRestaurantIds(restaurantIds);
    const menuByRestaurant = groupMenuByRestaurant(menuRows);

    const scoredRestaurantResults = [];
    for (const restaurant of restaurants) {
        const restaurantId = restaurant?.id;
        if (!restaurantId) continue;

        const allItems = (menuByRestaurant.get(restaurantId) || [])
            .filter((item) => item?.available !== false)
            .filter((item) => Boolean(item?.name || item?.base_name));

        if (allItems.length === 0) continue;

        const categoryFiltered = category ? filterByCategory(category, allItems) : allItems;
        if (categoryFiltered.length === 0) continue;

        let selectedItems = [];
        if (query) {
            const scoredItems = scoreMenuItems(query, categoryFiltered);
            if (scoredItems.length === 0) continue;
            selectedItems = scoredItems.map((entry) => ({
                ...entry.item,
                score: Number(entry.score.toFixed(3)),
            }));
        } else {
            selectedItems = categoryFiltered.map((item) => ({
                ...item,
                score: 0,
            }));
        }

        if (metric === 'lowest_price') {
            selectedItems.sort((a, b) => {
                const priceA = asPrice(a?.price_pln);
                const priceB = asPrice(b?.price_pln);
                if (priceA == null && priceB == null) return (b.score || 0) - (a.score || 0);
                if (priceA == null) return 1;
                if (priceB == null) return -1;
                if (priceA !== priceB) return priceA - priceB;
                return (b.score || 0) - (a.score || 0);
            });
        } else {
            selectedItems.sort((a, b) => {
                if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0);
                const priceA = asPrice(a?.price_pln);
                const priceB = asPrice(b?.price_pln);
                if (priceA == null && priceB == null) return 0;
                if (priceA == null) return 1;
                if (priceB == null) return -1;
                return priceA - priceB;
            });
        }

        const topItems = selectedItems.slice(0, maxItemsPerRestaurant).map((item) => ({
            id: item?.id || null,
            name: cleanText(item?.name || item?.base_name || '', 120),
            category: cleanText(item?.category || '', 80) || null,
            price_pln: asPrice(item?.price_pln),
            score: Number(Number(item?.score || 0).toFixed(3)),
        }));
        if (topItems.length === 0) continue;

        const topScore = Number(topItems[0]?.score || 0);
        const topPrice = asPrice(topItems[0]?.price_pln);
        scoredRestaurantResults.push({
            id: restaurantId,
            name: cleanText(restaurant?.name || '', 120) || 'Nieznana restauracja',
            city: cleanText(restaurant?.city || '', 80) || null,
            topScore,
            topPrice,
            items: topItems,
        });
    }

    if (query && globalMatches.length > 0) {
        const bestGlobalScore = Number(globalMatches[0]?.score || 0);
        const secondGlobalScore = Number(globalMatches[1]?.score || 0);
        const ambiguous = bestGlobalScore < CLARIFY_THRESHOLD || (bestGlobalScore - secondGlobalScore) < CLARIFY_MIN_GAP;
        if (ambiguous && scoredRestaurantResults.length > 0) {
            return {
                ok: true,
                reply: buildClarifyReply(query, globalMatches),
                restaurants: [],
                comparison: {
                    query,
                    category: category || null,
                    city,
                    metric,
                    results: [],
                    clarify: true,
                },
                candidateCount: scoredRestaurantResults.length,
                topMatch: cleanText(globalMatches[0]?.item_name || '', 120) || null,
                score: Number(bestGlobalScore.toFixed(3)),
            };
        }
    }

    if (metric === 'lowest_price') {
        scoredRestaurantResults.sort((a, b) => {
            if (a.topPrice == null && b.topPrice == null) return b.topScore - a.topScore;
            if (a.topPrice == null) return 1;
            if (b.topPrice == null) return -1;
            if (a.topPrice !== b.topPrice) return a.topPrice - b.topPrice;
            return b.topScore - a.topScore;
        });
    } else {
        scoredRestaurantResults.sort((a, b) => {
            if (b.topScore !== a.topScore) return b.topScore - a.topScore;
            if (a.topPrice == null && b.topPrice == null) return 0;
            if (a.topPrice == null) return 1;
            if (b.topPrice == null) return -1;
            return a.topPrice - b.topPrice;
        });
    }

    const results = scoredRestaurantResults.slice(0, maxRestaurants);
    const reply = buildComparisonReply({
        query,
        category,
        city,
        metric,
        results,
    });

    const topResult = results[0];
    return {
        ok: true,
        reply,
        restaurants: results.map((restaurant) => ({
            id: restaurant.id,
            name: restaurant.name,
            city: restaurant.city,
            comparison_items: restaurant.items,
            comparison_top_score: restaurant.topScore,
            comparison_top_price: restaurant.topPrice,
        })),
        comparison: {
            query: query || null,
            category: category || null,
            city,
            metric,
            results,
            maxRestaurants,
            maxItemsPerRestaurant,
        },
        candidateCount: scoredRestaurantResults.length,
        topMatch: topResult?.items?.[0]?.name || null,
        score: Number(Number(topResult?.topScore || 0).toFixed(3)),
    };
}
