import { findBestDishMatch, levenshtein } from '../helpers.js';

const SPLIT_REGEX = /\s*(?:,|\+|\boraz\b|\bi\b)\s*/gi;
const LETTER_PATTERN = '[a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ]';

const ORDER_PREFIX_REGEX = /^\s*(?:poprosze|prosze|zamawiam|zamowie|dodaj|wezme|biore|chce|dla mnie|podaj|wez|bede prosic|wezme|wezmę)\b[\s,:-]*/i;

const LEADING_QTY_REGEX = /^\s*(\d+)\s*(?:x|razy|szt|szt\.|sztuk|porcj(?:a|e|i)?)?\b\s*/i;
const LEADING_X_NUMBER_REGEX = /^\s*x\s*(\d+)\b\s*/i;
const LEADING_NUMBER_X_REGEX = /^\s*(\d+)\s*x\b\s*/i;
const LEADING_NUMBER_RAZY_REGEX = /^\s*(\d+)\s*razy\b\s*/i;
const TRAILING_QTY_REGEX = /\b(\d+)\s*(?:x|razy|szt|szt\.|sztuk|porcj(?:a|e|i)?)\s*$/i;
const TRAILING_X_PREFIX_REGEX = /\bx\s*(\d+)\s*$/i;
const TRAILING_NUMBER_X_REGEX = /\b(\d+)x\s*$/i;
const TRAILING_RAZY_REGEX = /\brazy\s*(\d+)\s*$/i;

const QTY_WORDS = new Map([
    ['jeden', 1], ['jedna', 1], ['jedno', 1],
    ['dwa', 2], ['dwie', 2], ['dwoch', 2], ['dwoje', 2],
    ['trzy', 3], ['trzech', 3], ['troje', 3],
    ['cztery', 4], ['czterech', 4],
    ['piec', 5], ['pieciu', 5],
    ['szesc', 6], ['szesciu', 6],
    ['siedem', 7], ['siedmiu', 7],
    ['osiem', 8], ['osmiu', 8],
    ['dziewiec', 9], ['dziewieciu', 9],
    ['dziesiec', 10], ['dziesieciu', 10],
    ['kilka', 2], ['kilku', 2], ['pare', 2],
]);
const QTY_WORD_KEYS = [...QTY_WORDS.keys()].join('|');
const LEADING_WORD_QTY_REGEX = new RegExp(`^\\s*(${QTY_WORD_KEYS})\\s*(?:x|razy)?\\b\\s*`, 'i');
const INLINE_QTY_BREAK_REGEX = new RegExp(`\\s+(?=(?:\\d+\\s*(?:x|razy)?\\s*${LETTER_PATTERN}|(?:${QTY_WORD_KEYS})\\s+${LETTER_PATTERN}))`, 'gi');

const FILLER_WORDS = new Set([
    'mi', 'prosze', 'poprosze', 'dodaj', 'chce', 'wezme', 'wezme', 'zamawiam', 'podaj', 'oraz', 'i', 'zamowie',
]);

const MODIFIER_BASE_TOKENS = new Set([
    'sos',
    'sosy',
    'napoj',
    'napoje',
    'dodatek',
    'dodatki',
    'burger',
    'pizza',
]);

