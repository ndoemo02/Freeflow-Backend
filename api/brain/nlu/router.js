/**
 * NLU Router - Decyzyjny Mózg (V2)
 * Odpowiada za klasyfikację intencji i ekstrakcję encji.
 * Wykorzystuje Static Catalog dla wydajności.
 */

import { normalizeTxt } from '../intents/intentRouterGlue.js';
import { BrainLogger } from '../../../utils/logger.js';
import { smartResolveIntent } from '../ai/smartIntent.js';
import { parseRestaurantAndDish } from '../order/parseOrderItems.js';
import { extractLocation, extractCuisineType, extractQuantity } from './extractors.js';
import { findRestaurantInText } from '../data/restaurantCatalog.js';
import { fuzzyIncludes } from '../helpers.js';

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
     * Wykrywa intencję z tekstu i kontekstu
     * @param {Object} ctx - Pipeline context (text, session, etc.)
     * @returns {Promise<{intent: string, confidence: number, entities: Object, source: string, domain: string}>}
     */
    async detect(ctx) {
        const result = await this._detectInternal(ctx);
        // Enrich with domain
        result.domain = this._mapDomain(result.intent);

        console.log('🧠 NLURouter Result:', JSON.stringify(result, null, 2));
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
        // If user says "Pokaż menu", that's menu_request even if system was awaiting location
        const isExplicitMenuRequest = /^(poka[zż]\s+)?(menu|karta|karte|kartę|oferta|oferte|ofertę|list[ae])(\s+da[ńn])?$/i.test(normalized) ||
            /\b(poka[zż]|zobacz|sprawdz|sprawdź|co)\b.*\b(menu|karta|karte|kartę|oferta|oferte|ofertę|list[ae]|cennik|macie)\b/i.test(normalized);

        if (isExplicitMenuRequest && session?.currentRestaurant) {
            return {
                intent: 'menu_request',
                confidence: 1.0,
                source: 'explicit_menu_override',
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
            if (/\b(tak|potwierdzam|potwierdza|ok|dobra|zamawiam|dodaj|prosze|proszę)\b/i.test(normalized)) {
                return { intent: 'confirm_order', confidence: 1.0, source: 'rule_guard', entities };
            }
        }

        // NEW: Guard for confirm_add_to_cart context
        if (session?.expectedContext === 'confirm_add_to_cart') {
            if (/\b(tak|potwierdzam|ok|dodaj|dawaj)\b/i.test(normalized)) {
                return { intent: 'confirm_add_to_cart', confidence: 1.0, source: 'rule_guard', entities };
            }
            if (/\b(nie|anuluj|stop|rezygnuję)\b/i.test(normalized)) {
                return { intent: 'cancel_order', confidence: 1.0, source: 'rule_guard', entities };
            }
        }

        // Guard for confirm_restaurant context (fuzzy confirmation)
        if (session?.expectedContext === 'confirm_restaurant') {
            if (/\b(tak|potwierdzam|ok|ta|tą|tę|tę)\b/i.test(normalized)) {
                // User confirmed - use pending restaurant
                return {
                    intent: 'select_restaurant',
                    confidence: 1.0,
                    source: 'rule_guard',
                    entities: { ...entities, confirmedRestaurant: session.pendingRestaurantConfirm }
                };
            }
            if (/\b(nie|inna|inną|zmień|zmien)\b/i.test(normalized)) {
                // User wants different restaurant
                return { intent: 'find_nearby', confidence: 1.0, source: 'rule_guard', entities };
            }
        }

        if (session?.expectedContext === 'select_restaurant' || session?.expectedContext === 'show_more_options') {
            const isIntentLike = /(menu|zamawiam|zamów|poproszę|poprosze|wezmę|wezme|chcę|chce|pokaż|pokaz|znajdź|znajdz|gdzie|health)/i.test(normalized);
            const isManualSelection = /\b(numer|nr|opcja|opcje)\s+\d+\b/i.test(normalized);
            // If it's just a number or simple phrase, it's selection
            if (!isIntentLike || /^[0-9]\b/.test(normalized.trim()) || isManualSelection) {
                // If it contains "inne" or "wiecej", it might be show_more_options
                if (/\b(wiecej|więcej|inne|lista)\b/i.test(normalized) && !isManualSelection) {
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
        if (/\b(wiecej|więcej|inne|opcje|lista)\b/i.test(normalized)) {
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
            const ordinalRegex = /^(?:poprosz[ęe]\s+|wezm[ęe]\s+|chc[ęe]\s+|zamawiam\s+|daj\s+|wybieram\s+|biore\s+|bior[ęe]\s+)?(?:ten\s+|t[aąę]\s+|to\s+)?(pierwsz[yae]|drug[iae]|trzec[iae]|czwart[yae]|pi[aą]t[yae]|ostatni[a|e]?)\s*$/i;
            const match = normalized.trim().match(ordinalRegex);

            if (match) {
                const word = match[1].toLowerCase();
                let idx = -1;

                if (word.startsWith('pierwsz')) idx = 0;
                else if (word.startsWith('drug')) idx = 1;
                else if (word.startsWith('trzec')) idx = 2;
                else if (word.startsWith('czwart')) idx = 3;
                else if (word.startsWith('piat') || word.startsWith('piąt')) idx = 4;
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

                // Brak listy referencyjnej, lub index poza tablicą -> prosimy o doprecyzowanie
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
        // NOTE: This guard runs BEFORE isNumericDiscovery so "dwa Pizza" →
        //       create_order+qty=2 instead of find_nearby.
        if (session?.currentRestaurant && session?.last_menu?.length > 0) {
            const menu = session.last_menu;
            const qty = extractQuantity(text) || 1;

            // Strip leading quantity word so "dwa Pizza Margherita" → "Pizza Margherita"
            const QTY_STRIP = /^(?:jeden|jedna|jedno|dwa|dwie|trzy|cztery|pi[eę][cć][u]?|sze[sś][cć][u]?|siedem|osiem|dziewi[eę][cć][u]?|dziesi[eę][cć][u]?|kilka|par[ęe])\s+/i;
            const textForDish = text.replace(QTY_STRIP, '').trim();
            const normalizedForDish = normalizeTxt(textForDish);

            // 1. Fuzzy name match (existing)
            let dishMatch = menu.find(item => fuzzyIncludes(item.base_name || item.name, textForDish));

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
                        BrainLogger.nlu(`🔤 DISH_ALIAS: "${matchedWord}" → "${item.name}"`);
                        break;
                    }
                }
            }

            if (dishMatch) {
                BrainLogger.nlu(`🍽️ DISH_GUARD: Matched "${dishMatch.name}" from menu in restaurant ${session.currentRestaurant.name}`);
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
            BrainLogger.nlu(`🔢 QTY_DISH_MERGE: qty=${entities.quantity} dish="${entities.dish}"`);
            return {
                intent: 'create_order',
                domain: 'ordering',
                confidence: 0.95,
                source: 'quantity_order',
                entities
            };
        }

        // ═══════════════════════════════════════════════════════════════════
        // TRANSACTION LOCK — in-router guard (Patch 2)
        // Fires BEFORE discovery rules so discovery_guard_block cannot leak.
        // If the user has a pending order or awaits cart confirmation,
        // any non-ordering intent is blocked here.
        // ═══════════════════════════════════════════════════════════════════
        const ORDER_INTENTS_LOCK = [
            'create_order', 'confirm_add_to_cart', 'remove_from_cart',
            'confirm_order', 'cancel_order'
        ];
        if (session?.pendingOrder || session?.expectedContext === 'confirm_add_to_cart') {
            // Use expectedContext so FSM stays in the right state
            const lockedIntent = session.expectedContext || 'create_order';
            // Only lock if detected intent would escape the ordering flow
            // We check "preemptively" here before running discovery — no detected intent yet
            // so we just short-circuit the rest of the router.
            BrainLogger.nlu(`🔒 ROUTER_TRANSACTION_LOCK: forcing "${lockedIntent}" (pendingOrder=${!!session.pendingOrder})`);
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
        const DISCOVERY_KEYWORDS = ['miejsca', 'restauracje', 'lokale', 'pizzerie', 'gdzie', 'szukam', 'znajdz', 'znajdź',
            'kolo mnie', 'koło mnie', 'w poblizu', 'w pobliżu', 'blisko', 'niedaleko', 'w okolicy'];
        // 0.25 Uncertainty markers (e.g., "kfc chyba" = user is exploring, not ordering)
        const UNCERTAINTY_KEYWORDS = ['chyba', 'może', 'jakiś', 'jakieś', 'coś'];
        // 0.5 Explicit Recommend Keywords
        const RECOMMEND_KEYWORDS = ['polecisz', 'polec'];
        // 5. Numeric Discovery (e.g. "dwa kebaby", "trzy lokale") - if no ordering verb, it's discovery
        const NUMERALS = /\b(dwa|dwie|dwoje|trzy|troje|cztery|pięć|sześć|siedem|osiem|dziewięć|dziesięć|kilka|parę)\b/i;
        // UPDATED: Added natural forms: "biorę", "wezmę", "poproszę", "chciałbym", "chciałabym"
        const ORDER_VERBS = /\b(menu|karta|oferta|zamawiam|wezm[ęe]|dodaj|poprosz[ęe]|chc[ęe]|bior[ęe]|chciał(bym|abym)|skusz[ęe]|spr[oó]buj[ęe]|zdecyduj[ęe]|lec[ęe]\s+na|bior[ęe]\s+to)\b/i;

        const isRecommend = RECOMMEND_KEYWORDS.some(k => normalized.includes(k));
        const isDiscovery = DISCOVERY_KEYWORDS.some(k => normalized.includes(k));
        const isUncertain = UNCERTAINTY_KEYWORDS.some(k => normalized.includes(k));
        const isNumericDiscovery = NUMERALS.test(normalized) && !ORDER_VERBS.test(normalized);

        if (isRecommend) {
            // If recommend + location → treat as find_nearby (implicit discovery)
            if (location) {
                return {
                    intent: 'find_nearby',
                    confidence: 0.99,
                    source: 'recommend_with_location',
                    entities
                };
            }
            // No location → ask where to search
            return {
                intent: 'recommend',
                confidence: 0.99,
                source: 'recommend_keyword',
                entities
            };
        }

        if (isDiscovery || isNumericDiscovery || isUncertain) {
            // PRIORITY FIX: If specific restaurant is named, we might want to select it, 
            // BUT if it's "Szukam <restauracji>" it implies looking for it (find_nearby/map) OR selecting text.
            // However, "Szukam w Piekarach" (Location) should ALWAYS be find_nearby.

            // If we have a Location entity AND Discovery keyword, Force find_nearby
            // (Even if 'Piekarach' loosely matches a restaurant name)
            if (location || !matchedRestaurant) {
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
            // UPDATED: Included "chciałbym/chciałabym"
            const isOrderContext = /\b(zamawiam|zamow|zamów|poprosze|poprosz[ęe]|wezme|wezm[ęe]|biore|bior[ęe]|chce|chc[ęe]|dla mnie|poprosic|chciał(bym|abym)|skusz[ęe]|spr[oó]buj[ęe]|zdecyduj[ęe]|lec[ęe]\s+na|bior[ęe]\s+to)\b/i.test(normalized);

            if (isOrderContext) {
                return {
                    intent: 'create_order',
                    confidence: 1.0,
                    source: 'catalog_match_order',
                    entities
                };
            }

            // Check context: "pokaż menu w Hubertusie" vs "idziemy do Hubertusa"
            if (/\b(menu|karta|oferta|cennik|co\s+ma|co\s+maja|zje[sś][ćc])\b/i.test(normalized)) {
                return {
                    intent: 'menu_request', // Or show_menu alias
                    confidence: 1.0,
                    source: 'catalog_match_menu',
                    entities
                };
            }
            // Default to selecting that restaurant
            return {
                intent: 'select_restaurant',
                confidence: 0.98,
                source: 'catalog_match_explicit',
                entities
            };
        }

        // --- RULE 3b: Aliases & Entity Parsing (Dish Detection) ---
        // (Previously parsed above for entities object)

        // --- RULE 1: Show + Restaurant (UX Guard) ---
        if (parsed.restaurant && /\b(pokaz|pokaż|co|jakie|zobacz)\b/i.test(normalized)) {
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
            if (/(zmień|wróć|inn[ea]|powrót)/i.test(normalized)) {
                return { intent: 'find_nearby', confidence: 0.9, source: 'lock_escape', entities: {} };
            }
        }

        // --- OPTIMIZATION: Task 3 - Lexical Override (Priority high) ---
        // UPDATED: Syncing verbs
        const isOrderingVerb = /(wybieram|poprosze|poprosz[ęe]|wezme|wezm[ęe]|dodaj|zamawiam|zamow|zamów|chce|chc[ęe]|zamowie|zamówię|biore|bior[ęe]|chciał(bym|abym)|skusz[ęe]|spr[oó]buj[ęe]|zdecyduj[ęe]|lec[ęe]\s+na|bior[ęe]\s+to)/i.test(normalized);
        const wantsMenuFirst = /\b(menu|karta|karte|kartę|oferta|ofertę|oferte|cennik|co\s+macie|lista|pokaz|pokaż|zobacz)\b/i.test(normalized);
        const isChceDiscovery = /chc[ęe]\s+(co|gdzie|zje|jedzenie|kuchni|kuchnia|dania|danie|azjatyckie|wloskie|włoskie|chinskie|chińskie|orientalne|restauracj)/i.test(normalized);

        if (!wantsMenuFirst && isOrderingVerb && !isChceDiscovery) {
            // SAFETY CHECK: Ambiguous Item Order (Disambiguation Guard)
            // If we are ordering, but have NO restaurant context/entity, assume discovery/disambiguation needed.
            // Exception: If we have a very obscure unique item, Legacy/Smart logic below might catch it, 
            // but for safety, "Zamawiam frytki" (no context) -> find_nearby.

            // FIX: If we found a known dish (parsed.dish), that counts as context!
            // REVERTED: Including parsed.dish breaks Disambiguation Safeguard (generic items like "frytki" become orders).
            // We must rely on legacy/smart layer for specific items, or require restaurant context.
            // ═══════════════════════════════════════════════════════════════════
            // COLLOQUIAL ORDERING in restaurant context: fire immediately,
            // never fall through to legacy (legacy would set choose_restaurant)
            // ═══════════════════════════════════════════════════════════════════
            // ═══════════════════════════════════════════════════════════════════
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

        // A. Menu Request (Simple only OR complex with "pokaż menu")
        // Relaxed: if "pokaż/zobacz" + "menu/karta/oferta" anywhere in text OR "co macie"
        if (/^(poka[zż]\s+)?(menu|karta|karte|kartę|oferta|oferte|ofertę|list[ae])(\s+da[ńn])?$/i.test(normalized) ||
            /\b(poka[zż]|zobacz|sprawdz|sprawdź|co)\b.*\b(menu|karta|karte|kartę|oferta|oferte|ofertę|list[ae]|cennik|macie|oferte|ofertę)\b/i.test(normalized)) {
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
        const findRegex = /(co|gdzie).*(zje[sś][ćc]|poleca|poleci|masz|macie|jedzenia|jedzenie)|(szukam|znajd[źz]).*|(chc[ęe]|głodny|glodny|ochote|ochotę|co[śs]).*(co[śs]|zje[sś][ćc]|jedzenie|kuchni)|(lokale|restauracje|knajpy|pizzeri[ae]|kebaby|kebab|bary|pizza|burger|jedzenie|głodny|glodny)/i;

        // Guard: don't trigger findRegex if we have strong ordering verbs like "poproszę" or "zamawiam"
        // UPDATED: Syncing verbs
        const hasOrderVerbStrict = /\b(poprosze|poprosz[ęe]|zamawiam|zamow|wezme|wezm[ęe]|biore|bior[ęe]|dodaj|chciał(bym|abym)|skusz[ęe]|spr[oó]buj[ęe]|zdecyduj[ęe]|lec[ęe]\s+na|bior[ęe]\s+to)\b/i.test(normalized);

        if (findRegex.test(normalized) && !hasOrderVerbStrict) {
            return {
                intent: 'find_nearby',
                confidence: 0.95,
                source: 'regex_v2',
                entities
            };
        }

        // 2. Smart Intent Layer (Hybrid: LLM Fallback)
        // ═══════════════════════════════════════════════════════════════════
        // SINGLE-ROUTING INVARIANT: Classic/legacy router disabled in V2 mode.
        // When EXPERT_MODE=true  → smartResolveIntent (Gemini) is the fallback.
        // When EXPERT_MODE=false → V2 rule layers above are the sole source of truth.
        //   The legacy intentRouterGlue is DISABLED to prevent:
        //   (a) double intent resolution (rule_guard fires, then classic fires again)
        //   (b) source label confusion ('classic_legacy' mixed with 'rule_guard')
        //   (c) hard-blocked ordering intents leaking through as 'find_nearby'
        // To re-enable legacy: set LEGACY_CLASSIC_ENABLED=true in .env (emergency)
        // ═══════════════════════════════════════════════════════════════════
        try {
            const EXPERT_MODE = process.env.EXPERT_MODE === 'true';
            // LEGACY_CLASSIC_ENABLED removed — classic routing disabled permanently

            if (EXPERT_MODE) {
                const smartResult = await smartResolveIntent({
                    text,
                    session,
                    previousIntent: session?.lastIntent
                });

                if (smartResult && smartResult.intent && smartResult.intent !== 'unknown') {
                    return {
                        intent: smartResult.intent,
                        confidence: smartResult.confidence || 0.8,
                        source: smartResult.source || 'smart_hybrid',
                        entities: { ...entities, ...smartResult.slots }
                    };
                }
            } else {
                // V2 mode with classic disabled — expected path
                BrainLogger.nlu('NLU: Classic disabled (V2 mode). Falling through to food_word_fallback.');
            }
        } catch (e) {
            console.warn('SmartIntent/Legacy failed', e);
        }

        // 3. Food-word Fallback: if unknown but contains food words, assume exploration
        const FOOD_WORDS = /\b(pizza|pizz[aeęyę]|kebab|kebaba|burger|burgera|burgery|sushi|ramen|pad\s*thai|pho|pierogi|pierog|zupy?|zup[ęka]|schabowy?|kotlet|frytki|frytek|king|kfc|mcdonald|mac|jedzenie|cos|coś|zjeść|zjesz|dania|baner|dobry|cola|colę|cole|coca|fanta|sprite|woda|wode|wodę|napój|napoje)\b/i;
        if (FOOD_WORDS.test(normalized)) {
            return {
                intent: 'find_nearby',
                confidence: 0.6,
                source: 'food_word_fallback',
                entities
            };
        }

        // ═══════════════════════════════════════════════════════════════════
        // 4. LLM INTENT TRANSLATOR (LAST FALLBACK)
        // Only runs if all other methods failed
        // ═══════════════════════════════════════════════════════════════════
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
                    // ═══════════════════════════════════════════════════════════════════
                    // HARD BLOCK: LLM cannot execute ordering intents
                    // ═══════════════════════════════════════════════════════════════════
                    if (llmResult.intent === 'create_order' || llmResult.intent === 'confirm_order') {
                        console.warn('🛡️ LLM tried ordering intent - blocked, downgrading to find_nearby');
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
            } catch (e) {
                console.warn('🛡️ LLM Translator failed:', e.message);
                // Continue to final fallback
            }
        }

        // 5. Last Resort Fallback
        return {
            intent: 'unknown',
            confidence: 0.0,
            source: 'fallback',
            entities
        };
    }
}
