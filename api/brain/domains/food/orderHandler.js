// Food Domain: Order Handler
// Odpowiada za proces skĹ‚adania zamĂłwienia (Parsowanie -> Koszyk -> Potwierdzenie).

import { extractQuantity, normalizeDish, findBestDishMatch, levenshtein } from '../../helpers.js';
import { canonicalizeDish } from '../../nlu/dishCanon.js';
import { resolveMenuItemConflict, DISAMBIGUATION_RESULT } from '../../services/DisambiguationService.js';
import { commitPendingOrder } from '../../session/sessionCart.js';
import { buildClarifyOrderMessage, ORDER_REQUESTED_CATEGORY, resolveRequestedCategory } from './clarifyOrderMessage.js';

function hasExplicitQuantityInText(text = '') {
    const normalized = normalizeDish(String(text || ''));
    if (!normalized) return false;

    // Only treat quantity as explicit when it is part of order syntax.
    // This avoids false positives from dish names like "6 szt.".
    const prefixPattern = /^\s*(?:\d+|jeden|jedna|jedno|dwa|dwie|trzy|cztery|piec|szesc|siedem|osiem|dziewiec|dziesiec|kilka|pare|podwojny|podwojna|podwojne|podwojnie)\b(?:\s*(?:x|razy|szt|szt\.|sztuk|porcj))?/i;
    const verbPattern = /\b(dodaj|zamawiam|wezme|chce|poprosze|poprosz)\b\s+(?:mi\s+)?(?:\d+|jeden|jedna|jedno|dwa|dwie|trzy|cztery|piec|szesc|siedem|osiem|dziewiec|dziesiec|kilka|pare|podwojny|podwojna|podwojne|podwojnie)\b/i;
    return prefixPattern.test(normalized) || verbPattern.test(normalized);
}

function formatSzt(quantity) {
    const q = Math.max(1, Math.floor(Number(quantity) || 1));
    const mod10 = q % 10;
    const mod100 = q % 100;
    let form = 'sztuk';

    if (q === 1) {
        form = 'sztuka';
    } else if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) {
        form = 'sztuki';
    }

    return `${q} ${form}`;
}

function getSessionMenu(session = {}) {
    const candidates = [
        session?.last_menu,
        session?.lastMenu,
        session?.menu,
        session?.menuItems,
        session?.currentRestaurant?.menu,
        session?.lastRestaurant?.menu
    ];

    for (const candidate of candidates) {
        if (Array.isArray(candidate) && candidate.length > 0) {
            return candidate;
        }

        if (candidate && Array.isArray(candidate.items) && candidate.items.length > 0) {
            return candidate.items;
        }

        if (candidate && Array.isArray(candidate.menu) && candidate.menu.length > 0) {
            return candidate.menu;
        }
    }

    return [];
}

const NON_MAIN_CATEGORY_HINTS = [
    'dodatek',
    'dodatki',
    'sos',
    'sosy',
    'napoj',
    'napoje',
    'drink',
    'drinki',
    'alkohol',
    'extra',
    'modifier',
    'modyfik',
    'topping',
    'dip',
];

const EXPLICIT_ADDON_HINTS = [
    'sos',
    'dodatek',
    'dodatk',
    'extra',
    'modyfik',
    'dip',
    'topping',
];

const EXPLICIT_DRINK_HINTS = [
    'napoj',
    'napoje',
    'woda',
    'cola',
    'pepsi',
    'sprite',
    'fanta',
    'sok',
    'lemoniada',
    'kawa',
    'herbata',
];

const GENERIC_DISH_TOKENS = new Set([
    'sos',
    'sosy',
    'napoj',
    'napoje',
    'napoj gazowany',
    'pizza',
    'pizze',
    'burger',
    'burgery',
    'kawa',
    'herbata',
    'dodatek',
    'dodatki',
    'frytki',
]);

const MODIFIER_SYNONYM_GROUPS = [
    ['pikantny', 'pikantna', 'pikantne', 'ostry', 'ostra', 'ostre', 'spicy', 'chili', 'chilli'],
    ['lagodny', 'lagodna', 'lagodne', 'mild', 'jogurtowy', 'jogurtowa', 'jogurtowe'],
    ['czosnkowy', 'czosnkowa', 'czosnkowe', 'garlic'],
];

const ORDER_FLOW_ANCHOR_REPLY = 'Dodałam. Co dalej — chcesz zobaczyć więcej dań czy przejść do zamówienia?';

