const QTY_WORDS = [
    'jeden', 'jedna', 'jedno',
    'dwa', 'dwie',
    'trzy', 'cztery',
    'piec', 'szesc', 'siedem', 'osiem', 'dziewiec', 'dziesiec',
    'kilka', 'pare',
];

function normalize(value = '') {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\u0142/g, 'l')
        .replace(/\s+/g, ' ')
        .trim();
}

function hasQuantityToken(text = '') {
    const normalized = normalize(text);
    if (!normalized) return false;

    if (/\b\d+\b/.test(normalized)) return true;
    return QTY_WORDS.some((token) => new RegExp(`\\b${token}\\b`, 'i').test(normalized));
}

function detectQuantityConfidence(rawText = '', quantity) {
    if (!Number.isInteger(quantity) || quantity <= 1) return 1;

    const normalized = normalize(rawText);

    // Very strong quantity signal.
    if (/^\s*\d+\s*(x|razy|szt|sztuk|porcj)\b/i.test(normalized)) return 0.98;
    if (/^\s*\d+\b/.test(normalized)) return 0.92;
    if (/^\s*(jeden|jedna|jedno|dwa|dwie|trzy|cztery|piec|szesc|siedem|osiem|dziewiec|dziesiec|kilka|pare)\b/.test(normalized)) return 0.84;

    // Weak: quantity found in a tail phrase or dish alias.
    if (hasQuantityToken(normalized)) return 0.55;

    return 0.5;
}

export function finalizeEntities(ctx = {}) {
    const entities = (ctx?.entities && typeof ctx.entities === 'object') ? { ...ctx.entities } : {};
    const quantity = entities.quantity;

    if (!Number.isInteger(quantity) || quantity <= 1) {
        return {
            entities,
            quantityConfidence: 1,
            qtyRejectedReason: null,
        };
    }

    const textNormalized = normalize(ctx?.text || '');
    const dishNormalized = normalize(entities?.dish || '');
    const quantityConfidence = detectQuantityConfidence(ctx?.text || '', quantity);

    const dishHasNumericToken = hasQuantityToken(dishNormalized);
    const qtyExtractedFromDishAlias = Boolean(
        dishNormalized &&
        textNormalized.includes(dishNormalized) &&
        hasQuantityToken(dishNormalized)
    );

    let qtyRejectedReason = null;

    if (qtyExtractedFromDishAlias) {
        qtyRejectedReason = 'qty_extracted_from_dish_alias';
    } else if (dishHasNumericToken) {
        qtyRejectedReason = 'dish_name_contains_numeric_token';
    } else if (quantityConfidence < 0.7) {
        qtyRejectedReason = 'qty_confidence_below_threshold';
    }

    if (qtyRejectedReason) {
        entities.quantity = null;
    }

    return {
        entities,
        quantityConfidence,
        qtyRejectedReason,
    };
}
