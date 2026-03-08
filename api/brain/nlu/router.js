/**
 * NLU Router - Decyzyjny MĂłzg (V2)
 * Odpowiada za klasyfikacjÄ™ intencji i ekstrakcjÄ™ encji.
 * Wykorzystuje Static Catalog dla wydajnoĹ›ci.
 */

import { normalizeTxt } from '../intents/intentRouterGlue.js';
import { BrainLogger } from '../../../utils/logger.js';
import { smartResolveIntent } from '../ai/smartIntent.js';
import { parseRestaurantAndDish } from '../order/parseOrderItems.js';
import { extractLocation, extractCuisineType, extractQuantity } from './extractors.js';
import { findRestaurantInText } from '../data/restaurantCatalog.js';
import { fuzzyIncludes, normalizeDish, levenshtein } from '../helpers.js';

function isExplicitRestaurantSearch(text = '') {
    const t = String(text || '').toLowerCase();
    return [
        'restaurac',
        'pokaĹĽ restauracje',
        'pokaz restauracje',
        'znajdĹş restauracje',
        'znajdz restauracje',
        'dostÄ™pne restauracje',
        'dostepne restauracje',
        'w pobliĹĽu',
        'w poblizu',
        'gdzie mogÄ™ zjeĹ›Ä‡',
        'gdzie moge zjesc'
    ].some(k => t.includes(k));
}

export class NLURouter {
    constructor() {
        // Cache or loading models here
    }

    /**
     * Mapuje intent -> domain
     */
    _mapDomain(intent) {
        if (!intent) return 'unknown';
        if (['find_nearby', 'select_restaurant', 'menu_request', 'show_city_results', 'show_more_options', 'recommend', 'confirm', 'cancel_order'].includes(intent)) return 'food';
        if (['create_order', 'confirm_order', 'confirm_add_to_cart', 'add_item', 'choose_restaurant', 'clarify_order'].includes(intent)) return 'ordering';
        return 'system';
    }

    /**
     * Wykrywa intencjÄ™ z tekstu i kontekstu
     * @param {Object} ctx - Pipeline context (text, session, etc.)
     * @returns {Promise<{intent: string, confidence: number, entities: Object, source: string, domain: string}>}
     */
    async detect(ctx) {
        const result = await this._detectInternal(ctx);
        // Enrich with domain
        result.domain = this._mapDomain(result.intent);

        console.log('đź§  NLURouter Result:', JSON.stringify(result, null, 2));
        BrainLogger.nlu('Result:', result);
        return result;
    }