function stripQuantityOperators(phrase = '') {
    const normalized = normalizeDish(phrase || '');
    if (!normalized) return '';

    return normalized
        .replace(/^\s*x\s*\d+\b/, '')
        .replace(/^\s*\d+\s*(?:x|razy|szt|sztuk|szt\.|porcj(?:a|e|i)?)?\b/, '')
        .replace(/^\s*(?:jeden|jedna|jedno|dwa|dwie|trzy|cztery|piec|szesc|siedem|osiem|dziewiec|dziesiec|kilka|pare)\s*(?:x|razy)?\b/, '')
        .replace(/\b(?:x\s*\d+|\d+\s*x|\d+\s*razy|razy\s*\d+)\b/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function isGenericTokenOnly(phrase = '') {
    const stripped = stripQuantityOperators(phrase);
    if (!stripped) return false;
    return GENERIC_DISH_TOKENS.has(stripped);
}

function resolveItemType(item = {}) {
    const rawType = String(item?.type || item?.item_type || item?.kind || '').trim();
    if (rawType) {
        return rawType.toUpperCase();
    }

    const category = normalizeDish(item?.category || '');
    if (category && NON_MAIN_CATEGORY_HINTS.some((hint) => category.includes(hint))) {
        return 'ADDON';
    }

    return 'MAIN';
}

function isMainMenuItem(item = {}) {
    return resolveItemType(item) === 'MAIN';
}

function isExplicitAddonRequest(text = '') {
    const normalized = normalizeDish(text || '');
    if (!normalized) return false;
    return EXPLICIT_ADDON_HINTS.some((hint) => normalized.includes(hint));
}

function isExplicitDrinkRequest(text = '') {
    const normalized = normalizeDish(text || '');
    if (!normalized) return false;
    return EXPLICIT_DRINK_HINTS.some((hint) => normalized.includes(hint));
}

function isDrinkMenuItem(item = {}) {
    const category = normalizeDish(item?.category || '');
    const name = normalizeDish(item?.name || '');

    if (category.includes('napoj') || category.includes('drink') || category.includes('beverage')) {
        return true;
    }

    return EXPLICIT_DRINK_HINTS.some((hint) => name.includes(hint));
}

function summarizeCandidates(candidates = []) {
    return (candidates || []).slice(0, 5).map((item) => ({
        id: item?.id || null,
        name: item?.name || null,
        type: isDrinkMenuItem(item)
            ? ORDER_REQUESTED_CATEGORY.DRINK
            : resolveItemType(item),
    }));
}

function collectMenuCandidates(menu = [], requestedDish = '') {
    if (!Array.isArray(menu) || menu.length === 0) return [];

    const normalizedDish = normalizeDish(requestedDish || '');
    if (!normalizedDish) return [];

    return menu.filter((item) => {
        const base = normalizeDish(item?.base_name || '');
        const name = normalizeDish(item?.name || '');
        return (base && (base.includes(normalizedDish) || normalizedDish.includes(base)))
            || (name && (name.includes(normalizedDish) || normalizedDish.includes(name)));
    });
}

function inferRequestedCategory({
    requestedDish = '',
    rawUserText = '',
    addonContext = false,
    candidates = [],
}) {
    if (addonContext || isExplicitAddonRequest(rawUserText) || isExplicitAddonRequest(requestedDish)) {
        return ORDER_REQUESTED_CATEGORY.ADDON;
    }

    if (isExplicitDrinkRequest(rawUserText) || isExplicitDrinkRequest(requestedDish)) {
        return ORDER_REQUESTED_CATEGORY.DRINK;
    }

    if (Array.isArray(candidates) && candidates.length > 0) {
        const hasMain = candidates.some((item) => resolveItemType(item) === ORDER_REQUESTED_CATEGORY.MAIN);
        if (hasMain) return ORDER_REQUESTED_CATEGORY.MAIN;

        const hasDrink = candidates.some((item) => isDrinkMenuItem(item));
        if (hasDrink) return ORDER_REQUESTED_CATEGORY.DRINK;

        const hasAddon = candidates.some((item) => resolveItemType(item) === ORDER_REQUESTED_CATEGORY.ADDON);
        if (hasAddon) return ORDER_REQUESTED_CATEGORY.ADDON;
    }

    return ORDER_REQUESTED_CATEGORY.UNKNOWN;
}

function getCartRestaurantLock(session = {}) {
    const cart = session?.cart || {};
    const cartItems = Array.isArray(cart?.items) ? cart.items : [];
    const firstItemRestaurantId = cartItems[0]?.restaurant_id || null;

    return {
        hasItems: cartItems.length > 0,
        lockedRestaurantId: cart?.restaurantId || firstItemRestaurantId || null,
        cartRestaurantName:
            cartItems[0]?.restaurant_name
            || session?.currentRestaurant?.name
            || session?.lastRestaurant?.name
            || 'innej restauracji',
    };
}

function buildRestaurantSwitchConflictResponse({
    currentRestaurantName,
    targetRestaurant,
    lockedRestaurantId = null,
}) {
    const restaurantLockTrace = {
        conflict: true,
        lockedRestaurantId: lockedRestaurantId || null,
        currentRestaurantName: currentRestaurantName || null,
        targetRestaurantId: targetRestaurant?.id || null,
        targetRestaurantName: targetRestaurant?.name || null,
    };
    console.log('[RESTAURANT_LOCK_TRACE]', JSON.stringify(restaurantLockTrace));

    return {
        reply: `Masz już pozycje z ${currentRestaurantName}. Czy wyczyścić koszyk i przejść do ${targetRestaurant?.name}?`,
        contextUpdates: {
            expectedContext: 'confirm_restaurant_switch',
            pendingRestaurantSwitch: targetRestaurant
                ? {
                    id: targetRestaurant.id,
                    name: targetRestaurant.name,
                    city: targetRestaurant.city || null,
                }
                : null,
        },
        meta: {
            source: 'restaurant_switch_conflict_from_order',
            restaurantLockTrace,
        },
    };
}

function buildAmbiguousResolution({
    requestedCategory,
    candidates = [],
}) {
    return {
        status: 'AMBIGUOUS',
        requestedCategory: resolveRequestedCategory(requestedCategory),
        candidates: summarizeCandidates(candidates),
    };
}

function resolveCategoryFromItem(item = {}) {
    if (isDrinkMenuItem(item)) return ORDER_REQUESTED_CATEGORY.DRINK;

    const type = resolveItemType(item);
    if (type === 'ADDON') return ORDER_REQUESTED_CATEGORY.ADDON;
    if (type === 'MAIN') return ORDER_REQUESTED_CATEGORY.MAIN;
    return ORDER_REQUESTED_CATEGORY.UNKNOWN;
}

function buildClarifyResponse({
    ambiguousMeta,
    addonContext = false,
    sessionRestaurant = null,
    reason = 'ambiguous_resolution',
}) {
    const candidateCount = Array.isArray(ambiguousMeta?.candidates) ? ambiguousMeta.candidates.length : 0;
    const expectedContext = addonContext ? 'order_addon' : 'clarify_order';
    const clarifyMeta = {
        ...(ambiguousMeta || {}),
        status: 'AMBIGUOUS',
        expectedContext,
        candidateCount,
        restaurantName: sessionRestaurant,
    };

    console.log('[CLARIFY_REASON_TRACE]', JSON.stringify({
        reason,
        category: clarifyMeta.requestedCategory || ORDER_REQUESTED_CATEGORY.UNKNOWN,
        candidateCount,
        expectedContext,
        restaurantName: sessionRestaurant,
    }));

    return {
        intent: 'clarify_order',
        reply: buildClarifyOrderMessage(clarifyMeta),
        meta: { clarify: clarifyMeta },
        contextUpdates: {
            expectedContext,
        },
    };
}

function normalizeOrderItemCandidates(rawItems = []) {
    if (!Array.isArray(rawItems)) return [];

    return rawItems
        .map((item) => {
            if (typeof item === 'string') {
                const dish = item.trim();
                if (!dish) return null;
                return { dish, quantity: 1 };
            }

            if (item && typeof item === 'object') {
                const dish = String(item.dish || item.name || '').trim();
                if (!dish) return null;

                const quantity = Math.max(1, Math.floor(Number(item.quantity ?? item.qty ?? 1) || 1));
                return {
                    dish,
                    quantity,
                    meta: (item.meta && typeof item.meta === 'object') ? { ...item.meta } : undefined,
                };
            }

            return null;
        })
        .filter(Boolean);
}

function isSingleCompoundQuantityAllowed(entities = {}, itemCandidates = []) {
    const singleItem = Array.isArray(itemCandidates) && itemCandidates.length === 1
        ? itemCandidates[0]
        : null;

    if (!singleItem) return false;
    if (Number(singleItem.quantity || 1) <= 1) return false;
    if (entities?.compoundSource !== 'compound_parser') return false;
    if (!entities?.skipCategoryClarify || !entities?.skipGenericTokenBlock) return false;

    const lookupDish = singleItem?.meta?.rawLabel || singleItem?.dish || entities?.dish || '';
    if (isGenericTokenOnly(lookupDish)) {
        return false;
    }

    return true;
}

function buildModifierVariants(modifier = '') {
    const normalized = normalizeDish(modifier || '');
    if (!normalized) return [];

    const variants = new Set([normalized]);
    const tokens = normalized.split(' ').filter(Boolean);

    for (const group of MODIFIER_SYNONYM_GROUPS) {
        const groupSet = new Set(group.map((token) => normalizeDish(token)));
        for (const token of tokens) {
            if (groupSet.has(token)) {
                for (const synonym of groupSet) {
                    variants.add(synonym);
                }
            }
        }
    }

    if (tokens.length > 1) {
        const canonicalTokens = [...tokens];
        for (let i = 0; i < canonicalTokens.length; i += 1) {
            for (const group of MODIFIER_SYNONYM_GROUPS) {
                const groupSet = new Set(group.map((token) => normalizeDish(token)));
                if (groupSet.has(canonicalTokens[i])) {
                    canonicalTokens[i] = normalizeDish(group[0]);
                }
            }
        }
        variants.add(canonicalTokens.join(' ').trim());
    }

    return [...variants].filter(Boolean);
}

function computeModifierMatchQuality(item = {}, modifierVariants = []) {
    if (!Array.isArray(modifierVariants) || modifierVariants.length === 0) {
        return { score: 0, mode: 'none' };
    }

    const normalizedName = normalizeDish(item?.name || '');
    const normalizedBase = normalizeDish(item?.base_name || '');
    const haystack = `${normalizedName} ${normalizedBase}`.trim();
    if (!haystack) return { score: 0, mode: 'none' };

    let bestExact = 0;
    let bestFuzzy = 0;
    const hayTokens = haystack.split(' ').filter(Boolean);

    for (const variant of modifierVariants) {
        const normalizedVariant = normalizeDish(variant || '');
        if (!normalizedVariant) continue;

        if (
            normalizedName.includes(normalizedVariant)
            || normalizedBase.includes(normalizedVariant)
            || ` ${haystack} `.includes(` ${normalizedVariant} `)
        ) {
            bestExact = Math.max(bestExact, 1);
            continue;
        }

        const variantTokens = normalizedVariant.split(' ').filter(Boolean);
        if (variantTokens.length === 0) continue;

        let fuzzyScore = 0;
        for (const vt of variantTokens) {
            let bestToken = 0;
            for (const ht of hayTokens) {
                if (!ht || !vt) continue;
                if (ht === vt) {
                    bestToken = 1;
                    break;
                }
                const distance = levenshtein(ht, vt);
                if (distance <= 1) {
                    bestToken = Math.max(bestToken, 0.85);
                } else if (distance <= 2 && Math.min(ht.length, vt.length) >= 5) {
                    bestToken = Math.max(bestToken, 0.65);
                }
            }
            fuzzyScore += bestToken;
        }

        bestFuzzy = Math.max(bestFuzzy, fuzzyScore / variantTokens.length);
    }

    if (bestExact > 0) return { score: 220, mode: 'exact_modifier' };
    if (bestFuzzy >= 0.7) return { score: 160 * bestFuzzy, mode: 'fuzzy_modifier' };
    return { score: 0, mode: 'none' };
}

function resolveAddonWithModifierPriority({
    menu = [],
    requestedDish = '',
    rawModifier = '',
    allowGenericFallback = false,
}) {
    if (!Array.isArray(menu) || menu.length === 0) return null;

    const addonPool = menu.filter((item) => resolveItemType(item) === 'ADDON');
    const candidatePool = addonPool.length > 0 ? addonPool : menu;
    const modifierVariants = buildModifierVariants(rawModifier);
    const normalizedRequestedDish = normalizeDish(requestedDish || '');
    const genericRequestedToken = normalizeDish(stripQuantityOperators(requestedDish || ''));

    let bestMatch = null;
    let bestScore = -1;
    let bestMode = 'none';

    for (const item of candidatePool) {
        const modifierQuality = computeModifierMatchQuality(item, modifierVariants);
        let score = modifierQuality.score;
        let mode = modifierQuality.mode;

        const normalizedName = normalizeDish(item?.name || '');
        const normalizedBase = normalizeDish(item?.base_name || '');

        if (score === 0 && allowGenericFallback && genericRequestedToken) {
            if (
                normalizedName.includes(genericRequestedToken)
                || normalizedBase.includes(genericRequestedToken)
            ) {
                score = 40;
                mode = 'generic_fallback';
            }
        }

        if (score === 0 && allowGenericFallback && normalizedRequestedDish) {
            if (
                normalizedName.includes(normalizedRequestedDish)
                || normalizedBase.includes(normalizedRequestedDish)
            ) {
                score = 30;
                mode = 'generic_fallback';
            }
        }

        if (score > bestScore) {
            bestScore = score;
            bestMatch = item;
            bestMode = mode;
        }
    }

    if (!bestMatch || bestScore <= 0) {
        return null;
    }

    return {
        item: bestMatch,
        scoreBoost: Number(bestScore.toFixed(2)),
        mode: bestMode,
    };
}

function resolveMainItemStrict({ menu = [], rawRequestedDish = '', requestedDish = '', canonicalDish = '', session = null }) {
    if (!Array.isArray(menu) || menu.length === 0) {
        return null;
    }

    const mainItems = menu.filter(isMainMenuItem);
    const candidatePool = mainItems.length > 0 ? mainItems : menu;

    const exactAttempts = [rawRequestedDish, canonicalDish, requestedDish]
        .map((value) => normalizeDish(value || ''))
        .filter(Boolean);

    for (const attempt of exactAttempts) {
        const exact = candidatePool.find((item) => {
            const normalizedName = normalizeDish(item?.name || '');
            const normalizedBase = normalizeDish(item?.base_name || '');
            return normalizedName === attempt || normalizedBase === attempt;
        });

        if (exact) {
            return {
                item: exact,
                fallbackUsed: false,
            };
        }
    }

    const fuzzy = findDirectMenuMatch(canonicalDish || requestedDish, candidatePool, session);
    if (fuzzy) {
        return {
            item: fuzzy,
            fallbackUsed: true,
        };
    }

    return null;
}

function findDirectMenuMatch(searchPhrase, menu = [], session = null) {
    if (!searchPhrase || !Array.isArray(menu) || menu.length === 0) {
        return null;
    }

    const attempts = [];
    const rawPhrase = String(searchPhrase || '').trim();
    const normalizedPhrase = normalizeDish(rawPhrase);
    const canonicalPhrase = canonicalizeDish(rawPhrase, session);
    const normalizedCanonical = normalizeDish(canonicalPhrase);

    if (rawPhrase) attempts.push(rawPhrase);
    if (normalizedPhrase && !attempts.includes(normalizedPhrase)) attempts.push(normalizedPhrase);
    if (canonicalPhrase && !attempts.includes(canonicalPhrase)) attempts.push(canonicalPhrase);
    if (normalizedCanonical && !attempts.includes(normalizedCanonical)) attempts.push(normalizedCanonical);

    for (const attempt of attempts) {
        const match = findBestDishMatch(attempt, menu);
        if (match) {
            return match;
        }
    }

    return null;
}
function isStaraKamienicaSession(session = {}) {
    const restaurantName =
        session?.currentRestaurant?.name ||
        session?.lastRestaurant?.name ||
        '';
    return normalizeDish(restaurantName) === normalizeDish('Restauracja Stara Kamienica');
}

function resolveScopedZurekFallback(menu = []) {
    if (!Array.isArray(menu) || menu.length === 0) {
        return null;
    }

    const normalizedSoupCandidates = menu.filter((item) => {
        const normalized = normalizeDish(item?.base_name || item?.name || '');
        return normalized.includes('zupa') || normalized.includes('rosol');
    });

    if (normalizedSoupCandidates.length === 0) {
        return null;
    }

    const zupaDnia = normalizedSoupCandidates.find((item) =>
        normalizeDish(item?.base_name || item?.name || '').includes('zupa dnia')
    );
    return zupaDnia || normalizedSoupCandidates[0];
}

async function resolveOrderCandidate({
    candidateText,
    candidateMeta = null,
    rawUserText,
    session,
    entities,
    menu,
    currentRestaurantId,
    addonContext,
}) {
    const rawRequestedDish = String(candidateText || '').trim();
    const normalizedMeta = (candidateMeta && typeof candidateMeta === 'object') ? candidateMeta : {};
    const resolverRawLabel = String(normalizedMeta.rawLabel || rawRequestedDish).trim() || rawRequestedDish;
    const useRawResolverLabel = Boolean(normalizedMeta.canonicalAliasBundle);
    const resolverInputDish = useRawResolverLabel ? resolverRawLabel : rawRequestedDish;
    const canonicalDish = useRawResolverLabel ? resolverInputDish : canonicalizeDish(resolverInputDish, session);
    const requestedDish = canonicalDish || resolverInputDish;
    const token = normalizeDish(requestedDish);
    const modifierHint = normalizeDish(normalizedMeta.modifier || '');

    const explicitAddonRequest =
        addonContext ||
        isExplicitAddonRequest(rawUserText) ||
        isExplicitAddonRequest(requestedDish);
    const explicitDrinkRequest =
        isExplicitDrinkRequest(rawRequestedDish) ||
        isExplicitDrinkRequest(requestedDish);
    const genericTokenBlocked =
        isGenericTokenOnly(rawRequestedDish) ||
        isGenericTokenOnly(requestedDish);
    const shouldBlockGenericToken = genericTokenBlocked && !modifierHint;

    if (shouldBlockGenericToken) {
        const requestedCategory = inferRequestedCategory({
            requestedDish,
            rawUserText,
            addonContext,
            candidates: [],
        });
        const ambiguousMeta = buildAmbiguousResolution({
            requestedCategory,
            candidates: [],
        });

        console.log('[GENERIC_TOKEN_BLOCK_TRACE]', JSON.stringify({
            requestedDish,
            rawRequestedDish,
            requestedCategory,
            addonContext,
            sessionRestaurant: session?.currentRestaurant?.name || session?.lastRestaurant?.name || null,
        }));

        return {
            rawRequestedDish,
            requestedDish,
            canonicalDish,
            resolution: { status: DISAMBIGUATION_RESULT.ITEM_NOT_FOUND, item: null, restaurant: null },
            ambiguousMeta,
            requestedCategory,
            resolvedCategory: null,
            addonContext,
            genericTokenBlocked: true,
        };
    }

    let directMatch = null;
    let fallbackUsed = false;

    if (!explicitAddonRequest && !explicitDrinkRequest && menu.length > 0) {
        const strictMainResolution = resolveMainItemStrict({
            menu,
            rawRequestedDish,
            requestedDish,
            canonicalDish,
            session,
        });

        if (strictMainResolution?.item) {
            directMatch = strictMainResolution.item;
            fallbackUsed = strictMainResolution.fallbackUsed;
        }
    }

    if (!directMatch && token && menu.length > 0) {
        directMatch = findDirectMenuMatch(requestedDish, menu, session);
    }

    if (modifierHint && menu.length > 0) {
        const prioritizedAddon = resolveAddonWithModifierPriority({
            menu,
            requestedDish: resolverRawLabel || requestedDish,
            rawModifier: modifierHint,
            allowGenericFallback: false,
        });

        console.log('[ADDON_MODIFIER_TRACE]', JSON.stringify({
            rawModifier: modifierHint,
            resolvedItemName: prioritizedAddon?.item?.name || null,
            scoreBoost: prioritizedAddon?.scoreBoost || 0,
        }));

        if (!prioritizedAddon?.item) {
            const requestedCategory = inferRequestedCategory({
                requestedDish,
                rawUserText,
                addonContext,
                candidates: [],
            });
            const ambiguousMeta = buildAmbiguousResolution({
                requestedCategory,
                candidates: [],
            });
            return {
                rawRequestedDish,
                requestedDish,
                canonicalDish,
                resolution: { status: DISAMBIGUATION_RESULT.ITEM_NOT_FOUND, item: null, restaurant: null },
                ambiguousMeta,
                requestedCategory,
                resolvedCategory: null,
                addonContext,
                candidateMeta: normalizedMeta,
            };
        }

        directMatch = prioritizedAddon.item;
        fallbackUsed = fallbackUsed || prioritizedAddon.mode !== 'exact_modifier';
    }

    if (!directMatch && explicitAddonRequest && isStaraKamienicaSession(session)) {
        const normalizedRequestedDish = normalizeDish(requestedDish);
        const isZurekRequest =
            normalizedRequestedDish.includes('zurek') ||
            normalizedRequestedDish.includes('urek') ||
            normalizedRequestedDish === 'zur' ||
            normalizedRequestedDish.includes('zur ');

        if (isZurekRequest) {
            const scopedFallback = resolveScopedZurekFallback(menu);
            if (scopedFallback) {
                directMatch = scopedFallback;
                fallbackUsed = true;
            }
        }
    }

    const resolution = directMatch
        ? {
            status: DISAMBIGUATION_RESULT.ADD_ITEM,
            item: directMatch,
            restaurant: session?.currentRestaurant || session?.lastRestaurant,
        }
        : await resolveMenuItemConflict(requestedDish, {
            restaurant_id: currentRestaurantId,
            entities,
            session: {
                ...session,
                last_menu: menu,
            },
            last_menu: menu,
        });

    const candidatesForCategory =
        resolution?.status === DISAMBIGUATION_RESULT.DISAMBIGUATION_REQUIRED
            ? []
            : collectMenuCandidates(menu, requestedDish);
    const requestedCategory = inferRequestedCategory({
        requestedDish,
        rawUserText,
        addonContext,
        candidates: candidatesForCategory,
    });
    const ambiguousMeta = buildAmbiguousResolution({
        requestedCategory,
        candidates: candidatesForCategory,
    });

    const resolvedCategory = resolution?.item ? resolveCategoryFromItem(resolution.item) : null;
    console.log('[ORDER_CATEGORY_TRACE]', JSON.stringify({
        requestedDish,
        requestedCategory,
        resolvedCategory,
        resolvedItemId: resolution?.item?.id || null,
        fallbackUsed,
    }));

    return {
        rawRequestedDish,
        requestedDish,
        canonicalDish,
        resolution,
        ambiguousMeta,
        requestedCategory,
        resolvedCategory,
        addonContext,
        candidateMeta: normalizedMeta,
    };
}

export class OrderHandler {

    async execute(ctx) {
        const { text, session, entities } = ctx;
        console.log('[KROK5-DEBUG] order entry', JSON.stringify({
            text,
            dish: entities?.dish || null,
            quantity: entities?.quantity || null,
            currentRestaurant: session?.currentRestaurant?.name || null,
            lastRestaurant: session?.lastRestaurant?.name || null,
            lastMenuCount: Array.isArray(session?.last_menu) ? session.last_menu.length : (Array.isArray(session?.last_menu?.items) ? session.last_menu.items.length : 0)
        }));
        console.log("đź§  OrderHandler executing with disambiguation...");

        const rawUserText = ctx?.body?.text || text || '';
        const rawExtractedQuantity = extractQuantity(rawUserText);
        let hasExplicitNumber = hasExplicitQuantityInText(rawUserText);

        // 0. Extract quantity â€” normalize primitive/object/string forms safely.
        let quantity = entities?.quantity;

        if (typeof quantity === 'object' && quantity !== null) {
            quantity = quantity.value ?? 1;
        }

        if (quantity == null) {
            quantity = hasExplicitNumber ? rawExtractedQuantity : 1;
        }

        quantity = Number(quantity ?? 1);

        if (!Number.isFinite(quantity) || quantity < 1) {
            quantity = 1;
        }

        const hasPortionInDish = /\b\d+\s*(?:szt|szt\.|sztuk|ml|l|cm|g|kg)\b/i.test(String(entities?.dish || ''));

        // Prefer quantity explicitly provided by user text over canonized entity quantity.
        if (rawExtractedQuantity > 1 && hasExplicitNumber) {
            quantity = rawExtractedQuantity;
            hasExplicitNumber = true;
        }

        // If quantity likely came from canonicalized dish name (e.g. "6 szt.")
        // and user didn't provide quantity explicitly, default to single item.
        if (!hasExplicitNumber && hasPortionInDish) {
            quantity = 1;
            hasExplicitNumber = false;
        }

        // Use the dish resolved by NLU (e.g. from ordinal selection) or fallback to raw text
        let searchPhrase = entities?.dish || text || "";

        if (typeof searchPhrase === "string") {
            // Remove parenthetical canonicalization hints, e.g. "Dish Name (alias)"
            searchPhrase = searchPhrase.replace(/\s*\([^)]*\)/g, "").trim();

            // B-QTY FIX: Strip leading quantities (digits or words) from the search phrase
            // so that "2 wege burger" becomes "wege burger" for matching.
            searchPhrase = searchPhrase.replace(/^(?:\d+\s*|jeden|jedna|jedno|dwa|dwie|trzy|cztery|pi[eÄ™][cÄ‡][u]?|sze[sĹ›][cÄ‡][u]?|siedem|osiem|dziewi[eÄ™][cÄ‡][u]?|dziesi[eÄ™][cÄ‡][u]?|kilka|par[Ä™e])\s+/i, '').trim();
        }

        const itemCandidates = normalizeOrderItemCandidates(entities?.items);
        const singleCompoundQuantityAllowed = isSingleCompoundQuantityAllowed(entities, itemCandidates);
        const singleCompoundCandidate = itemCandidates.length === 1 ? itemCandidates[0] : null;

        if (singleCompoundQuantityAllowed && singleCompoundCandidate) {
            quantity = Math.max(1, Math.floor(Number(singleCompoundCandidate.quantity || quantity || 1)));
            hasExplicitNumber = true;
            searchPhrase = singleCompoundCandidate.meta?.rawLabel || singleCompoundCandidate.dish || searchPhrase;

            console.log('[SINGLE_COMPOUND_ALLOW_TRACE]', JSON.stringify({
                source: entities?.compoundSource || 'unknown',
                dish: searchPhrase,
                quantity,
                skipCategoryClarify: Boolean(entities?.skipCategoryClarify),
                skipGenericTokenBlock: Boolean(entities?.skipGenericTokenBlock),
            }));
        }

        if (itemCandidates.length > 1) {
            const currentRestaurantId = session?.currentRestaurant?.id || session?.lastRestaurant?.id;
            const menu = getSessionMenu(session);
            const addonContext = session?.expectedContext === 'order_addon';
            const sessionRestaurant = session?.currentRestaurant?.name || session?.lastRestaurant?.name || null;
            const resolvedItems = [];
            let targetRestaurant = session?.currentRestaurant || session?.lastRestaurant || null;

            for (const candidate of itemCandidates) {
                const candidateText = candidate.dish;
                const candidateQuantity = Math.max(1, Math.floor(Number(candidate.quantity || 1)));
                const candidateResult = await resolveOrderCandidate({
                    candidateText,
                    candidateMeta: candidate.meta,
                    rawUserText,
                    session,
                    entities,
                    menu,
                    currentRestaurantId,
                    addonContext,
                });

                if (candidateResult?.resolution?.status !== DISAMBIGUATION_RESULT.ADD_ITEM || !candidateResult?.resolution?.item) {
                    return buildClarifyResponse({
                        ambiguousMeta: {
                            ...(candidateResult?.ambiguousMeta || {}),
                            requestedCategory: ORDER_REQUESTED_CATEGORY.MULTI,
                        },
                        addonContext,
                        sessionRestaurant,
                        reason: 'multi_item_not_resolved',
                    });
                }

                if (candidateResult.resolvedCategory === ORDER_REQUESTED_CATEGORY.ADDON && !addonContext) {
                    return buildClarifyResponse({
                        ambiguousMeta: {
                            ...(candidateResult.ambiguousMeta || {}),
                            requestedCategory: ORDER_REQUESTED_CATEGORY.ADDON,
                        },
                        addonContext,
                        sessionRestaurant,
                        reason: 'addon_without_context',
                    });
                }

                const resolvedRestaurant = candidateResult?.resolution?.restaurant || targetRestaurant;
                if (targetRestaurant && resolvedRestaurant && String(targetRestaurant.id || '') !== String(resolvedRestaurant.id || '')) {
                    return buildClarifyResponse({
                        ambiguousMeta: {
                            status: 'AMBIGUOUS',
                            requestedCategory: ORDER_REQUESTED_CATEGORY.MULTI,
                            candidates: [],
                        },
                        addonContext,
                        sessionRestaurant,
                        reason: 'multi_restaurant_conflict',
                    });
                }

                targetRestaurant = resolvedRestaurant || targetRestaurant;
                const item = candidateResult.resolution.item;
                const existingIndex = resolvedItems.findIndex((candidateItem) => String(candidateItem.id) === String(item.id));
                if (existingIndex >= 0) {
                    resolvedItems[existingIndex].quantity += candidateQuantity;
                    resolvedItems[existingIndex].hasExplicitNumber = resolvedItems[existingIndex].hasExplicitNumber || candidateQuantity > 1;
                } else {
                    resolvedItems.push({
                        id: item.id,
                        name: item.name,
                        price: parseFloat(item.price_pln ?? item.price ?? 0),
                        quantity: candidateQuantity,
                        hasExplicitNumber: candidateQuantity > 1,
                    });
                }
            }

            if (!targetRestaurant?.id || resolvedItems.length === 0) {
                return buildClarifyResponse({
                    ambiguousMeta: {
                        status: 'AMBIGUOUS',
                        requestedCategory: ORDER_REQUESTED_CATEGORY.MULTI,
                        candidates: [],
                    },
                    addonContext,
                    sessionRestaurant,
                    reason: 'multi_missing_restaurant',
                });
            }

            const total = resolvedItems
                .reduce((sum, item) => sum + (Number(item.price) * Number(item.quantity || 1)), 0)
                .toFixed(2);
            const totalPieces = resolvedItems.reduce((sum, item) => sum + Number(item.quantity || 1), 0);
            const hydratedMenu = menu.length > 0 ? menu : getSessionMenu(session);
            const cartLock = getCartRestaurantLock(session);
            const restaurantLockTrace = {
                conflict: false,
                lockedRestaurantId: cartLock.lockedRestaurantId || null,
                currentRestaurantName: cartLock.cartRestaurantName || null,
                targetRestaurantId: targetRestaurant?.id || null,
                targetRestaurantName: targetRestaurant?.name || null,
            };

            if (
                cartLock.hasItems &&
                cartLock.lockedRestaurantId &&
                String(cartLock.lockedRestaurantId) !== String(targetRestaurant.id)
            ) {
                return buildRestaurantSwitchConflictResponse({
                    currentRestaurantName: cartLock.cartRestaurantName,
                    targetRestaurant,
                    lockedRestaurantId: cartLock.lockedRestaurantId,
                });
            }
            console.log('[RESTAURANT_LOCK_TRACE]', JSON.stringify(restaurantLockTrace));

            session.pendingOrder = {
                restaurant_id: targetRestaurant.id,
                restaurant: targetRestaurant.name,
                items: resolvedItems,
                total,
                createdAt: Date.now(),
            };

            const commitResult = commitPendingOrder(session);
            if (!commitResult.committed) {
                return {
                    reply: "Wystapil problem przy dodawaniu do koszyka. Sprobuj ponownie.",
                    contextUpdates: {
                        lastRestaurant: targetRestaurant,
                        currentRestaurant: targetRestaurant,
                        expectedContext: null,
                        lastIntent: 'create_order'
                    }
                };
            }

            session.expectedContext = 'order_continue';
            if (Array.isArray(hydratedMenu) && hydratedMenu.length > 0) {
                session.lastMenuItems = hydratedMenu;
                session.last_menu = hydratedMenu;
            }

            return {
                reply: `Dodalam ${resolvedItems.length} pozycje (${totalPieces} szt.) z ${targetRestaurant.name}. Razem ${total} zl. ${ORDER_FLOW_ANCHOR_REPLY}`,
                actions: [
                    {
                        type: 'SHOW_CART',
                        payload: { mode: 'badge' }
                    }
                ],
                meta: {
                    source: 'order_handler_multi_autocommit',
                    addedToCart: true,
                    cart: session.cart,
                    orderMode: 'multi_candidate',
                    restaurant: { id: targetRestaurant.id, name: targetRestaurant.name },
                    restaurantLockTrace,
                },
                contextUpdates: {
                    lastRestaurant: targetRestaurant,
                    currentRestaurant: targetRestaurant,
                    expectedContext: 'order_continue',
                    pendingOrder: null,
                    conversationPhase: 'ordering',
                    cart: session.cart,
                    lastIntent: 'create_order',
                    lastMenuItems: hydratedMenu,
                    last_menu: hydratedMenu,
                }
            };
        }

        // 1. DISAMBIGUATION CHECK
        // Use the new service to resolve what item user wants
        // We pass the current restaurant context if available
        const currentRestaurantId = session?.currentRestaurant?.id || session?.lastRestaurant?.id;

        const menu = getSessionMenu(session);
        const rawRequestedDish = searchPhrase;
        const singleCandidateMeta = singleCompoundCandidate?.meta && typeof singleCompoundCandidate.meta === 'object'
            ? singleCompoundCandidate.meta
            : null;
        const singleResolverRaw = singleCandidateMeta?.rawLabel || rawRequestedDish;
        const useRawLabelForSingle = Boolean(singleCandidateMeta?.canonicalAliasBundle);
        const canonicalDish = useRawLabelForSingle
            ? singleResolverRaw
            : canonicalizeDish(singleResolverRaw, session);
        const requestedDish = canonicalDish || singleResolverRaw || rawRequestedDish;
        const token = normalizeDish(requestedDish);
        const addonContext = session?.expectedContext === 'order_addon';
        const explicitAddonRequest =
            addonContext ||
            isExplicitAddonRequest(rawUserText) ||
            isExplicitAddonRequest(requestedDish);
        const explicitDrinkRequest =
            isExplicitDrinkRequest(rawRequestedDish) ||
            isExplicitDrinkRequest(requestedDish);
        const genericTokenBlocked =
            isGenericTokenOnly(rawRequestedDish) ||
            isGenericTokenOnly(requestedDish);
        const modifierHint = normalizeDish(singleCandidateMeta?.modifier || '');
        const shouldBlockGenericToken = genericTokenBlocked && !singleCompoundQuantityAllowed && !modifierHint;

        if (singleCandidateMeta) {
            console.log('[SAFE_CANON_ITEM_TRACE]', JSON.stringify({
                source: entities?.compoundSource || 'single_item',
                inputDish: rawRequestedDish || null,
                outputDish: requestedDish || null,
                quantity: quantity || null,
                canonicalAliasBundle: Boolean(singleCandidateMeta?.canonicalAliasBundle),
                rawLabel: singleCandidateMeta?.rawLabel || null,
            }));
        }

        if (shouldBlockGenericToken) {
            const sessionRestaurant = session?.currentRestaurant?.name || session?.lastRestaurant?.name || null;
            const requestedCategory = inferRequestedCategory({
                requestedDish,
                rawUserText,
                addonContext,
                candidates: [],
            });
            const ambiguousMeta = buildAmbiguousResolution({
                requestedCategory,
                candidates: [],
            });

            console.log('[GENERIC_TOKEN_BLOCK_TRACE]', JSON.stringify({
                requestedDish,
                rawRequestedDish,
                requestedCategory,
                addonContext,
                sessionRestaurant,
            }));

            return buildClarifyResponse({
                ambiguousMeta,
                addonContext,
                sessionRestaurant,
                reason: 'generic_token_block',
            });
        }

        let directMatch = null;
        let menuCandidates = [];
        let fallbackUsed = false;

        if (!explicitAddonRequest && !explicitDrinkRequest && menu.length > 0) {
            const strictMainResolution = resolveMainItemStrict({
                menu,
                rawRequestedDish,
                requestedDish,
                canonicalDish,
                session,
            });

            if (strictMainResolution?.item) {
                directMatch = strictMainResolution.item;
                fallbackUsed = strictMainResolution.fallbackUsed;
            } else {
                const sessionRestaurant = session?.currentRestaurant?.name || session?.lastRestaurant?.name || null;
                const orderResolveTrace = {
                    canonical: canonicalDish || requestedDish || null,
                    resolvedItemId: null,
                    resolvedType: null,
                    fallbackUsed: false,
                };
                console.log('[ORDER_RESOLVE_TRACE]', JSON.stringify(orderResolveTrace));
                const clarifyCandidates = collectMenuCandidates(menu, requestedDish);
                const requestedCategory = inferRequestedCategory({
                    requestedDish,
                    rawUserText,
                    addonContext,
                    candidates: clarifyCandidates,
                });
                const ambiguousMeta = buildAmbiguousResolution({
                    requestedCategory,
                    candidates: clarifyCandidates,
                });
                console.log('[ORDER_CLARIFY_TRACE]', JSON.stringify({
                    category: ambiguousMeta.requestedCategory,
                    candidateCount: ambiguousMeta.candidates.length,
                    sessionRestaurant,
                }));
                return buildClarifyResponse({
                    ambiguousMeta,
                    addonContext,
                    sessionRestaurant,
                    reason: 'strict_main_not_found',
                });

            }
        }

        if (!directMatch && explicitAddonRequest && token && menu.length > 0) {
            directMatch = findDirectMenuMatch(requestedDish, menu, session);

            if (!directMatch) {
                menuCandidates = menu.filter((item) => {
                    const base = normalizeDish(item?.base_name || '');
                    const name = normalizeDish(item?.name || '');
                    return (base && base.includes(token)) || (name && name.includes(token));
                });

                if (menuCandidates.length === 1) {
                    directMatch = menuCandidates[0];
                    fallbackUsed = true;
                }
            }
        }

        if (!directMatch && explicitDrinkRequest && token && menu.length > 0) {
            directMatch = findDirectMenuMatch(requestedDish, menu, session);
        }

        if (modifierHint && menu.length > 0) {
            const prioritizedAddon = resolveAddonWithModifierPriority({
                menu,
                requestedDish: singleCandidateMeta?.rawLabel || requestedDish,
                rawModifier: modifierHint,
                allowGenericFallback: false,
            });

            console.log('[ADDON_MODIFIER_TRACE]', JSON.stringify({
                rawModifier: modifierHint,
                resolvedItemName: prioritizedAddon?.item?.name || null,
                scoreBoost: prioritizedAddon?.scoreBoost || 0,
            }));

            if (!prioritizedAddon?.item) {
                const sessionRestaurant = session?.currentRestaurant?.name || session?.lastRestaurant?.name || null;
                const requestedCategory = inferRequestedCategory({
                    requestedDish,
                    rawUserText,
                    addonContext,
                    candidates: [],
                });
                const ambiguousMeta = buildAmbiguousResolution({
                    requestedCategory,
                    candidates: [],
                });
                return buildClarifyResponse({
                    ambiguousMeta,
                    addonContext,
                    sessionRestaurant,
                    reason: 'modifier_not_found',
                });
            }

            directMatch = prioritizedAddon.item;
            fallbackUsed = fallbackUsed || prioritizedAddon.mode !== 'exact_modifier';
        }

        if (!directMatch && explicitAddonRequest && isStaraKamienicaSession(session)) {
            const normalizedRequestedDish = normalizeDish(requestedDish);
            const isZurekRequest =
                normalizedRequestedDish.includes('zurek') ||
                normalizedRequestedDish.includes('urek') ||
                normalizedRequestedDish === 'zur' ||
                normalizedRequestedDish.includes('zur ');

            if (isZurekRequest) {
                const scopedFallback = resolveScopedZurekFallback(menu);
                if (scopedFallback) {
                    directMatch = scopedFallback;
                    menuCandidates = [scopedFallback];
                    fallbackUsed = true;
                }
            }
        }

        console.log('[KROK5-DEBUG] match state', JSON.stringify({
            searchPhrase: requestedDish,
            token,
            menuLength: menu.length,
            directMatch: directMatch?.name || null
        }));

        const resolution = directMatch
            ? {
                status: DISAMBIGUATION_RESULT.ADD_ITEM,
                item: directMatch,
                restaurant: session?.currentRestaurant || session?.lastRestaurant
            }
            : await resolveMenuItemConflict(requestedDish, {
                restaurant_id: currentRestaurantId,
                entities,
                session: {
                    ...session,
                    last_menu: menu
                },
                last_menu: menu
            });

        console.log(`đź§  Disambiguation Result: ${resolution.status} for "${searchPhrase}"`);

        const resolvedItemCategory = resolution?.item ? resolveCategoryFromItem(resolution.item) : null;
        if (resolution?.item && !explicitAddonRequest && resolvedItemCategory === ORDER_REQUESTED_CATEGORY.ADDON && !singleCompoundQuantityAllowed) {
            const sessionRestaurant = session?.currentRestaurant?.name || session?.lastRestaurant?.name || null;
            const clarifyCandidates = [resolution.item, ...collectMenuCandidates(menu, requestedDish)]
                .filter(Boolean)
                .filter((item, index, arr) => {
                    const key = item?.id
                        ? String(item.id)
                        : `${normalizeDish(item?.name || '')}:${resolveItemType(item)}`;
                    return arr.findIndex((candidate) => {
                        const candidateKey = candidate?.id
                            ? String(candidate.id)
                            : `${normalizeDish(candidate?.name || '')}:${resolveItemType(candidate)}`;
                        return candidateKey === key;
                    }) === index;
                });
            const requestedCategory = inferRequestedCategory({
                requestedDish,
                rawUserText,
                addonContext,
                candidates: clarifyCandidates,
            });
            const ambiguousMeta = buildAmbiguousResolution({
                requestedCategory,
                candidates: clarifyCandidates,
            });
            const blockedOrderResolveTrace = {
                canonical: canonicalDish || requestedDish || null,
                resolvedItemId: resolution.item.id || null,
                resolvedType: resolvedItemCategory,
                fallbackUsed,
            };
            console.log('[ORDER_RESOLVE_TRACE]', JSON.stringify(blockedOrderResolveTrace));
            console.log('[ORDER_CLARIFY_TRACE]', JSON.stringify({
                category: ambiguousMeta.requestedCategory,
                candidateCount: ambiguousMeta.candidates.length,
                sessionRestaurant,
            }));
            return buildClarifyResponse({
                ambiguousMeta,
                addonContext,
                sessionRestaurant,
                reason: 'resolved_non_main_without_addon_context',
            });

        }

        const orderResolveTrace = {
            canonical: canonicalDish || requestedDish || null,
            resolvedItemId: resolution?.item?.id || null,
            resolvedType: resolvedItemCategory,
            fallbackUsed,
        };
        console.log('[ORDER_RESOLVE_TRACE]', JSON.stringify(orderResolveTrace));
        console.log('[ORDER_CATEGORY_TRACE]', JSON.stringify({
            requestedDish,
            requestedCategory: inferRequestedCategory({
                requestedDish,
                rawUserText,
                addonContext,
                candidates: collectMenuCandidates(menu, requestedDish),
            }),
            resolvedCategory: resolution?.item ? resolveCategoryFromItem(resolution.item) : null,
        }));

        // CASE A: Item Not Found
        if (resolution.status === DISAMBIGUATION_RESULT.ITEM_NOT_FOUND) {
            console.log('[KROK5-DEBUG] fallback triggered - dish not matched', JSON.stringify({ searchPhrase, dish: entities?.dish || null, menuLength: menu.length }));
            const sessionRestaurant = session?.currentRestaurant?.name || session?.lastRestaurant?.name || null;
            const clarifyCandidates = collectMenuCandidates(menu, requestedDish);
            const requestedCategory = inferRequestedCategory({
                requestedDish,
                rawUserText,
                addonContext,
                candidates: clarifyCandidates,
            });
            const ambiguousMeta = buildAmbiguousResolution({
                requestedCategory,
                candidates: clarifyCandidates,
            });
            console.log('[ORDER_CLARIFY_TRACE]', JSON.stringify({
                category: ambiguousMeta.requestedCategory,
                candidateCount: ambiguousMeta.candidates.length,
                sessionRestaurant,
            }));
            return buildClarifyResponse({
                ambiguousMeta,
                addonContext,
                sessionRestaurant,
                reason: 'item_not_found',
            });

        }

        // CASE B: Disambiguation Required (Multi-match, no context)
        if (resolution.status === DISAMBIGUATION_RESULT.DISAMBIGUATION_REQUIRED) {
            const options = resolution.candidates.slice(0, 3); // Limit to 3
            const optionNames = options.map(o => o.restaurant.name).join(", ");

            return {
                reply: `To danie jest dostÄ™pne w: ${optionNames}. Z ktĂłrej restauracji chcesz zamĂłwiÄ‡?`,
                contextUpdates: {
                    expectedContext: 'choose_restaurant',
                    pendingDisambiguation: resolution.candidates // Store for next turn
                }
            };
            // Note: NLU needs to handle 'choose_restaurant' context next
        }

        // CASE C: Success (Single Item Resolved)
        if (resolution.status === DISAMBIGUATION_RESULT.ADD_ITEM) {
            const item = resolution.item;
            const restaurant = resolution.restaurant || session?.currentRestaurant || session?.lastRestaurant;
            const hydratedMenu = menu.length > 0 ? menu : getSessionMenu(session);
            const cartLock = getCartRestaurantLock(session);
            const restaurantLockTrace = {
                conflict: false,
                lockedRestaurantId: cartLock.lockedRestaurantId || null,
                currentRestaurantName: cartLock.cartRestaurantName || null,
                targetRestaurantId: restaurant?.id || null,
                targetRestaurantName: restaurant?.name || null,
            };

            if (
                cartLock.hasItems &&
                cartLock.lockedRestaurantId &&
                String(cartLock.lockedRestaurantId) !== String(restaurant?.id || '')
            ) {
                return buildRestaurantSwitchConflictResponse({
                    currentRestaurantName: cartLock.cartRestaurantName,
                    targetRestaurant: restaurant,
                    lockedRestaurantId: cartLock.lockedRestaurantId,
                });
            }
            console.log('[RESTAURANT_LOCK_TRACE]', JSON.stringify(restaurantLockTrace));

            // Determine if we are switching restaurants
            const isSwitch = currentRestaurantId && currentRestaurantId !== restaurant.id;

            // Build Item Payload
            const orderItem = {
                id: item.id,
                name: item.name,
                price: parseFloat(item.price_pln ?? item.price ?? 0),
                quantity: quantity,
                hasExplicitNumber
            };
            const total = (orderItem.price * quantity).toFixed(2);

            // Build pendingOrder and commit immediately to keep backend cart + UI sync consistent.
            session.pendingOrder = {
                restaurant_id: restaurant.id,
                restaurant: restaurant.name,
                items: [orderItem],
                total: total,
                ...(isSwitch ? { warning: 'switch_restaurant' } : {}),
                createdAt: Date.now()
            };

            const commitResult = commitPendingOrder(session);
            if (!commitResult.committed) {
                return {
                    reply: "Wystąpił problem przy dodawaniu do koszyka. Spróbuj ponownie.",
                    contextUpdates: {
                        lastRestaurant: restaurant,
                        currentRestaurant: restaurant,
                        expectedContext: null,
                        lastIntent: 'create_order'
                    }
                };
            }

            session.expectedContext = 'order_continue';
            if (Array.isArray(hydratedMenu) && hydratedMenu.length > 0) {
                session.lastMenuItems = hydratedMenu;
                session.last_menu = hydratedMenu;
            }

            const switchPrefix = isSwitch ? `Znaleziono "${item.name}" w ${restaurant.name}. ` : '';
            return {
                reply: `${switchPrefix}Dodałam ${formatSzt(quantity)} ${item.name} z ${restaurant.name}. Razem ${total} zł. ${ORDER_FLOW_ANCHOR_REPLY}`,
                actions: [
                    {
                        type: 'SHOW_CART',
                        payload: { mode: 'badge' }
                    }
                ],
                meta: {
                    source: 'order_handler_autocommit',
                    addedToCart: true,
                    cart: session.cart,
                    restaurant: { id: restaurant.id, name: restaurant.name },
                    restaurantLockTrace,
                },
                contextUpdates: {
                    lastRestaurant: restaurant,
                    currentRestaurant: restaurant,
                    expectedContext: 'order_continue',
                    pendingOrder: null,
                    conversationPhase: 'ordering',
                    cart: session.cart,
                    lastIntent: 'create_order',
                    lastMenuItems: hydratedMenu,
                    last_menu: hydratedMenu,
                }
            };
        }

        return { reply: "Przepraszam, wystÄ…piĹ‚ nieoczekiwany bĹ‚Ä…d przy wyszukiwaniu dania." };
    }
}





