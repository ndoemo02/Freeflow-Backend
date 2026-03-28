/**
 * NLU Router - Decyzyjny MÄ‚Ĺ‚zg (V2)
 * Odpowiada za klasyfikacjĂ„â„˘ intencji i ekstrakcjĂ„â„˘ encji.
 * Wykorzystuje Static Catalog dla wydajnoÄąâ€şci.
 */

import { normalizeTxt } from '../intents/intentRouterGlue.js';
import { BrainLogger } from '../../../utils/logger.js';
import { smartResolveIntent } from '../ai/smartIntent.js';
import { parseRestaurantAndDish } from '../order/parseOrderItems.js';
import { extractLocation, extractCuisineType, extractQuantity } from './extractors.js';
import { findRestaurantInText } from '../data/restaurantCatalog.js';
import { fuzzyIncludes, normalizeDish, levenshtein } from '../helpers.js';
import { parseCompoundOrder } from './compoundOrderParser.js';
import { canonicalizeDish } from './dishCanon.js';

function isExplicitRestaurantSearch(text = '') {
    const t = String(text || '').toLowerCase();
    const loose = toLooseAscii(text);
    return [
        'restaurac',
        'pokaÄąÄ˝ restauracje',
        'pokaz restauracje',
        'znajdÄąĹź restauracje',
        'znajdz restauracje',
        'dostĂ„â„˘pne restauracje',
        'dostepne restauracje',
        'w pobliÄąÄ˝u',
        'w poblizu',
        'gdzie zjem',
        'gdzie zamowie',
        'gdzie zamówię',
        'gdzie moge zamowic',
        'gdzie mogÄ™ zamĂłwiÄ‡',
        'gdzie mogĂ„â„˘ zjeÄąâ€şĂ„â€ˇ',
        'gdzie moge zjesc'
    ].some(k => t.includes(k) || loose.includes(toLooseAscii(k)));
}

