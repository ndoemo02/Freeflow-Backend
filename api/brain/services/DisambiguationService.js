/**
 * DisambiguationService.js
 * ═══════════════════════════════════════════════════════════════════════════
 * Deterministyczna warstwa ujednoznaczniania pozycji w menu.
 * Rozwiązuje konflikty nazw między restauracjami.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { supabase } from '../../_supabase.js'; // Adjust path if needed (depth 2 from domains/food, depth 1 from services)
// Wait, path from services/DisambiguationService.js (level 3) to api/_supabase.js (level 1) is ../../_supabase.js
import { fuzzyIncludes, normalize, normalizeDish, findBestDishMatch } from '../helpers.js';

export const DISAMBIGUATION_RESULT = {
    ITEM_NOT_FOUND: 'ITEM_NOT_FOUND',
    ADD_ITEM: 'ADD_ITEM',
    DISAMBIGUATION_REQUIRED: 'DISAMBIGUATION_REQUIRED'
};

/**
 * Rozwiązuje konflikty nazw dań w menu.
 * 
 * @param {string} itemName - Nazwa dania (lub znormalizowany tekst użytkownika)
 * @param {object} context - Kontekst (restaurant_id, list of previously viewed, etc.)
 * @returns {Promise<{status: string, item?: object, restaurant?: object, candidates?: array}>}
 */