    async _detectInternal(ctx) {
        const { text, session } = ctx;
        const normalized = normalizeTxt(text);

        BrainLogger.nlu('Detecting intent for:', text);

        // 1. Entity Extraction (NLU Layer)
        // Now using advanced extractors ported from Legacy
        const location = extractLocation(text); // Handles inflections like "Piekarach"
        const cuisine = extractCuisineType(text);
        const quantity = extractQuantity(text);

        // 2. Static Catalog Lookup (Fast Match)
        // Instant 0ms check against known 9 restaurants
        const matchedRestaurant = findRestaurantInText(text);
        const explicitRestaurantSearch = isExplicitRestaurantSearch(text);

        if (session?.currentRestaurant && explicitRestaurantSearch) {
            return {
                intent: 'find_nearby',
                confidence: 0.9,
                source: 'restaurant_navigation_override',
                entities: {
                    location,
                    cuisine,
                    quantity,
                    restaurant: matchedRestaurant ? matchedRestaurant.name : null,
                    restaurantId: matchedRestaurant ? matchedRestaurant.id : null,
                    dish: null,
                    items: null
                }
            };
        }

        // --- RULE 3b: Aliases & Entity Parsing (Dish Detection) ---
        const parsed = parseRestaurantAndDish(text);

        const entities = {
            location,
            cuisine,
            quantity,
            restaurant: matchedRestaurant ? matchedRestaurant.name : null,
            restaurantId: matchedRestaurant ? matchedRestaurant.id : null,
            dish: parsed.dish || null, // EXPOSE DISH GLOBALLY
            items: parsed.items || null
        };

        // --- PRIORITY: Explicit Intent Commands Override Awaiting State ---
        // If user says "PokaĹĽ menu", that's menu_request even if system was awaiting location
        const isExplicitMenuRequest = /^(poka[zĹĽ]\s+)?(menu|karta|karte|kartÄ™|oferta|oferte|ofertÄ™|list[ae])(\s+da[Ĺ„n])?$/i.test(normalized) ||
            /\b(poka[zĹĽ]|zobacz|sprawdz|sprawdĹş|co)\b.*\b(menu|karta|karte|kartÄ™|oferta|oferte|ofertÄ™|list[ae]|cennik|macie)\b/i.test(normalized);

        if (isExplicitMenuRequest && session?.currentRestaurant) {
            return {
                intent: 'menu_request',
                confidence: 1.0,
                source: 'explicit_menu_override',
                entities
            };
        }

        if (session?.currentRestaurant && explicitRestaurantSearch) {
            return {
                intent: 'find_nearby',
                confidence: 0.9,
                source: 'restaurant_navigation_override',
                entities
            };
        }

        // --- NEW: Context Resolution for Standalone Location Responses ---
        // If system asked for location and user provides just location, continue flow
        if (session?.awaiting === 'location' && location && !matchedRestaurant && !isExplicitMenuRequest) {
            // User is answering the location question
            // Reset awaiting state and continue with find_nearby
            return {
                intent: 'find_nearby',
                confidence: 0.99,
                source: 'context_location_response',
                entities: {
                    ...entities,
                    pendingDish: session.pendingDish || null, // Preserve pending dish from previous turn
                    dish: session.pendingDish || entities.dish || null
                }
            };
        }

        // --- RULE: Context-Based Guards (Priority Maximum) ---
        if (session?.expectedContext === 'confirm_order') {
            if (/\b(nie|nie\s+chce|anuluj|stop)\b/i.test(normalized)) {
                return { intent: 'cancel_order', confidence: 1.0, source: 'rule_guard', entities };
            }
            if (/\b(tak|potwierdzam|potwierdza|ok|dobra|zamawiam|dodaj|prosze|proszÄ™)\b/i.test(normalized)) {
                return { intent: 'confirm_order', confidence: 1.0, source: 'rule_guard', entities };
            }
        }

        // NEW: Guard for confirm_add_to_cart context
        if (session?.expectedContext === 'confirm_add_to_cart') {
            if (/\b(tak|potwierdzam|ok|dodaj|dawaj)\b/i.test(normalized)) {
                return { intent: 'confirm_add_to_cart', confidence: 1.0, source: 'rule_guard', entities };
            }
            if (/\b(nie|anuluj|stop|rezygnujÄ™)\b/i.test(normalized)) {
                return { intent: 'cancel_order', confidence: 1.0, source: 'rule_guard', entities };
            }
        }

        if (session?.conversationPhase === 'ordering' && /\b(anuluj|stop|rezygnuj[eę]|niewazne|nieważne)\b/i.test(normalized)) {
            return { intent: 'cancel_order', confidence: 1.0, source: 'ordering_escape_guard', entities };
        }
        // Guard for confirm_restaurant context (fuzzy confirmation)
        if (session?.expectedContext === 'confirm_restaurant') {
            if (/\b(tak|potwierdzam|ok|ta|tÄ…|tÄ™|tÄ™)\b/i.test(normalized)) {
                // User confirmed - use pending restaurant
                return {
                    intent: 'select_restaurant',
                    confidence: 1.0,
                    source: 'rule_guard',
                    entities: { ...entities, confirmedRestaurant: session.pendingRestaurantConfirm }
                };
            }
            if (/\b(nie|inna|innÄ…|zmieĹ„|zmien)\b/i.test(normalized)) {
                // User wants different restaurant
                return { intent: 'find_nearby', confidence: 1.0, source: 'rule_guard', entities };
            }
        }

        if (session?.expectedContext === 'select_restaurant' || session?.expectedContext === 'show_more_options') {
            const isIntentLike = /(menu|zamawiam|zamĂłw|poproszÄ™|poprosze|wezmÄ™|wezme|chcÄ™|chce|pokaĹĽ|pokaz|znajdĹş|znajdz|gdzie|health)/i.test(normalized);
            const isManualSelection = /\b(numer|nr|opcja|opcje)\s+\d+\b/i.test(normalized);
            // If it's just a number or simple phrase, it's selection
            if (!isIntentLike || /^[0-9]\b/.test(normalized.trim()) || isManualSelection) {
                // If it contains "inne" or "wiecej", it might be show_more_options
                if (/\b(wiecej|wiÄ™cej|inne|lista)\b/i.test(normalized) && !isManualSelection) {
                    // fall through to more options block
                } else {
                    return {
                        intent: 'select_restaurant',
                        confidence: 0.95,
                        entities: { ...entities, raw: text },
                        source: 'context_lock'
                    };
                }
            }
        }

        // --- OPTIMIZATION (PRIORITY HIGH): More Options ---
        if (/\b(wiecej|wiÄ™cej|inne|opcje|lista)\b/i.test(normalized)) {
            // Only if we were just looking for restaurants
            if (session?.lastIntent === 'find_nearby' || session?.expectedContext === 'select_restaurant' || session?.expectedContext === 'show_more_options') {
                return {
                    intent: 'show_more_options',
                    confidence: 0.99,
                    source: 'explicit_more_options',
                    entities
                };
            }
        }

        // --- NEW: Ordinal Item Selection (np. "pierwszy", "ten drugi", "ostatni") ---
        if (session?.conversationPhase === 'restaurant_selected' || session?.conversationPhase === 'ordering') {
            const ordinalRegex = /^(?:poprosz[Ä™e]\s+|wezm[Ä™e]\s+|chc[Ä™e]\s+|zamawiam\s+|daj\s+|wybieram\s+|biore\s+|bior[Ä™e]\s+)?(?:ten\s+|t[aÄ…Ä™]\s+|to\s+)?(pierwsz[yae]|drug[iae]|trzec[iae]|czwart[yae]|pi[aÄ…]t[yae]|ostatni[a|e]?)\s*$/i;
            const match = normalized.trim().match(ordinalRegex);

            if (match) {
                const word = match[1].toLowerCase();
                let idx = -1;

                if (word.startsWith('pierwsz')) idx = 0;
                else if (word.startsWith('drug')) idx = 1;
                else if (word.startsWith('trzec')) idx = 2;
                else if (word.startsWith('czwart')) idx = 3;
                else if (word.startsWith('piat') || word.startsWith('piÄ…t')) idx = 4;
                else if (word.startsWith('ostat')) idx = -1;

                const referenceList = session?.last_menu;

                if (referenceList && referenceList.length > 0) {
                    const actualIdx = (idx === -1) ? referenceList.length - 1 : idx;
                    if (actualIdx >= 0 && actualIdx < referenceList.length) {
                        const selectedItem = referenceList[actualIdx];
                        return {
                            intent: 'create_order', // Treat as ordering a specific item
                            confidence: 1.0,
                            source: 'ordinal_list_selection',
                            entities: {
                                ...entities,
                                dish: selectedItem.name,
                                restaurantId: session?.currentRestaurant?.id,
                                restaurant: session?.currentRestaurant?.name
                            }
                        };
                    }
                }

                // Brak listy referencyjnej, lub index poza tablicÄ… -> prosimy o doprecyzowanie
                return {
                    intent: 'clarify_order',
                    confidence: 1.0,
                    source: 'ordinal_selection_failed_no_list',
                    entities
                };
            }
        }

        // --- GUARD: Dish Selection Inside Restaurant (Menu Match + Alias Layer) ---
        // If user is in a restaurant and their text matches a dish from last_menu,
        // force create_order. Supports: exact, fuzzy, and alias matching.
        // NOTE: This guard runs BEFORE isNumericDiscovery so "dwa Pizza" â†’
        //       create_order+qty=2 instead of find_nearby.
        if (session?.currentRestaurant && session?.last_menu?.length > 0) {
            const menu = session.last_menu;
            const rawDishText = ctx?.body?.text || text;
            const qty = extractQuantity(rawDishText) || 1;

            // Strip leading quantity word so "dwa Pizza Margherita" â†’ "Pizza Margherita"
            const QTY_STRIP = /^(?:\\d+\\s*|jeden|jedna|jedno|dwa|dwie|trzy|cztery|pi[eÄ™][cÄ‡][u]?|sze[sĹ›][cÄ‡][u]?|siedem|osiem|dziewi[eÄ™][cÄ‡][u]?|dziesi[eÄ™][cÄ‡][u]?|kilka|par[Ä™e])\\s+/i;
            const textForDish = rawDishText.replace(QTY_STRIP, '').trim();
            const normalizedForDish = normalizeDish(textForDish);

            const findBestDishMatch = (dishText, catalog) => {
                const inputNorm = normalizeDish(dishText);
                if (!inputNorm) return null;

                const scoreText = (candidate, input) => {
                    const base = normalizeDish(candidate || '');
                    if (!base || !input) return 0;

                    let score = 0;
                    if (base === input) score += 1;
                    if (base.includes(input)) score += 0.3;
                    if (base.startsWith(input)) score += 0.15;

                    const baseTokens = base.split(' ').filter(Boolean);
                    const inputTokens = input.split(' ').filter(Boolean);
                    const overlap = inputTokens.filter(t => baseTokens.includes(t)).length;
                    if (inputTokens.length > 0) {
                        score += (overlap / inputTokens.length) * 0.6;
                    }

                    // Boost near-token matches (e.g. "wege" ~ "vege")
                    const nearTokenBoost = inputTokens.reduce((acc, token) => {
                        if (token.length < 3) return acc;
                        const hasNear = baseTokens.some(bt => bt.length >= 3 && levenshtein(bt, token) <= 1);
                        return acc + (hasNear ? 0.25 : 0);
                    }, 0);
                    score += nearTokenBoost;

                    if (fuzzyIncludes(base, input)) score += 0.2;
                    return score;
                };

                const scored = catalog.map((item) => {
                    const baseScore = scoreText(item.base_name || '', inputNorm) + 0.05;
                    const nameScore = scoreText(item.name || '', inputNorm);
                    return {
                        item,
                        score: Math.max(baseScore, nameScore)
                    };
                }).sort((a, b) => b.score - a.score);

                console.log('[DishMatch]', scored.slice(0, 3).map((s) => ({
                    name: s.item.base_name || s.item.name,
                    score: Number(s.score.toFixed(3))
                })));

                if (scored.length > 0 && scored[0].score > 0.55) {
                    return scored[0].item;
                }

                return null;
            };

            // 1. Best-score match (replaces first-hit selection)
            let dishMatch = findBestDishMatch(textForDish, menu);

            // 2. Alias Layer: auto-generate aliases from dish names
            if (!dishMatch) {
                const ALIAS_STOPWORDS = ['z', 'i', 'w', 'na', 'do', 'ze', 'the', 'a', 'an'];

                for (const item of menu) {
                    const dishNorm = normalizeTxt(item.base_name || item.name).toLowerCase();
                    // Generate aliases: each significant word (>2 chars) from dish name
                    const words = dishNorm.split(/\s+/).filter(w => w.length > 2 && !ALIAS_STOPWORDS.includes(w));

                    // Check if any unique word from dish is in user input
                    const matchedWord = words.find(w => {
                        // Word must be distinctive (not a generic word)
                        const isDistinctive = !['standard', 'double', 'classic', 'mini', 'mega', 'duzy', 'maly'].includes(w);
                        return isDistinctive && normalizedForDish.includes(w);
                    });

                    if (matchedWord) {
                        dishMatch = item;
                        BrainLogger.nlu(`đź”¤ DISH_ALIAS: "${matchedWord}" â†’ "${item.name}"`);
                        break;
                    }
                }
            }

            if (dishMatch) {
                BrainLogger.nlu(`đźŤ˝ď¸Ź DISH_GUARD: Matched "${dishMatch.name}" from menu in restaurant ${session.currentRestaurant.name}`);
                const amountMatches = text.match(/\d+/g);
                const hasExplicitNumber = Boolean(amountMatches);

                return {
                    intent: 'create_order',
                    confidence: 1.0,
                    source: 'dish_guard',
                    entities: {
                        ...entities,
                        dish: dishMatch.name,
                        restaurant: session.currentRestaurant.name,
                        restaurantId: session.currentRestaurant.id,
                        quantity: qty,
                        hasExplicitNumber
                    }
                };
            }
        }

        // --- Patch 3: Quantity + Dish merge (simplified, entities-level) ---
        // If NLU extracted quantity + dish, and we have any ordering context, force create_order.
        if (entities.quantity && entities.quantity > 1 && entities.dish) {
            BrainLogger.nlu(`đź”˘ QTY_DISH_MERGE: qty=${entities.quantity} dish="${entities.dish}"`);
            return {
                intent: 'create_order',
                domain: 'ordering',
                confidence: 0.95,
                source: 'quantity_order',
                entities
            };
        }

        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        // TRANSACTION LOCK â€” in-router guard (Patch 2)
        // Fires BEFORE discovery rules so discovery_guard_block cannot leak.
        // If the user has a pending order or awaits cart confirmation,
        // any non-ordering intent is blocked here.
        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        const ORDER_INTENTS_LOCK = [
            'create_order', 'confirm_add_to_cart', 'remove_from_cart',
            'confirm_order', 'cancel_order'
        ];
        if (session?.pendingOrder || session?.expectedContext === 'confirm_add_to_cart') {
            // Use expectedContext so FSM stays in the right state
            const lockedIntent = session.expectedContext || 'create_order';
            // Only lock if detected intent would escape the ordering flow
            // We check "preemptively" here before running discovery â€” no detected intent yet
            // so we just short-circuit the rest of the router.
            BrainLogger.nlu(`đź”’ ROUTER_TRANSACTION_LOCK: forcing "${lockedIntent}" (pendingOrder=${!!session.pendingOrder})`);
            return {
                intent: lockedIntent,
                confidence: 1.0,
                source: 'transaction_lock',
                entities
            };
        }

        // --- RULE 0 & 5: Discovery & Numerals (Blocking Rules) ---

        // 0. Explicit Discovery Keywords (includes location-relative phrases)
        // NOTE: Include both Polish and ASCII versions since normalizeTxt strips diacritics
        const DISCOVERY_KEYWORDS = ['miejsca', 'restauracje', 'lokale', 'pizzerie', 'gdzie', 'szukam', 'znajdz', 'znajdĹş',
            'kolo mnie', 'koĹ‚o mnie', 'w poblizu', 'w pobliĹĽu', 'blisko', 'niedaleko', 'w okolicy'];
        // 0.25 Uncertainty markers (e.g., "kfc chyba" = user is exploring, not ordering)
        const UNCERTAINTY_KEYWORDS = ['chyba', 'moĹĽe', 'jakiĹ›', 'jakieĹ›', 'coĹ›'];
        // 0.5 Explicit Recommend Keywords
        const RECOMMEND_KEYWORDS = ['polecisz', 'polec'];
        // 5. Numeric Discovery (e.g. "dwa kebaby", "trzy lokale") - if no ordering verb, it's discovery
        const NUMERALS = /\b(dwa|dwie|dwoje|trzy|troje|cztery|piÄ™Ä‡|szeĹ›Ä‡|siedem|osiem|dziewiÄ™Ä‡|dziesiÄ™Ä‡|kilka|parÄ™)\b/i;
        // UPDATED: Added natural forms: "biorÄ™", "wezmÄ™", "poproszÄ™", "chciaĹ‚bym", "chciaĹ‚abym"
        const ORDER_VERBS = /\b(menu|karta|oferta|zamawiam|wezm[Ä™e]|dodaj|poprosz[Ä™e]|chc[Ä™e]|bior[Ä™e]|chciaĹ‚(bym|abym)|skusz[Ä™e]|spr[oĂł]buj[Ä™e]|zdecyduj[Ä™e]|lec[Ä™e]\s+na|bior[Ä™e]\s+to)\b/i;

        const isRecommend = RECOMMEND_KEYWORDS.some(k => normalized.includes(k));
        const isDiscovery = DISCOVERY_KEYWORDS.some(k => normalized.includes(k));
        const isUncertain = UNCERTAINTY_KEYWORDS.some(k => normalized.includes(k));
        const isNumericDiscovery = NUMERALS.test(normalized) && !ORDER_VERBS.test(normalized);

        if (isRecommend) {
            if (session?.currentRestaurant) {
                BrainLogger.nlu('đź›ˇď¸Ź IN_RESTAURANT_GUARD: blocked recommend/find_nearby inside restaurant context');
            } else {
            // If recommend + location â†’ treat as find_nearby (implicit discovery)
                if (location) {
                    return {
                        intent: 'find_nearby',
                        confidence: 0.99,
                        source: 'recommend_with_location',
                        entities
                    };
                }
                // No location â†’ ask where to search
                return {
                    intent: 'recommend',
                    confidence: 0.99,
                    source: 'recommend_keyword',
                    entities
                };
            }
        }

        if (isDiscovery || isNumericDiscovery || isUncertain) {
            // PRIORITY FIX: If specific restaurant is named, we might want to select it, 
            // BUT if it's "Szukam <restauracji>" it implies looking for it (find_nearby/map) OR selecting text.
            // However, "Szukam w Piekarach" (Location) should ALWAYS be find_nearby.

            // If we have a Location entity AND Discovery keyword, Force find_nearby
            // (Even if 'Piekarach' loosely matches a restaurant name)
            if ((location || !matchedRestaurant) && (!session?.currentRestaurant || isExplicitRestaurantSearch(text))) {
                return {
                    intent: 'find_nearby',
                    confidence: 0.99,
                    source: isNumericDiscovery ? 'rule_5_numeric' : (isUncertain ? 'uncertainty_block' : 'discovery_guard_block'),
                    entities
                };
            }
        }

        // --- RULE 3: Strict Restaurant Match (Catalog) ---
        // If we found a restaurant from our static list 
        if (matchedRestaurant) {
            // Check for ordering context FIRST
            // Fix: "Zamawiam z Bar Praha" should be create_order, not select_restaurant
            // UPDATED: Included "chciaĹ‚bym/chciaĹ‚abym"
            const isOrderContext = /\b(zamawiam|zamow|zamĂłw|poprosze|poprosz[Ä™e]|wezme|wezm[Ä™e]|biore|bior[Ä™e]|chce|chc[Ä™e]|dla mnie|poprosic|chciaĹ‚(bym|abym)|skusz[Ä™e]|spr[oĂł]buj[Ä™e]|zdecyduj[Ä™e]|lec[Ä™e]\s+na|bior[Ä™e]\s+to)\b/i.test(normalized);

            if (isOrderContext) {
                return {
                    intent: 'create_order',
                    confidence: 1.0,
                    source: 'catalog_match_order',
                    entities
                };
            }

            // Check context: "pokaĹĽ menu w Hubertusie" vs "idziemy do Hubertusa"
            if (/\b(menu|karta|oferta|cennik|co\s+ma|co\s+maja|zje[sĹ›][Ä‡c])\b/i.test(normalized)) {
                return {
                    intent: 'menu_request', // Or show_menu alias
                    confidence: 1.0,
                    source: 'catalog_match_menu',
                    entities
                };
            }
            // Default to selecting that restaurant (outside restaurant context)
            if (!session?.currentRestaurant) {
                return {
                    intent: 'select_restaurant',
                    confidence: 0.98,
                    source: 'catalog_match_explicit',
                    entities
                };
            }
        }

        // --- RULE 3b: Aliases & Entity Parsing (Dish Detection) ---
        // (Previously parsed above for entities object)

        // --- RULE 1: Show + Restaurant (UX Guard) ---
        if (parsed.restaurant && /\b(pokaz|pokaĹĽ|co|jakie|zobacz)\b/i.test(normalized)) {
            if (!isDiscovery) {
                return {
                    intent: 'menu_request',
                    confidence: 1.0,
                    source: 'guard_rule_1',
                    entities: { ...entities, restaurant: parsed.restaurant, dish: parsed.dish }
                };
            }
        }

        // --- OPTIMIZATION: Task 1 - Restaurant Lock ---
        if (session?.context === 'IN_RESTAURANT' && session?.lockedRestaurantId) {
            if (/(zmieĹ„|wrĂłÄ‡|inn[ea]|powrĂłt)/i.test(normalized)) {
                return { intent: 'find_nearby', confidence: 0.9, source: 'lock_escape', entities: {} };
            }
        }

        // --- OPTIMIZATION: Task 3 - Lexical Override (Priority high) ---
        // UPDATED: Syncing verbs
        const isOrderingVerb = /(wybieram|poprosze|poprosz[Ä™e]|wezme|wezm[Ä™e]|dodaj|zamawiam|zamow|zamĂłw|chce|chc[Ä™e]|zamowie|zamĂłwiÄ™|biore|bior[Ä™e]|chciaĹ‚(bym|abym)|skusz[Ä™e]|spr[oĂł]buj[Ä™e]|zdecyduj[Ä™e]|lec[Ä™e]\s+na|bior[Ä™e]\s+to)/i.test(normalized);
        const wantsMenuFirst = /\b(menu|karta|karte|kartÄ™|oferta|ofertÄ™|oferte|cennik|co\s+macie|lista|pokaz|pokaĹĽ|zobacz)\b/i.test(normalized);
        const isChceDiscovery = /chc[Ä™e]\s+(co|gdzie|zje|jedzenie|kuchni|kuchnia|dania|danie|azjatyckie|wloskie|wĹ‚oskie|chinskie|chiĹ„skie|orientalne|restauracj)/i.test(normalized);

        if (!wantsMenuFirst && isOrderingVerb && !isChceDiscovery) {
            // SAFETY CHECK: Ambiguous Item Order (Disambiguation Guard)
            // If we are ordering, but have NO restaurant context/entity, assume discovery/disambiguation needed.
            // Exception: If we have a very obscure unique item, Legacy/Smart logic below might catch it, 
            // but for safety, "Zamawiam frytki" (no context) -> find_nearby.

            // FIX: If we found a known dish (parsed.dish), that counts as context!
            // REVERTED: Including parsed.dish breaks Disambiguation Safeguard (generic items like "frytki" become orders).
            // We must rely on legacy/smart layer for specific items, or require restaurant context.
            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            // COLLOQUIAL ORDERING in restaurant context: fire immediately,
            // never fall through to legacy (legacy would set choose_restaurant)
            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            const hasRestCtx = session?.lastRestaurant || session?.currentRestaurant ||
                session?.context === 'IN_RESTAURANT' ||
                entities.restaurant || matchedRestaurant || parsed.restaurant;

            if (hasRestCtx) {
                return {
                    intent: 'create_order',
                    confidence: 1.0,
                    source: 'lexical_override',
                    entities
                };
            }
            // If no context, FALL THROUGH.
            // "Zamawiam frytki" will likely hit FOOD_WORDS fallback -> find_nearby (Safe).
        }

        // (Redundant guards moved up)

        // --- RULE 7: Generic Confirm (Legacy Parity) ---
        if (/^tak$/i.test(normalized)) {
            return { intent: 'confirm', confidence: 0.9, source: 'generic_confirm', entities };
        }

        // 1.5 Explicit Regex NLU (Standardized)

        // A. Menu Request (Simple only OR complex with "pokaĹĽ menu")
        // Relaxed: if "pokaĹĽ/zobacz" + "menu/karta/oferta" anywhere in text OR "co macie"
        if (/^(poka[zĹĽ]\s+)?(menu|karta|karte|kartÄ™|oferta|oferte|ofertÄ™|list[ae])(\s+da[Ĺ„n])?$/i.test(normalized) ||
            /\b(poka[zĹĽ]|zobacz|sprawdz|sprawdĹş|co)\b.*\b(menu|karta|karte|kartÄ™|oferta|oferte|ofertÄ™|list[ae]|cennik|macie|oferte|ofertÄ™)\b/i.test(normalized)) {
            return {
                intent: 'menu_request',
                confidence: 0.95,
                source: 'regex_v2',
                entities
            };
        }

        // B. Find Nearby / Discovery (Fallback Regex)
        // NOTE: Also triggers for standalone food words when no order context (exploration mode)
        // B. Find Nearby / Discovery (Fallback Regex)
        // NOTE: Also triggers for standalone food words when no order context (exploration mode)
        const findRegex = /(co|gdzie).*(zje[sĹ›][Ä‡c]|poleca|poleci|masz|macie|jedzenia|jedzenie)|(szukam|znajd[Ĺşz]).*|(chc[Ä™e]|gĹ‚odny|glodny|ochote|ochotÄ™|co[Ĺ›s]).*(co[Ĺ›s]|zje[sĹ›][Ä‡c]|jedzenie|kuchni)|(lokale|restauracje|knajpy|pizzeri[ae]|kebaby|kebab|bary|pizza|burger|jedzenie|gĹ‚odny|glodny)/i;

        // Guard: don't trigger findRegex if we have strong ordering verbs like "poproszÄ™" or "zamawiam"
        // UPDATED: Syncing verbs
        const hasOrderVerbStrict = /\b(poprosze|poprosz[Ä™e]|zamawiam|zamow|wezme|wezm[Ä™e]|biore|bior[Ä™e]|dodaj|chciaĹ‚(bym|abym)|skusz[Ä™e]|spr[oĂł]buj[Ä™e]|zdecyduj[Ä™e]|lec[Ä™e]\s+na|bior[Ä™e]\s+to)\b/i.test(normalized);

        if (findRegex.test(normalized) && !hasOrderVerbStrict && !session?.currentRestaurant) {
            return {
                intent: 'find_nearby',
                confidence: 0.95,
                source: 'regex_v2',
                entities
            };
        }

        // 2. Smart Intent Layer (Hybrid: LLM Fallback)
        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        // SINGLE-ROUTING INVARIANT: Classic/legacy router disabled in V2 mode.
        // When EXPERT_MODE=true  â†’ smartResolveIntent (Gemini) is the fallback.
        // When EXPERT_MODE=false â†’ V2 rule layers above are the sole source of truth.
        //   The legacy intentRouterGlue is DISABLED to prevent:
        //   (a) double intent resolution (rule_guard fires, then classic fires again)
        //   (b) source label confusion ('classic_legacy' mixed with 'rule_guard')
        //   (c) hard-blocked ordering intents leaking through as 'find_nearby'
        // To re-enable legacy: set LEGACY_CLASSIC_ENABLED=true in .env (emergency)
        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        try {
            const EXPERT_MODE = process.env.EXPERT_MODE === 'true';
            // LEGACY_CLASSIC_ENABLED removed â€” classic routing disabled permanently

            if (EXPERT_MODE) {
                const smartResult = await smartResolveIntent({
                    text,
                    session,
                    sessionId: ctx?.sessionId,
                    previousIntent: session?.lastIntent
                });

                if (smartResult && smartResult.intent && smartResult.intent !== 'unknown') {
                    if (session?.currentRestaurant && ['find_nearby', 'choose_restaurant', 'select_restaurant'].includes(smartResult.intent) && !isExplicitRestaurantSearch(text)) {
                        BrainLogger.nlu(`đź›ˇď¸Ź SMART_DISCOVERY_GUARD: blocked "${smartResult.intent}" while in restaurant context`);
                    } else {
                    return {
                        intent: smartResult.intent,
                        confidence: smartResult.confidence || 0.8,
                        source: smartResult.source || 'smart_hybrid',
                        entities: { ...entities, ...smartResult.slots }
                    };
                    }
                }
            } else {
                // V2 mode with classic disabled â€” expected path
                BrainLogger.nlu('NLU: Classic disabled (V2 mode). Falling through to food_word_fallback.');
            }
        } catch (e) {
            console.warn('SmartIntent/Legacy failed', e);
        }

        // 3. Food-word Fallback: if unknown but contains food words, assume exploration
        const FOOD_WORDS = /\b(pizza|pizz[aeÄ™yÄ™]|kebab|kebaba|burger|burgera|burgery|sushi|ramen|pad\s*thai|pho|pierogi|pierog|zupy?|zup[Ä™ka]|schabowy?|kotlet|frytki|frytek|king|kfc|mcdonald|mac|jedzenie|cos|coĹ›|zjeĹ›Ä‡|zjesz|dania|baner|dobry|cola|colÄ™|cole|coca|fanta|sprite|woda|wode|wodÄ™|napĂłj|napoje)\b/i;
        if (FOOD_WORDS.test(normalized) && !session?.currentRestaurant) {
            return {
                intent: 'find_nearby',
                confidence: 0.6,
                source: 'food_word_fallback',
                entities
            };
        }

        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        // 4. LLM INTENT TRANSLATOR (LAST FALLBACK)
        // Only runs if all other methods failed
        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        const LLM_TRANSLATOR_ENABLED = process.env.LLM_TRANSLATOR_ENABLED === 'true';

        if (LLM_TRANSLATOR_ENABLED) {
            try {
                const { translateIntent } = await import('./intentTranslator.js');

                const llmResult = await translateIntent(text, {
                    // READ-ONLY hints (no session mutation possible)
                    lastIntent: session?.lastIntent,
                    hasRestaurant: !!session?.currentRestaurant,
                    hasLocation: !!session?.last_location
                });

                if (llmResult && llmResult.intent !== 'unknown' && llmResult.source === 'llm_translator') {
                    if (session?.currentRestaurant && ['find_nearby', 'choose_restaurant', 'select_restaurant'].includes(llmResult.intent) && !isExplicitRestaurantSearch(text)) {
                        BrainLogger.nlu(`đź›ˇď¸Ź LLM_DISCOVERY_GUARD: blocked "${llmResult.intent}" while in restaurant context`);
                    } else {
                    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
                    // HARD BLOCK: LLM cannot execute ordering intents
                    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
                    if (llmResult.intent === 'create_order' || llmResult.intent === 'confirm_order') {
                        console.warn('đź›ˇď¸Ź LLM tried ordering intent - blocked, downgrading to find_nearby');
                        return {
                            intent: 'find_nearby',
                            confidence: 0.7,
                            source: 'llm_ordering_blocked',
                            entities: {
                                ...entities,
                                dish: llmResult.entities?.dish || entities.dish
                            }
                        };
                    }

                    // LLM result accepted (non-ordering intent)
                    return {
                        intent: llmResult.intent,
                        confidence: llmResult.confidence,
                        source: llmResult.source,
                        entities: {
                            ...entities,
                            ...llmResult.entities
                        }
                    };
                    }
                }
            } catch (e) {
                console.warn('đź›ˇď¸Ź LLM Translator failed:', e.message);
                // Continue to final fallback
            }
        }

        // 5. Default order fallback inside restaurant context
        if (session?.currentRestaurant && session?.last_menu) {
            const isControlIntent = /\b(status|zam[oĂł]wienie|koszyk|p[lĹ‚]ac[Ä™e]|checkout|help|pomoc|co\s+robi[Ä‡c]|menu|karta)\b/i.test(normalized);
            const menuItems = Array.isArray(session.last_menu)
                ? session.last_menu
                : Array.isArray(session.last_menu?.items)
                    ? session.last_menu.items
                    : [];

            if (!isControlIntent) {
                if (explicitRestaurantSearch) {
                    return {
                        intent: 'find_nearby',
                        confidence: 0.9,
                        source: 'restaurant_navigation_override',
                        entities
                    };
                }

                const qty = extractQuantity(text) || 1;
                const textForDish = text.replace(/^(?:\\d+\\s*|jeden|jedna|jedno|dwa|dwie|trzy|cztery|pi[eÄ™][cÄ‡][u]?|sze[sĹ›][cÄ‡][u]?|siedem|osiem|dziewi[eÄ™][cÄ‡][u]?|dziesi[eÄ™][cÄ‡][u]?|kilka|par[Ä™e])\\s+/i, '').trim();
                const dishMatch = menuItems.find(item =>
                    fuzzyIncludes(item.base_name || item.name, textForDish)
                );

                if (dishMatch) {
                    return {
                        intent: 'create_order',
                        confidence: 0.7,
                        source: 'default_order_fallback_match',
                        entities: {
                            ...entities,
                            dish: dishMatch.name,
                            quantity: qty,
                            restaurant: session.currentRestaurant.name,
                            restaurantId: session.currentRestaurant.id
                        }
                    };
                }

                return {
                    intent: 'create_order',
                    confidence: 0.6,
                    source: 'default_order_fallback_item_not_found',
                    entities: {
                        ...entities,
                        dish: textForDish || text,
                        requestedDish: textForDish,
                        itemLookupStatus: 'ITEM_NOT_FOUND',
                        quantity: qty,
                        restaurant: session.currentRestaurant.name,
                        restaurantId: session.currentRestaurant.id
                    }
                };
            }
        }

        // Restaurant context dish fallback
        if (session?.currentRestaurant) {
            const dishTokenText = normalizeDish(normalized);

            // single-token dish phrases
            if (dishTokenText && dishTokenText.split(' ').length <= 2) {
                return {
                    intent: 'create_order',
                    confidence: 0.55,
                    source: 'restaurant_context_dish_fallback',
                    entities: {
                        ...entities,
                        dish: dishTokenText,
                        quantity: extractQuantity(normalized)
                    }
                };
            }
        }

        // 6. Last Resort Fallback
        return {
            intent: 'unknown',
            confidence: 0.0,
            source: 'fallback',
            entities
        };
    }
}