function normalizeText(value = '') {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\u0142/g, 'l')
        .replace(/[^a-z0-9\s+-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function cleanSegmentText(value = '') {
    let cleaned = String(value || '')
        .replace(ORDER_PREFIX_REGEX, '')
        .replace(/\s+/g, ' ')
        .trim();

    const tokens = normalizeText(cleaned).split(' ').filter(Boolean);
    if (tokens.length > 1 && FILLER_WORDS.has(tokens[0])) {
        cleaned = cleaned.split(/\s+/).slice(1).join(' ').trim();
    }

    return cleaned;
}

function toTitleCase(value = '') {
    return String(value || '')
        .split(/\s+/)
        .filter(Boolean)
        .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
        .join(' ');
}

function singularizeToken(token = '') {
    if (!token) return token;
    if (token.endsWith('awy')) return `${token.slice(0, -3)}awa`;
    if (token.endsWith('e') && token.length > 3) return `${token.slice(0, -1)}a`;
    if (token.endsWith('y') && token.length > 3) return `${token.slice(0, -1)}`;
    if (token.endsWith('i') && token.length > 4) return `${token.slice(0, -1)}`;
    return token;
}

function generatePhraseVariants(phrase = '') {
    const normalized = normalizeText(phrase);
    if (!normalized) return [];

    const variants = new Set([normalized]);
    const tokens = normalized.split(' ').filter(Boolean);

    if (tokens.length > 0) {
        const singular = tokens.map(singularizeToken).join(' ').trim();
        if (singular) variants.add(singular);

        if (tokens.length === 2) {
            variants.add(`${tokens[1]} ${tokens[0]}`);
            variants.add(`${singularizeToken(tokens[1])} ${singularizeToken(tokens[0])}`);
        }
    }

    return [...variants];
}

function stripRemainingQuantityOperators(dishPart = '') {
    return String(dishPart || '')
        .replace(/^\s*(?:x|razy)\b\s*/i, '')
        .replace(/\b(?:x|razy)\s*$/i, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function extractQuantityFromSegment(segment = '') {
    let quantity = 1;
    let dishPart = segment;
    let quantitySource = 'default';

    const normalized = normalizeText(segment);
    if (!normalized) {
        return { quantity, dishPart: '', quantitySource };
    }

    const leadingXNumber = dishPart.match(LEADING_X_NUMBER_REGEX);
    if (leadingXNumber) {
        quantity = Math.max(1, parseInt(leadingXNumber[1], 10) || 1);
        dishPart = dishPart.replace(LEADING_X_NUMBER_REGEX, '').trim();
        return { quantity, dishPart: stripRemainingQuantityOperators(dishPart), quantitySource: 'leading_x_number' };
    }

    const leadingNumberX = dishPart.match(LEADING_NUMBER_X_REGEX);
    if (leadingNumberX) {
        quantity = Math.max(1, parseInt(leadingNumberX[1], 10) || 1);
        dishPart = dishPart.replace(LEADING_NUMBER_X_REGEX, '').trim();
        return { quantity, dishPart: stripRemainingQuantityOperators(dishPart), quantitySource: 'leading_number_x' };
    }

    const leadingNumberRazy = dishPart.match(LEADING_NUMBER_RAZY_REGEX);
    if (leadingNumberRazy) {
        quantity = Math.max(1, parseInt(leadingNumberRazy[1], 10) || 1);
        dishPart = dishPart.replace(LEADING_NUMBER_RAZY_REGEX, '').trim();
        return { quantity, dishPart: stripRemainingQuantityOperators(dishPart), quantitySource: 'leading_number_razy' };
    }

    const leadingNumeric = dishPart.match(LEADING_QTY_REGEX);
    if (leadingNumeric) {
        quantity = Math.max(1, parseInt(leadingNumeric[1], 10) || 1);
        dishPart = dishPart.replace(LEADING_QTY_REGEX, '').trim();
        return { quantity, dishPart: stripRemainingQuantityOperators(dishPart), quantitySource: 'leading_number' };
    }

    const leadingWordQty = dishPart.match(LEADING_WORD_QTY_REGEX);
    if (leadingWordQty) {
        const normalizedWord = normalizeText(leadingWordQty[1]);
        quantity = QTY_WORDS.get(normalizedWord) || 1;
        dishPart = dishPart.replace(LEADING_WORD_QTY_REGEX, '').trim();
        return { quantity, dishPart: stripRemainingQuantityOperators(dishPart), quantitySource: 'leading_word_qty' };
    }

    const trailingNumeric = dishPart.match(TRAILING_QTY_REGEX);
    if (trailingNumeric) {
        quantity = Math.max(1, parseInt(trailingNumeric[1], 10) || 1);
        dishPart = dishPart.replace(TRAILING_QTY_REGEX, '').trim();
        return { quantity, dishPart: stripRemainingQuantityOperators(dishPart), quantitySource: 'trailing_number' };
    }

    const trailingXPrefix = dishPart.match(TRAILING_X_PREFIX_REGEX);
    if (trailingXPrefix) {
        quantity = Math.max(1, parseInt(trailingXPrefix[1], 10) || 1);
        dishPart = dishPart.replace(TRAILING_X_PREFIX_REGEX, '').trim();
        return { quantity, dishPart: stripRemainingQuantityOperators(dishPart), quantitySource: 'trailing_x_number' };
    }

    const trailingNumberX = dishPart.match(TRAILING_NUMBER_X_REGEX);
    if (trailingNumberX) {
        quantity = Math.max(1, parseInt(trailingNumberX[1], 10) || 1);
        dishPart = dishPart.replace(TRAILING_NUMBER_X_REGEX, '').trim();
        return { quantity, dishPart: stripRemainingQuantityOperators(dishPart), quantitySource: 'trailing_number_x' };
    }

    const trailingRazy = dishPart.match(TRAILING_RAZY_REGEX);
    if (trailingRazy) {
        quantity = Math.max(1, parseInt(trailingRazy[1], 10) || 1);
        dishPart = dishPart.replace(TRAILING_RAZY_REGEX, '').trim();
        return { quantity, dishPart: stripRemainingQuantityOperators(dishPart), quantitySource: 'trailing_razy_number' };
    }

    return { quantity, dishPart: stripRemainingQuantityOperators(dishPart), quantitySource };
}

function collapseRepeatedDishTokens(dishPart = '', baseQuantity = 1) {
    const normalized = normalizeText(dishPart);
    if (!normalized) {
        return { dish: '', quantity: baseQuantity };
    }

    const tokens = normalized.split(' ').filter(Boolean);
    if (tokens.length < 2) {
        return { dish: dishPart.trim(), quantity: baseQuantity };
    }

    const first = tokens[0];
    const allSame = tokens.every((token) => token === first);
    if (!allSame) {
        return { dish: dishPart.trim(), quantity: baseQuantity };
    }

    return {
        dish: first,
        quantity: Math.max(1, baseQuantity) * tokens.length,
    };
}

function scoreTokenMatch(inputToken = '', candidateToken = '') {
    if (!inputToken || !candidateToken) return 0;
    if (inputToken === candidateToken) return 1;
    if (inputToken.includes(candidateToken) || candidateToken.includes(inputToken)) return 0.88;
    const distance = levenshtein(inputToken, candidateToken);
    if (distance <= 1) return 0.8;
    if (distance <= 2 && Math.min(inputToken.length, candidateToken.length) >= 5) return 0.65;
    return 0;
}

function scoreMenuCandidate(phrase = '', menuItem = {}) {
    const phraseNorm = normalizeText(phrase);
    const candidateNorm = normalizeText(menuItem?.base_name || menuItem?.name || '');
    if (!phraseNorm || !candidateNorm) return 0;

    if (phraseNorm === candidateNorm) return 1.4;
    if (candidateNorm.includes(phraseNorm) || phraseNorm.includes(candidateNorm)) return 1.1;

    const phraseTokens = phraseNorm.split(' ').filter(Boolean);
    const candidateTokens = candidateNorm.split(' ').filter(Boolean);
    if (phraseTokens.length === 0 || candidateTokens.length === 0) return 0;

    let tokenScore = 0;
    for (const token of phraseTokens) {
        let best = 0;
        for (const candidateToken of candidateTokens) {
            best = Math.max(best, scoreTokenMatch(token, candidateToken));
        }
        tokenScore += best;
    }

    return tokenScore / phraseTokens.length;
}

function normalizeResolverName(value = '', fallbackDish = '') {
    const normalized = String(value || '').trim();
    if (!normalized) {
        return {
            dish: fallbackDish,
            canonicalAliasBundle: false,
            canonicalAlias: null,
        };
    }

    if (normalized.includes('/') || normalized.includes(',')) {
        return {
            dish: fallbackDish,
            canonicalAliasBundle: true,
            canonicalAlias: normalized,
        };
    }

    return {
        dish: normalized,
        canonicalAliasBundle: false,
        canonicalAlias: null,
    };
}

function resolveDishName(rawDish = '', menu = []) {
    const cleaned = cleanSegmentText(rawDish);
    if (!cleaned) {
        return {
            dish: '',
            canonicalAliasBundle: false,
            canonicalAlias: null,
        };
    }

    const fallbackDish = toTitleCase(cleaned);

    if (!Array.isArray(menu) || menu.length === 0) {
        return {
            dish: fallbackDish,
            canonicalAliasBundle: false,
            canonicalAlias: null,
        };
    }

    const variants = generatePhraseVariants(cleaned);
    for (const variant of variants) {
        const exact = menu.find((item) => {
            const itemNorm = normalizeText(item?.base_name || item?.name || '');
            return itemNorm === variant;
        });
        if (exact) {
            return normalizeResolverName(exact.base_name || exact.name, fallbackDish);
        }
    }

    for (const variant of variants) {
        const fuzzy = findBestDishMatch(variant, menu);
        if (fuzzy) {
            return normalizeResolverName(fuzzy.base_name || fuzzy.name, fallbackDish);
        }
    }

    const scored = menu
        .map((item) => ({
            item,
            score: Math.max(...variants.map((variant) => scoreMenuCandidate(variant, item))),
        }))
        .sort((a, b) => b.score - a.score);

    if (scored.length > 0 && scored[0].score >= 0.62) {
        const winner = scored[0].item;
        return normalizeResolverName(winner.base_name || winner.name, fallbackDish);
    }

    return {
        dish: fallbackDish,
        canonicalAliasBundle: false,
        canonicalAlias: null,
    };
}

function extractModifier(rawDish = '', resolvedDish = '') {
    const rawTokens = normalizeText(rawDish).split(' ').filter(Boolean);
    if (rawTokens.length < 2) return null;

    if (MODIFIER_BASE_TOKENS.has(rawTokens[0])) {
        return rawTokens.slice(1).join(' ').trim() || null;
    }

    const resolvedTokens = normalizeText(resolvedDish).split(' ').filter(Boolean);
    if (resolvedTokens.length >= 2 && MODIFIER_BASE_TOKENS.has(resolvedTokens[0])) {
        return resolvedTokens.slice(1).join(' ').trim() || null;
    }

    return null;
}

function mergeDuplicateItems(items = []) {
    const aggregated = new Map();

    for (const item of items) {
        const dish = String(item?.dish || '').trim();
        if (!dish) continue;

        const quantity = Math.max(1, Math.floor(Number(item?.quantity) || 1));
        const modifierKey = normalizeText(item?.meta?.modifier || '');
        const key = `${normalizeText(dish)}::${modifierKey}`;
        const existing = aggregated.get(key);

        if (existing) {
            existing.quantity += quantity;
        } else {
            aggregated.set(key, {
                dish,
                quantity,
                meta: item?.meta ? { ...item.meta } : undefined,
            });
        }
    }

    return [...aggregated.values()];
}

function splitWithHeuristic(cleaned = '') {
    const splitSegments = cleaned
        .split(SPLIT_REGEX)
        .map((segment) => cleanSegmentText(segment))
        .filter(Boolean);

    if (splitSegments.length > 1) {
        return { segments: splitSegments, heuristicTraces: [] };
    }

    const withInlineBreaks = cleaned.replace(INLINE_QTY_BREAK_REGEX, ' | ');
    const heuristicSegments = withInlineBreaks
        .split('|')
        .map((segment) => cleanSegmentText(segment))
        .filter(Boolean);

    if (heuristicSegments.length > 1) {
        return {
            segments: heuristicSegments,
            heuristicTraces: [{
                strategy: 'inline_quantity_break',
                input: cleaned,
                rewritten: withInlineBreaks,
                segments: heuristicSegments,
            }],
        };
    }

    return { segments: splitSegments.length > 0 ? splitSegments : [cleaned], heuristicTraces: [] };
}

export function parseCompoundOrder(text = '', menu = []) {
    const cleaned = cleanSegmentText(text);
    if (!cleaned) {
        return { items: [], segmentTraces: [], heuristicTraces: [] };
    }

    const { segments: sourceSegments, heuristicTraces } = splitWithHeuristic(cleaned);
    const segmentTraces = [];

    const parsedItems = sourceSegments
        .map((segment) => {
            const { quantity, dishPart, quantitySource } = extractQuantityFromSegment(segment);
            const collapsed = collapseRepeatedDishTokens(dishPart, quantity);
            const rawLabel = cleanSegmentText(collapsed.dish);
            const resolved = resolveDishName(rawLabel, menu);
            const resolvedDish = resolved?.dish || '';
            if (!resolvedDish) return null;

            const modifier = extractModifier(rawLabel, resolvedDish);
            const itemMeta = {
                rawLabel: toTitleCase(rawLabel || resolvedDish),
            };

            if (modifier) {
                itemMeta.modifier = modifier;
            }

            if (resolved.canonicalAliasBundle) {
                itemMeta.canonicalAliasBundle = true;
                itemMeta.canonicalAlias = resolved.canonicalAlias;
            }

            segmentTraces.push({
                segment,
                quantity: Math.max(1, Math.floor(Number(collapsed.quantity) || 1)),
                quantitySource,
                dishRaw: collapsed.dish,
                dishResolved: resolvedDish,
                modifier: modifier || null,
                canonicalAliasBundle: Boolean(itemMeta.canonicalAliasBundle),
            });

            return {
                dish: resolvedDish,
                quantity: Math.max(1, Math.floor(Number(collapsed.quantity) || 1)),
                meta: itemMeta,
            };
        })
        .filter(Boolean);

    const items = mergeDuplicateItems(parsedItems);
    return { items, segmentTraces, heuristicTraces };
}