function toLooseAscii(value = '') {
    return String(value || '')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function isAliasBundleText(value = '') {
    const normalized = String(value || '').trim();
    if (!normalized) return false;
    return normalized.includes('/') || normalized.includes(',');
}

const GENERIC_COMPOUND_TOKENS = new Set([
    'sos',
    'sosy',
    'napoj',
    'napoje',
    'pizza',
    'burger',
    'dodatki',
    'dodatek',
]);

function stripCompoundQuantityOperators(value = '') {
    return normalizeDish(String(value || ''))
        .replace(/^\s*(?:x\s*\d+|\d+\s*x|\d+\s*razy|razy\s*\d+)\b/, '')
        .replace(/^\s*(?:\d+|jeden|jedna|jedno|dwa|dwie|trzy|cztery|piec|szesc|siedem|osiem|dziewiec|dziesiec|kilka|pare)\s*(?:x|razy)?\b/, '')
        .replace(/\b(?:x\s*\d+|\d+\s*x|\d+\s*razy|razy\s*\d+)\b/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function isGenericCompoundToken(value = '') {
    const stripped = stripCompoundQuantityOperators(value);
    if (!stripped) return false;
    return GENERIC_COMPOUND_TOKENS.has(stripped);
}

function safeCanonicalizeCompoundItem(item = {}, session = null) {
    const originalDish = String(item?.dish || '').trim();
    const incomingMeta = (item?.meta && typeof item.meta === 'object') ? item.meta : {};
    const rawLabel = String(incomingMeta.rawLabel || originalDish).trim() || originalDish;
    const canonicalDish = String(canonicalizeDish(originalDish, session) || '').trim();
    const normalizedOriginal = normalizeDish(originalDish);
    const normalizedCanonical = normalizeDish(canonicalDish);
    const alreadyBundleSafe = Boolean(incomingMeta.canonicalAliasBundle);

    if (alreadyBundleSafe) {
        return {
            item: {
                ...item,
                dish: originalDish || rawLabel,
                meta: {
                    ...incomingMeta,
                    rawLabel,
                    canonicalAliasBundle: true,
                },
            },
            canonicalAlias: incomingMeta.canonicalAlias || null,
            canonicalApplied: false,
        };
    }

    if (!canonicalDish) {
        return {
            item: {
                ...item,
                dish: originalDish,
                meta: {
                    ...incomingMeta,
                    rawLabel,
                },
            },
            canonicalAlias: null,
            canonicalApplied: false,
        };
    }

    if (isAliasBundleText(canonicalDish)) {
        return {
            item: {
                ...item,
                dish: rawLabel || originalDish || canonicalDish,
                meta: {
                    ...incomingMeta,
                    rawLabel,
                    canonicalAlias: canonicalDish,
                    canonicalAliasBundle: true,
                },
            },
            canonicalAlias: canonicalDish,
            canonicalApplied: false,
        };
    }

    if (normalizedOriginal && normalizedOriginal === normalizedCanonical) {
        return {
            item: {
                ...item,
                dish: originalDish || canonicalDish,
                meta: {
                    ...incomingMeta,
                    rawLabel,
                },
            },
            canonicalAlias: null,
            canonicalApplied: false,
        };
    }

    return {
        item: {
            ...item,
            dish: canonicalDish,
            meta: {
                ...incomingMeta,
                rawLabel,
                canonicalAlias: canonicalDish,
            },
        },
        canonicalAlias: canonicalDish,
        canonicalApplied: true,
    };
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
        if (['create_order', 'confirm_order', 'confirm_add_to_cart', 'open_checkout', 'add_item', 'choose_restaurant', 'clarify_order'].includes(intent)) return 'ordering';
        return 'system';
    }

    /**
     * Wykrywa intencjĂ„â„˘ z tekstu i kontekstu
     * @param {Object} ctx - Pipeline context (text, session, etc.)
     * @returns {Promise<{intent: string, confidence: number, entities: Object, source: string, domain: string}>}
     */
    async detect(ctx) {
        const result = await this._detectInternal(ctx);
        // Enrich with domain
        result.domain = this._mapDomain(result.intent);

        console.log('Ä‘ĹşÂ§Â  NLURouter Result:', JSON.stringify(result, null, 2));
        BrainLogger.nlu('Result:', result);
        return result;
    }

    async _detectInternal(ctx) {
        const { text, session } = ctx;
        const safeText = text.replace(/\uFFFD/g, '');
        const normalized = normalizeTxt(safeText);
        const normalizedLoose = toLooseAscii(safeText);

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
            console.log('[DISCOVERY_CONTEXT_OVERRIDE_TRACE]', JSON.stringify({
                source: 'restaurant_navigation_override',
                text,
                location,
                cuisine,
                currentRestaurant: session?.currentRestaurant?.name || null,
            }));
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
        // If user says "PokaÄąÄ˝ menu", that's menu_request even if system was awaiting location
        const isExplicitMenuRequest = /^(poka[zÄąÄ˝]\s+)?(menu|karta|karte|kartĂ„â„˘|oferta|oferte|ofertĂ„â„˘|list[ae])(\s+da[Äąâ€žn])?$/i.test(normalized) ||
            /\b(poka[zÄąÄ˝]|zobacz|sprawdz|sprawdÄąĹź|co)\b.*\b(menu|karta|karte|kartĂ„â„˘|oferta|oferte|ofertĂ„â„˘|list[ae]|cennik|macie)\b/i.test(normalized);

        if (isExplicitMenuRequest && session?.currentRestaurant) {
            return {
                intent: 'menu_request',
                confidence: 1.0,
                source: 'explicit_menu_override',
                entities
            };
        }

        // Intentionally requires explicit checkout verbs to avoid shadowing discovery/menu intents.
        const isExplicitCheckoutRequest =
            /\b(checkout\w*|kasa|platnosc\w*|zaplac\w*|finaliz\w*|zloz(?:yc)?\s+zamowienie|przejdz\s+do\s+platnosci)\b/i
                .test(normalized) ||
            /\b(pokaz|przejd[zź](?:my)?|otworz|idz|podejrze\w*|podejrzyj|podglad|zobacz|sprawdz)\b.*\b(koszyk\w*|zam\w*ienie)\b/i.test(normalized) ||
            /\b(chcial?bym|chcialabym|chce)\b.*\b(podejrze\w*|podejrzyj|zobacz|sprawdz)\b.*\b(koszyk\w*|zam\w*ienie)\b/i.test(normalized) ||
            /^\s*(koszyk|zamowienie)\s*$/i.test(normalized) ||
            /\b(pokaz|przejd[zź](?:my)?|otworz|idz|podejrze\w*|podejrzyj|podglad|zobacz|sprawdz)\b.*\b(koszyk\w*|zam\w*ienie)\b/i.test(normalizedLoose) ||
            /\b(chce|chcial?bym|chcialabym|chcial bym)\b.*\b(podejrze\w*|podejrzyj|zobacz|sprawdz)\b.*\b(koszyk\w*|zam\w*ienie)\b/i.test(normalizedLoose) ||
            /^\s*(koszyk|zamowienie)\s*$/i.test(normalizedLoose);

        if (isExplicitCheckoutRequest) {
            console.log('[CHECKOUT_BRIDGE_TRACE]', JSON.stringify({
                source: 'explicit_checkout_bridge',
                text,
                normalized,
                hasCurrentRestaurant: Boolean(session?.currentRestaurant),
            }));
            return {
                intent: 'open_checkout',
                confidence: 0.98,
                source: 'explicit_checkout_bridge',
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
            if (/\b(tak|potwierdzam|potwierdza|ok|dobra|zamawiam|dodaj|prosze|proszĂ„â„˘)\b/i.test(normalized)) {
                return { intent: 'confirm_order', confidence: 1.0, source: 'rule_guard', entities };
            }
        }

        // NEW: Guard for confirm_add_to_cart context
        if (session?.expectedContext === 'confirm_add_to_cart') {
            if (/\b(tak|potwierdzam|ok|dodaj|dawaj)\b/i.test(normalized)) {
                return { intent: 'confirm_add_to_cart', confidence: 1.0, source: 'rule_guard', entities };
            }
            if (/\b(nie|anuluj|stop|rezygnujĂ„â„˘)\b/i.test(normalized)) {
                return { intent: 'cancel_order', confidence: 1.0, source: 'rule_guard', entities };
            }
        }

        if (session?.conversationPhase === 'ordering' && /\b(anuluj|stop|rezygnuj[eÄ™]|niewazne|niewaĹĽne)\b/i.test(normalized)) {
            return { intent: 'cancel_order', confidence: 1.0, source: 'ordering_escape_guard', entities };
        }
        // Guard for confirm_restaurant context (fuzzy confirmation)
        if (session?.expectedContext === 'confirm_restaurant') {
            if (/\b(tak|potwierdzam|ok|ta|tĂ„â€¦|tĂ„â„˘|tĂ„â„˘)\b/i.test(normalized)) {
                // User confirmed - use pending restaurant
                return {
                    intent: 'select_restaurant',
                    confidence: 1.0,
                    source: 'rule_guard',
                    entities: { ...entities, confirmedRestaurant: session.pendingRestaurantConfirm }
                };
            }
            if (/\b(nie|inna|innĂ„â€¦|zmieÄąâ€ž|zmien)\b/i.test(normalized)) {
                // User wants different restaurant
                return { intent: 'find_nearby', confidence: 1.0, source: 'rule_guard', entities };
            }
        }

        if (session?.expectedContext === 'select_restaurant' || session?.expectedContext === 'show_more_options') {
            const isIntentLike = /(menu|zamawiam|zamÄ‚Ĺ‚w|poproszĂ„â„˘|poprosze|wezmĂ„â„˘|wezme|chcĂ„â„˘|chce|pokaÄąÄ˝|pokaz|znajdÄąĹź|znajdz|gdzie|health|checkout|kasa|platnosc)/i.test(normalized);
            const isManualSelection = /\b(numer|nr|opcja|opcje)\s+\d+\b/i.test(normalized);
            // If it's just a number or simple phrase, it's selection
            if (!isIntentLike || /^[0-9]\b/.test(normalized.trim()) || isManualSelection) {
                // If it contains "inne" or "wiecej", it might be show_more_options
                if (/\b(wiecej|wiĂ„â„˘cej|inne|lista)\b/i.test(normalized) && !isManualSelection) {
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
        if (/\b(wiecej|wiĂ„â„˘cej|inne|opcje|lista)\b/i.test(normalized)) {
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
            const ordinalRegex = /^(?:poprosz[Ă„â„˘e]\s+|wezm[Ă„â„˘e]\s+|chc[Ă„â„˘e]\s+|zamawiam\s+|daj\s+|wybieram\s+|biore\s+|bior[Ă„â„˘e]\s+)?(?:ten\s+|t[aĂ„â€¦Ă„â„˘]\s+|to\s+)?(pierwsz[yae]|drug[iae]|trzec[iae]|czwart[yae]|pi[aĂ„â€¦]t[yae]|ostatni[a|e]?)\s*$/i;
            const match = normalized.trim().match(ordinalRegex);

            if (match) {
                const word = match[1].toLowerCase();
                let idx = -1;

                if (word.startsWith('pierwsz')) idx = 0;
                else if (word.startsWith('drug')) idx = 1;
                else if (word.startsWith('trzec')) idx = 2;
                else if (word.startsWith('czwart')) idx = 3;
                else if (word.startsWith('piat') || word.startsWith('piĂ„â€¦t')) idx = 4;
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

                // Brak listy referencyjnej, lub index poza tablicĂ„â€¦ -> prosimy o doprecyzowanie
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
        // NOTE: This guard runs BEFORE isNumericDiscovery so "dwa Pizza" Ă˘â€ â€™
        //       create_order+qty=2 instead of find_nearby.
        if (session?.currentRestaurant && session?.last_menu?.length > 0) {
            const menu = session.last_menu;
            const rawDishText = ctx?.rawText || ctx?.body?.text || text;
            const qty = extractQuantity(rawDishText) || 1;

            const compound = parseCompoundOrder(rawDishText, menu);
            const compoundItems = Array.isArray(compound?.items) ? compound.items : [];
            const hasCompoundSignal = compoundItems.length > 1 || compoundItems.some((item) => Number(item?.quantity || 1) > 1);
            if (hasCompoundSignal) {
                console.log('[COMPOUND_RAW_TRACE]', JSON.stringify({
                    source: 'compound_parser',
                    rawText: rawDishText,
                    items: compoundItems,
                    count: compoundItems.length,
                }));

                if (Array.isArray(compound?.segmentTraces) && compound.segmentTraces.length > 0) {
                    for (const segmentTrace of compound.segmentTraces) {
                        console.log('[QUANTITY_SEGMENT_TRACE]', JSON.stringify({
                            source: 'compound_parser',
                            ...segmentTrace,
                        }));
                    }
                }

                if (Array.isArray(compound?.heuristicTraces) && compound.heuristicTraces.length > 0) {
                    for (const heuristicTrace of compound.heuristicTraces) {
                        console.log('[COMPOUND_HEURISTIC_TRACE]', JSON.stringify({
                            source: 'compound_parser',
                            ...heuristicTrace,
                        }));
                    }
                }

                const canonicalizedItems = compoundItems.map((item) => {
                    const safeCanonical = safeCanonicalizeCompoundItem(item, session);
                    console.log('[SAFE_CANON_ITEM_TRACE]', JSON.stringify({
                        source: 'compound_parser',
                        inputDish: item?.dish || null,
                        outputDish: safeCanonical.item?.dish || null,
                        quantity: safeCanonical.item?.quantity || null,
                        canonicalAlias: safeCanonical.canonicalAlias,
                        canonicalApplied: safeCanonical.canonicalApplied,
                    }));

                    if (safeCanonical.item?.meta?.modifier) {
                        console.log('[MODIFIER_PRESERVED_TRACE]', JSON.stringify({
                            source: 'compound_parser',
                            dish: safeCanonical.item?.dish || null,
                            rawLabel: safeCanonical.item?.meta?.rawLabel || null,
                            modifier: safeCanonical.item?.meta?.modifier || null,
                        }));
                    }

                    return safeCanonical.item;
                });

                console.log('[COMPOUND_CANON_TRACE]', JSON.stringify({
                    source: 'compound_parser',
                    rawItems: compoundItems,
                    canonicalItems: canonicalizedItems,
                }));

                const singleCompoundQuantity =
                    canonicalizedItems.length === 1 &&
                    Number(canonicalizedItems[0]?.quantity || 1) > 1;
                const singleCompoundGeneric =
                    singleCompoundQuantity &&
                    isGenericCompoundToken(canonicalizedItems[0]?.dish || canonicalizedItems[0]?.meta?.rawLabel || '');
                const allowSingleCompound = singleCompoundQuantity && !singleCompoundGeneric;

                if (singleCompoundQuantity) {
                    console.log('[SINGLE_COMPOUND_ALLOW_TRACE]', JSON.stringify({
                        source: 'compound_parser',
                        dish: canonicalizedItems[0]?.dish || null,
                        quantity: canonicalizedItems[0]?.quantity || null,
                        genericToken: singleCompoundGeneric,
                        allowed: allowSingleCompound,
                    }));
                }

                BrainLogger.nlu(`MULTI_COMPOUND_GUARD: parsed ${canonicalizedItems.length} items before DISH_GUARD`);
                return {
                    intent: 'create_order',
                    confidence: 1.0,
                    source: 'compound_parser',
                    entities: {
                        ...entities,
                        dish: entities?.dish || canonicalizedItems[0]?.dish || null,
                        items: canonicalizedItems,
                        restaurant: session.currentRestaurant.name,
                        restaurantId: session.currentRestaurant.id,
                        compoundSource: 'compound_parser',
                        skipCategoryClarify: allowSingleCompound,
                        skipGenericTokenBlock: allowSingleCompound,
                        quantity: canonicalizedItems.length === 1 ? (Number(canonicalizedItems[0]?.quantity) || null) : null,
                        hasExplicitNumber: canonicalizedItems.some((item) => Number(item?.quantity || 1) > 1),
                    }
                };
            }

            // Strip leading quantity word so "dwa Pizza Margherita" Ă˘â€ â€™ "Pizza Margherita"
            const QTY_STRIP = /^(?:\\d+\\s*|jeden|jedna|jedno|dwa|dwie|trzy|cztery|pi[eĂ„â„˘][cĂ„â€ˇ][u]?|sze[sÄąâ€ş][cĂ„â€ˇ][u]?|siedem|osiem|dziewi[eĂ„â„˘][cĂ„â€ˇ][u]?|dziesi[eĂ„â„˘][cĂ„â€ˇ][u]?|kilka|par[Ă„â„˘e])\\s+/i;
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
                        BrainLogger.nlu(`Ä‘Ĺşâ€ťÂ¤ DISH_ALIAS: "${matchedWord}" Ă˘â€ â€™ "${item.name}"`);
                        break;
                    }
                }
            }

            if (dishMatch) {
                BrainLogger.nlu(`Ä‘ĹşĹ¤ËťÄŹÂ¸Ĺą DISH_GUARD: Matched "${dishMatch.name}" from menu in restaurant ${session.currentRestaurant.name}`);
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
            BrainLogger.nlu(`Ä‘Ĺşâ€ťË QTY_DISH_MERGE: qty=${entities.quantity} dish="${entities.dish}"`);
            return {
                intent: 'create_order',
                domain: 'ordering',
                confidence: 0.95,
                source: 'quantity_order',
                entities
            };
        }

        // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â
        // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â
        // --- RULE 0 & 5: Discovery & Numerals (Blocking Rules) ---

        // 0. Explicit Discovery Keywords (includes location-relative phrases)
        // NOTE: Include both Polish and ASCII versions since normalizeTxt strips diacritics
        const DISCOVERY_KEYWORDS = ['miejsca', 'restauracje', 'lokale', 'pizzerie', 'gdzie', 'szukam', 'znajdz', 'znajdÄąĹź',
            'kolo mnie', 'koÄąâ€šo mnie', 'w poblizu', 'w pobliÄąÄ˝u', 'blisko', 'niedaleko', 'w okolicy'];
        // 0.25 Uncertainty markers (e.g., "kfc chyba" = user is exploring, not ordering)
        const UNCERTAINTY_KEYWORDS = ['chyba', 'moÄąÄ˝e', 'jakiÄąâ€ş', 'jakieÄąâ€ş', 'coÄąâ€ş'];
        // 0.5 Explicit Recommend Keywords
        const RECOMMEND_KEYWORDS = ['polecisz', 'polec'];
        // 5. Numeric Discovery (e.g. "dwa kebaby", "trzy lokale") - if no ordering verb, it's discovery
        const NUMERALS = /\b(dwa|dwie|dwoje|trzy|troje|cztery|piĂ„â„˘Ă„â€ˇ|szeÄąâ€şĂ„â€ˇ|siedem|osiem|dziewiĂ„â„˘Ă„â€ˇ|dziesiĂ„â„˘Ă„â€ˇ|kilka|parĂ„â„˘)\b/i;
        // UPDATED: Added natural forms: "biorĂ„â„˘", "wezmĂ„â„˘", "poproszĂ„â„˘", "chciaÄąâ€šbym", "chciaÄąâ€šabym"
        const ORDER_VERBS = /\b(menu|karta|oferta|zamawiam|wezm[Ă„â„˘e]|dodaj|poprosz[Ă„â„˘e]|chc[Ă„â„˘e]|bior[Ă„â„˘e]|chciaÄąâ€š(bym|abym)|skusz[Ă„â„˘e]|spr[oÄ‚Ĺ‚]buj[Ă„â„˘e]|zdecyduj[Ă„â„˘e]|lec[Ă„â„˘e]\s+na|bior[Ă„â„˘e]\s+to)\b/i;

        const isRecommend = RECOMMEND_KEYWORDS.some(k => normalized.includes(k));
        const isDiscovery = DISCOVERY_KEYWORDS.some(k => normalized.includes(k));
        const isUncertain = UNCERTAINTY_KEYWORDS.some(k => normalized.includes(k));
        const isNumericDiscovery = NUMERALS.test(normalized) && !ORDER_VERBS.test(normalized);

        if (isRecommend) {
            if (session?.currentRestaurant) {
                BrainLogger.nlu('Ä‘Ĺşâ€şË‡ÄŹÂ¸Ĺą IN_RESTAURANT_GUARD: blocked recommend/find_nearby inside restaurant context');
            } else {
            // If recommend + location Ă˘â€ â€™ treat as find_nearby (implicit discovery)
                if (location) {
                    return {
                        intent: 'find_nearby',
                        confidence: 0.99,
                        source: 'recommend_with_location',
                        entities
                    };
                }
                // No location Ă˘â€ â€™ ask where to search
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
                    source: 'discovery_guard_block',
                    entities
                };
            }
        }

        // --- RULE 3: Strict Restaurant Match (Catalog) ---
        // If we found a restaurant from our static list 
        if (matchedRestaurant) {
            // Check for ordering context FIRST
            // Fix: "Zamawiam z Bar Praha" should be create_order, not select_restaurant
            // UPDATED: Included "chciaÄąâ€šbym/chciaÄąâ€šabym"
            const isOrderContext = /\b(zamawiam|zamow|zamÄ‚Ĺ‚w|poprosze|poprosz[Ă„â„˘e]|wezme|wezm[Ă„â„˘e]|biore|bior[Ă„â„˘e]|chce|chc[Ă„â„˘e]|dla mnie|poprosic|chciaÄąâ€š(bym|abym)|skusz[Ă„â„˘e]|spr[oÄ‚Ĺ‚]buj[Ă„â„˘e]|zdecyduj[Ă„â„˘e]|lec[Ă„â„˘e]\s+na|bior[Ă„â„˘e]\s+to)\b/i.test(normalized);

            if (isOrderContext) {
                return {
                    intent: 'create_order',
                    confidence: 1.0,
                    source: 'catalog_match_order',
                    entities
                };
            }

            // Check context: "pokaÄąÄ˝ menu w Hubertusie" vs "idziemy do Hubertusa"
            if (/\b(menu|karta|oferta|cennik|co\s+ma|co\s+maja|zje[sÄąâ€ş][Ă„â€ˇc])\b/i.test(normalized)) {
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
        if (parsed.restaurant && /\b(pokaz|pokaÄąÄ˝|co|jakie|zobacz)\b/i.test(normalized)) {
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
            if (/(zmieÄąâ€ž|wrÄ‚Ĺ‚Ă„â€ˇ|inn[ea]|powrÄ‚Ĺ‚t)/i.test(normalized)) {
                return { intent: 'find_nearby', confidence: 0.9, source: 'lock_escape', entities: {} };
            }
        }

        // --- OPTIMIZATION: Task 3 - Lexical Override (Priority high) ---
        // UPDATED: Syncing verbs
        const isOrderingVerb = /(wybieram|poprosze|poprosz[Ă„â„˘e]|wezme|wezm[Ă„â„˘e]|dodaj|zamawiam|zamow|zamÄ‚Ĺ‚w|chce|chc[Ă„â„˘e]|zamowie|zamÄ‚Ĺ‚wiĂ„â„˘|biore|bior[Ă„â„˘e]|chciaÄąâ€š(bym|abym)|skusz[Ă„â„˘e]|spr[oÄ‚Ĺ‚]buj[Ă„â„˘e]|zdecyduj[Ă„â„˘e]|lec[Ă„â„˘e]\s+na|bior[Ă„â„˘e]\s+to)/i.test(normalized);
        const wantsMenuFirst = /\b(menu|karta|karte|kartĂ„â„˘|oferta|ofertĂ„â„˘|oferte|cennik|co\s+macie|lista|pokaz|pokaÄąÄ˝|zobacz)\b/i.test(normalized);
        const isChceDiscovery = /chc[Ă„â„˘e]\s+(co|gdzie|zje|jedzenie|kuchni|kuchnia|dania|danie|azjatyckie|wloskie|wÄąâ€šoskie|chinskie|chiÄąâ€žskie|orientalne|restauracj)/i.test(normalized);

        if (!wantsMenuFirst && isOrderingVerb && !isChceDiscovery) {
            // SAFETY CHECK: Ambiguous Item Order (Disambiguation Guard)
            // If we are ordering, but have NO restaurant context/entity, assume discovery/disambiguation needed.
            // Exception: If we have a very obscure unique item, Legacy/Smart logic below might catch it, 
            // but for safety, "Zamawiam frytki" (no context) -> find_nearby.

            // FIX: If we found a known dish (parsed.dish), that counts as context!
            // REVERTED: Including parsed.dish breaks Disambiguation Safeguard (generic items like "frytki" become orders).
            // We must rely on legacy/smart layer for specific items, or require restaurant context.
            // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â
            // COLLOQUIAL ORDERING in restaurant context: fire immediately,
            // never fall through to legacy (legacy would set choose_restaurant)
            // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â
            // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â
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

        // A. Menu Request (Simple only OR complex with "pokaÄąÄ˝ menu")
        // Relaxed: if "pokaÄąÄ˝/zobacz" + "menu/karta/oferta" anywhere in text OR "co macie"
        if (/^(poka[zÄąÄ˝]\s+)?(menu|karta|karte|kartĂ„â„˘|oferta|oferte|ofertĂ„â„˘|list[ae])(\s+da[Äąâ€žn])?$/i.test(normalized) ||
            /\b(poka[zÄąÄ˝]|zobacz|sprawdz|sprawdÄąĹź|co)\b.*\b(menu|karta|karte|kartĂ„â„˘|oferta|oferte|ofertĂ„â„˘|list[ae]|cennik|macie|oferte|ofertĂ„â„˘)\b/i.test(normalized)) {
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
        const findRegex = /(co|gdzie).*(zje[sÄąâ€ş][Ă„â€ˇc]|poleca|poleci|masz|macie|jedzenia|jedzenie)|(szukam|znajd[ÄąĹźz]).*|(chc[Ă„â„˘e]|gÄąâ€šodny|glodny|ochote|ochotĂ„â„˘|co[Äąâ€şs]).*(co[Äąâ€şs]|zje[sÄąâ€ş][Ă„â€ˇc]|jedzenie|kuchni)|(lokale|restauracje|knajpy|pizzeri[ae]|kebaby|kebab|bary|pizza|burger|jedzenie|gÄąâ€šodny|glodny)/i;

        // Guard: don't trigger findRegex if we have strong ordering verbs like "poproszĂ„â„˘" or "zamawiam"
        // UPDATED: Syncing verbs
        const hasOrderVerbStrict = /\b(poprosze|poprosz[Ă„â„˘e]|zamawiam|zamow|wezme|wezm[Ă„â„˘e]|biore|bior[Ă„â„˘e]|dodaj|chciaÄąâ€š(bym|abym)|skusz[Ă„â„˘e]|spr[oÄ‚Ĺ‚]buj[Ă„â„˘e]|zdecyduj[Ă„â„˘e]|lec[Ă„â„˘e]\s+na|bior[Ă„â„˘e]\s+to)\b/i.test(normalized);

        if (findRegex.test(normalized) && !hasOrderVerbStrict && !session?.currentRestaurant) {
            return {
                intent: 'find_nearby',
                confidence: 0.95,
                source: 'regex_v2',
                entities
            };
        }

        // --- SOFT_MENU_REQUEST_GUARD: Vague menu-browsing phrases inside restaurant context ---
        // Must run BEFORE smart intent / LLM layers to prevent LLM from returning show_menu
        if (session?.currentRestaurant) {
            const isSoftMenuQuery = /^(co\s+(maj[a]|serwuj[a]|polecasz|poleca|proponuj[a]?)|cos\s+smacznego)$/i.test(normalized);
            if (isSoftMenuQuery) {
                return {
                    intent: 'menu_request',
                    confidence: 0.85,
                    source: 'soft_menu_request_guard',
                    entities
                };
            }
        }

        // 2. Smart Intent Layer (Hybrid: LLM Fallback)
        // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â
        // SINGLE-ROUTING INVARIANT: Classic/legacy router disabled in V2 mode.
        // When EXPERT_MODE=true  Ă˘â€ â€™ smartResolveIntent (Gemini) is the fallback.
        // When EXPERT_MODE=false Ă˘â€ â€™ V2 rule layers above are the sole source of truth.
        //   The legacy intentRouterGlue is DISABLED to prevent:
        //   (a) double intent resolution (rule_guard fires, then classic fires again)
        //   (b) source label confusion ('classic_legacy' mixed with 'rule_guard')
        //   (c) hard-blocked ordering intents leaking through as 'find_nearby'
        // To re-enable legacy: set LEGACY_CLASSIC_ENABLED=true in .env (emergency)
        // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â
        try {
            const EXPERT_MODE = process.env.EXPERT_MODE === 'true';
            // LEGACY_CLASSIC_ENABLED removed Ă˘â‚¬â€ť classic routing disabled permanently

            if (EXPERT_MODE) {
                const smartResult = await smartResolveIntent({
                    text,
                    session,
                    sessionId: ctx?.sessionId,
                    previousIntent: session?.lastIntent
                });

                if (smartResult && smartResult.intent && smartResult.intent !== 'unknown') {
                    if (session?.currentRestaurant && ['find_nearby', 'choose_restaurant', 'select_restaurant'].includes(smartResult.intent) && !isExplicitRestaurantSearch(text)) {
                        BrainLogger.nlu(`Ä‘Ĺşâ€şË‡ÄŹÂ¸Ĺą SMART_DISCOVERY_GUARD: blocked "${smartResult.intent}" while in restaurant context`);
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
                // V2 mode with classic disabled Ă˘â‚¬â€ť expected path
                BrainLogger.nlu('NLU: Classic disabled (V2 mode). Falling through to food_word_fallback.');
            }
        } catch (e) {
            console.warn('SmartIntent/Legacy failed', e);
        }

        // 3. Food-word Fallback: if unknown but contains food words, assume exploration
        const FOOD_WORDS = /\b(pizza|pizz[aeĂ„â„˘yĂ„â„˘]|kebab|kebaba|burger|burgera|burgery|sushi|ramen|pad\s*thai|pho|pierogi|pierog|zupy?|zup[Ă„â„˘ka]|schabowy?|kotlet|frytki|frytek|king|kfc|mcdonald|mac|jedzenie|cos|coÄąâ€ş|zjeÄąâ€şĂ„â€ˇ|zjesz|dania|baner|dobry|cola|colĂ„â„˘|cole|coca|fanta|sprite|woda|wode|wodĂ„â„˘|napÄ‚Ĺ‚j|napoje)\b/i;
        if (FOOD_WORDS.test(normalized) && !session?.currentRestaurant) {
            return {
                intent: 'find_nearby',
                confidence: 0.6,
                source: 'food_word_fallback',
                entities
            };
        }

        // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â
        // 4. LLM INTENT TRANSLATOR (LAST FALLBACK)
        // Only runs if all other methods failed
        // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â
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
                        BrainLogger.nlu(`Ä‘Ĺşâ€şË‡ÄŹÂ¸Ĺą LLM_DISCOVERY_GUARD: blocked "${llmResult.intent}" while in restaurant context`);
                    } else {
                    // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â
                    // HARD BLOCK: LLM cannot execute ordering intents
                    // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â
                    if (llmResult.intent === 'create_order' || llmResult.intent === 'confirm_order') {
                        console.warn('Ä‘Ĺşâ€şË‡ÄŹÂ¸Ĺą LLM tried ordering intent - blocked, downgrading to find_nearby');
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
                console.warn('Ä‘Ĺşâ€şË‡ÄŹÂ¸Ĺą LLM Translator failed:', e.message);
                // Continue to final fallback
            }
        }

        // 5. Default order fallback inside restaurant context
        if (session?.currentRestaurant && session?.last_menu) {
            const isControlIntent = /\b(status|zam[oÄ‚Ĺ‚]wienie|koszyk|p[lÄąâ€š]ac[Ă„â„˘e]|checkout|help|pomoc|co\s+robi[Ă„â€ˇc]|menu|karta)\b/i.test(normalized);
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
                const textForDish = text.replace(/^(?:\\d+\\s*|jeden|jedna|jedno|dwa|dwie|trzy|cztery|pi[eĂ„â„˘][cĂ„â€ˇ][u]?|sze[sÄąâ€ş][cĂ„â€ˇ][u]?|siedem|osiem|dziewi[eĂ„â„˘][cĂ„â€ˇ][u]?|dziesi[eĂ„â„˘][cĂ„â€ˇ][u]?|kilka|par[Ă„â„˘e])\\s+/i, '').trim();
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




