export const ORDER_REQUESTED_CATEGORY = {
    MAIN: 'MAIN',
    DRINK: 'DRINK',
    ADDON: 'ADDON',
    MULTI: 'MULTI',
    UNKNOWN: 'UNKNOWN',
};

function normalizeCategory(category) {
    const value = String(category || '').toUpperCase();
    if (value === ORDER_REQUESTED_CATEGORY.MAIN) return ORDER_REQUESTED_CATEGORY.MAIN;
    if (value === ORDER_REQUESTED_CATEGORY.DRINK) return ORDER_REQUESTED_CATEGORY.DRINK;
    if (value === ORDER_REQUESTED_CATEGORY.ADDON) return ORDER_REQUESTED_CATEGORY.ADDON;
    if (value === ORDER_REQUESTED_CATEGORY.MULTI) return ORDER_REQUESTED_CATEGORY.MULTI;
    return ORDER_REQUESTED_CATEGORY.UNKNOWN;
}

export function buildClarifyMessage(meta = {}) {
    const category = normalizeCategory(meta?.requestedCategory || meta?.category);
    const expectedContext = String(meta?.expectedContext || '').toLowerCase();

    if (category === ORDER_REQUESTED_CATEGORY.MULTI) {
        return 'Chcesz dodac kilka pozycji. Potwierdz ktore dokladnie.';
    }

    if (category === ORDER_REQUESTED_CATEGORY.MAIN) {
        return 'Nie jestem pewna ktore danie glowne masz na mysli.\nPodaj pelna nazwe z listy lub wybierz na ekranie.';
    }

    if (category === ORDER_REQUESTED_CATEGORY.DRINK) {
        return 'Chcesz dodac napoj.\nPodaj dokladna nazwe lub wybierz z listy napojow.';
    }

    if (category === ORDER_REQUESTED_CATEGORY.ADDON) {
        if (expectedContext === 'order_addon') {
            return 'Chcesz dodac dodatek do zamowienia?\nPodaj nazwe lub wybierz na ekranie.';
        }
        return 'Czy chcesz dodac dodatek?\nPodaj nazwe lub wybierz na ekranie.';
    }

    return 'Nie jestem pewna co chcesz zamowic.\nMozesz wybrac z listy lub powiedziec pelna nazwe.';
}

export function buildClarifyOrderMessage(meta = {}) {
    return buildClarifyMessage(meta);
}

export function resolveRequestedCategory(value) {
    return normalizeCategory(value);
}
