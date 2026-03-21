export const CHECKOUT_REQUIRED_FIELDS = Object.freeze(['name', 'phone', 'address']);

function toCleanString(value) {
    if (value == null) return '';
    return String(value).trim();
}

export function normalizeCheckoutDraft(input = {}) {
    const source = (input && typeof input === 'object') ? input : {};

    return {
        name: toCleanString(source.name ?? source.customer_name ?? source.customerName ?? source.fullName),
        phone: toCleanString(source.phone ?? source.customer_phone ?? source.customerPhone),
        address: toCleanString(source.address ?? source.delivery_address ?? source.deliveryAddress),
        notes: toCleanString(source.notes ?? source.comment ?? source.instructions),
    };
}

export function extractCheckoutDraft(sessionSnapshot = {}) {
    const session = (sessionSnapshot && typeof sessionSnapshot === 'object') ? sessionSnapshot : {};

    const candidate =
        session.checkoutDraft
        ?? session.deliveryInfo
        ?? session.checkout
        ?? session.meta?.checkoutDraft
        ?? {};

    return normalizeCheckoutDraft(candidate);
}

export function mergeCheckoutDraft(currentDraft = {}, incomingDraft = {}) {
    const current = normalizeCheckoutDraft(currentDraft);
    const incoming = (incomingDraft && typeof incomingDraft === 'object') ? incomingDraft : {};
    const normalizedIncoming = normalizeCheckoutDraft(incoming);

    const resolved = { ...current };
    const keyAliases = {
        name: ['name', 'customer_name', 'customerName', 'fullName'],
        phone: ['phone', 'customer_phone', 'customerPhone'],
        address: ['address', 'delivery_address', 'deliveryAddress'],
        notes: ['notes', 'comment', 'instructions'],
    };

    for (const [targetKey, aliases] of Object.entries(keyAliases)) {
        const hasIncomingValue = aliases.some((alias) => Object.prototype.hasOwnProperty.call(incoming, alias));
        if (hasIncomingValue) {
            resolved[targetKey] = normalizedIncoming[targetKey];
        }
    }

    return resolved;
}

export function buildCheckoutProgress(sessionSnapshot = {}) {
    const draft = extractCheckoutDraft(sessionSnapshot);

    const filledFields = CHECKOUT_REQUIRED_FIELDS.filter((field) => Boolean(draft[field]));
    const missingFields = CHECKOUT_REQUIRED_FIELDS.filter((field) => !draft[field]);

    const cart = sessionSnapshot?.cart || { items: [], total: 0 };
    const cartItems = (cart.items || []).reduce((sum, item) => sum + Number(item?.qty || item?.quantity || 1), 0);
    const cartTotal = Number(cart.total || 0);

    const completion = CHECKOUT_REQUIRED_FIELDS.length === 0
        ? 100
        : Math.round((filledFields.length / CHECKOUT_REQUIRED_FIELDS.length) * 100);

    const complete = missingFields.length === 0;

    return {
        requiredFields: CHECKOUT_REQUIRED_FIELDS,
        filledFields,
        missingFields,
        completion,
        complete,
        readyToSubmit: complete && cartItems > 0,
        cartItems,
        cartTotal: Number.isFinite(cartTotal) ? cartTotal : 0,
        draft,
    };
}