export async function resolveMenuItemConflict(itemName, context = {}) {
    if (!itemName) return { status: DISAMBIGUATION_RESULT.ITEM_NOT_FOUND };

    console.log(`🧠 Disambiguation: Searching for "${itemName}"...`);

    // 1. Pobierz wszystkie pasujące pozycje (bez join, aby uniknąć błędów missing FK)
    const { data: allItems, error } = await supabase
        .from('menu_items_v2')
        .select(`
            id, 
            name, 
            base_name,
            price_pln, 
            restaurant_id
        `);

    if (error) {
        console.error("Disambiguation DB Error (items):", error);
        return { status: DISAMBIGUATION_RESULT.ITEM_NOT_FOUND };
    }

    const buildCandidateSet = (pool, normalizedInput) => {
        const token = normalizedInput.trim();
        const altTokens = [token];

        // Minimal fallback fleksyjny: "zurek" -> "zur"
        if (token.length <= 6 && token.endsWith('ek')) {
            altTokens.push(token.slice(0, -2));
        }

        const tokenWordMatches = pool.filter(item => {
            const baseTokens = normalizeDish(item.base_name || '').split(' ').filter(Boolean);
            const nameTokens = normalizeDish(item.name || '').split(' ').filter(Boolean);
            return altTokens.some(t => baseTokens.includes(t) || nameTokens.includes(t));
        });

        if (tokenWordMatches.length === 1) {
            return tokenWordMatches;
        }

        if (tokenWordMatches.length > 1) {
            const sorted = [...tokenWordMatches].sort((a, b) =>
                (a.base_name || '').length - (b.base_name || '').length
            );
            return [sorted[0]];
        }

        const exactBaseMatches = pool.filter(item => {
            const base = normalizeDish(item.base_name || '');
            return altTokens.some(t => base.startsWith(t) || base.includes(t));
        });

        if (exactBaseMatches.length === 1) {
            return exactBaseMatches;
        }

        return pool.filter(item =>
            altTokens.some(t =>
                fuzzyIncludes(normalizeDish(item.base_name || ''), t) ||
                fuzzyIncludes(normalizeDish(item.name || ''), t)
            )
        );
    };

    const buildMenuFallbackCandidates = (menu = [], normalizedInput, rid) => {
        if (!Array.isArray(menu) || menu.length === 0) return [];

        const token = normalizedInput.trim();
        const altTokens = [token];
        if (token.length <= 6 && token.endsWith('ek')) {
            altTokens.push(token.slice(0, -2));
        }

        const hit = menu.find((item) => {
            const base = normalizeDish(item.base_name || item.name || '');
            const tokens = base.split(' ').filter(Boolean);
            return altTokens.some((t) => tokens.includes(t) || base.includes(t) || fuzzyIncludes(base, t));
        });

        if (!hit) return [];

        return [{
            id: hit.id,
            name: hit.name,
            base_name: hit.base_name,
            price_pln: hit.price_pln,
            restaurant_id: rid
        }];
    };

    // 2. Priorytet kontekstu restauracji: zawężenie puli przed każdym dopasowaniem
    const entities = context?.entities || {};
    const session = context?.session || {};
    const restaurantId =
        entities?.restaurantId ||
        context?.restaurant_id ||
        session?.currentRestaurant?.id ||
        session?.lastRestaurant?.id;

    let searchPool = allItems;
    if (restaurantId) {
        searchPool = allItems.filter(
            item => item.restaurant_id === restaurantId
        );
    }

    // 3. Filtruj kandydatów: priorytet base_name, potem fuzzy fallback
    const normalizedInput = normalizeDish(itemName);
    let candidates = buildCandidateSet(searchPool, normalizedInput);

    if (candidates.length === 0 && restaurantId) {
        const sessionMenu = context?.session?.last_menu || context?.last_menu || [];
        candidates = buildMenuFallbackCandidates(sessionMenu, normalizedInput, restaurantId);
    }

    // If scoped search found nothing, fallback to global disambiguation
    if (candidates.length === 0 && restaurantId) {
        candidates = buildCandidateSet(allItems, normalizedInput);
    }

    if (candidates.length === 0) {
        return { status: DISAMBIGUATION_RESULT.ITEM_NOT_FOUND };
    }

    // 3. Pobierz nazwy restauracji dla znalezionych kandydatów
    // (Manual join, bezpieczniejszy przy braku zdefiniowanych relacji)
    const restaurantIds = [...new Set(candidates.map(c => c.restaurant_id))];

    const { data: restaurants, error: rError } = await supabase
        .from('restaurants')
        .select('id, name')
        .in('id', restaurantIds);

    if (rError || !restaurants) {
        console.error("Disambiguation DB Error (restaurants):", rError);
        // Fallback: zwróć items bez nazw restauracji (choć to słabe)
        // Ale lepiej zwrócić błąd niż crash
        return { status: DISAMBIGUATION_RESULT.ITEM_NOT_FOUND };
    }

    // 4. Mapuj restauracje do itemów
    candidates.forEach(c => {
        c.restaurants = restaurants.find(r => r.id === c.restaurant_id) || { id: c.restaurant_id, name: 'Unknown' };
    });

    // B) Dokładnie 1 wynik
    if (candidates.length === 1) {
        const unique = candidates[0];
        return {
            status: DISAMBIGUATION_RESULT.ADD_ITEM,
            item: unique,
            restaurant: unique.restaurants
        };
    }

    // B2) Wiele wyników, ale WSZYSTKIE z tej samej restauracji
    // To nie jest konflikt między lokalami. Zwracamy pierwszy (lub w przyszłości: pytamy o rozmiar).
    const uniqueRestaurantIds = [...new Set(candidates.map(c => c.restaurant_id))];
    if (uniqueRestaurantIds.length === 1) {
        const first = candidates[0];
        console.log(`🧠 Same-restaurant ambiguity (${candidates.length} items) in ${first.restaurants.name}. resolving automatically.`);
        return {
            status: DISAMBIGUATION_RESULT.ADD_ITEM,
            item: first,
            restaurant: first.restaurants
        };
    }

    // C) >1 wynik (różne restauracje) - Próba ujednoznacznienia kontekstem
    // Priorytet 1: Obecna restauracja (context.restaurant_id)
    if (restaurantId) {
        const candidatesInContext = candidates.filter(c => String(c.restaurant_id) === String(restaurantId));
        if (candidatesInContext.length > 0) {
            const inContext = findBestDishMatch(itemName, candidatesInContext) || candidatesInContext[0];
            console.log(`🧠 Context match (PRIORITY): ${inContext.name} in ${inContext.restaurants.name}`);
            return {
                status: DISAMBIGUATION_RESULT.ADD_ITEM,
                item: inContext,
                restaurant: inContext.restaurants
            };
        }
    }

    // Priorytet 2: Unikalność nazwy (jeśli user podał bardzo dokładną nazwę)
    // Np. "Burger Drwala" może być tylko w Maku, nawet jeśli "Burger" jest wszędzie
    // Sprawdźmy Exact Match (case insensitive)
    const exactMatches = candidates.filter(c => normalize(c.name) === normalize(itemName));
    if (exactMatches.length === 1) {
        const unique = exactMatches[0];
        return {
            status: DISAMBIGUATION_RESULT.ADD_ITEM,
            item: unique,
            restaurant: unique.restaurants
        };
    }

    // D) Nadal niejednoznaczne -> Wymagane ujednoznacznienie
    // Grupuj kandydatów po restauracjach
    const restaurantCandidates = candidates.reduce((acc, curr) => {
        const rid = curr.restaurant_id;
        if (!acc[rid]) {
            acc[rid] = {
                restaurant: curr.restaurants,
                items: []
            };
        }
        acc[rid].items.push(curr);
        return acc;
    }, {});

    return {
        status: DISAMBIGUATION_RESULT.DISAMBIGUATION_REQUIRED,
        candidates: Object.values(restaurantCandidates).map(g => ({
            restaurant: g.restaurant,
            items: g.items
        }))
    };
}
