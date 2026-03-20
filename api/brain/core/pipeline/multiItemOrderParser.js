import { parseCompoundOrder } from '../../nlu/compoundOrderParser.js';

export function parseMultiOrderCandidates(text = '') {
    const parsed = parseCompoundOrder(text);
    if (!Array.isArray(parsed?.items)) return [];
    return parsed.items.map((item) => item?.dish).filter(Boolean);
}

function normalizeExistingItems(items = []) {
    if (!Array.isArray(items)) return [];
    return items
        .map((item) => {
            if (typeof item === 'string') {
                const dish = item.trim();
                return dish ? { dish, quantity: 1 } : null;
            }
            if (item && typeof item === 'object') {
                const dish = String(item.dish || item.name || '').trim();
                if (!dish) return null;
                const quantity = Math.max(1, Math.floor(Number(item.quantity ?? item.qty ?? 1) || 1));
                return { dish, quantity };
            }
            return null;
        })
        .filter(Boolean);
}

export function applyMultiItemParsing({
    text = '',
    intent = '',
    entities = {},
    menu = [],
} = {}) {
    const safeEntities = (entities && typeof entities === 'object') ? { ...entities } : {};

    if (intent !== 'create_order') {
        return {
            entities: safeEntities,
            orderMode: null,
            items: [],
        };
    }

    const existingItems = normalizeExistingItems(safeEntities.items);
    if (existingItems.length > 1) {
        safeEntities.items = existingItems;
        return {
            entities: safeEntities,
            orderMode: 'multi_candidate',
            items: existingItems,
        };
    }

    const parsed = parseCompoundOrder(text, menu);
    const candidates = normalizeExistingItems(parsed?.items);
    if (candidates.length <= 1) {
        return {
            entities: safeEntities,
            orderMode: null,
            items: [],
        };
    }

    safeEntities.items = candidates;

    return {
        entities: safeEntities,
        orderMode: 'multi_candidate',
        items: candidates,
    };
}
