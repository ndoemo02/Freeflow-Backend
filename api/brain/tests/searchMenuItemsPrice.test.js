import { describe, it, expect } from 'vitest';
import { ToolRouter } from '../../voice/live/ToolRouter.js';

/**
 * Kontrakt ceny w wynikach `search_menu_items`.
 *
 * Powod powstania: mapowanie w `ToolRouter.js` czytalo `x.price`, podczas gdy
 * kolumna w bazie nazywa sie **`price_pln`**. Kazda pozycja zwracana do modelu
 * miala `price: null`, wiec Amber dostawala nazwy dan bez cen i nie mogla ich
 * podac — mimo ze baza ma komplet (np. Pizza Margherita 40 cm = 39 zl).
 *
 * `show_menu` czytal poprawne pole, wiec objaw byl niekonsekwentny: ceny bywaly
 * widoczne po pokazaniu karty, a znikaly po wyszukaniu. Zgloszenie wlasciciela
 * brzmialo „czasami jest podana pozycja ale nie ma ceny wiekszych rozmiarow".
 *
 * Istniejace testy tego nie lapaly, bo karmily mocka polem `price` — utrwalily
 * ksztalt, ktorego zywa baza nie ma. Ten test celowo uzywa `price_pln`.
 */

function makeFakeHandlers() {
    return {
        food: {
            handleFind: async () => ({ ok: true, restaurants: [] }),
            handleMenu: async () => ({ ok: true, menuItems: [] }),
            handleOrder: async () => ({ ok: true }),
            handleSelect: async () => ({ ok: true }),
            handleConfirm: async () => ({ ok: true }),
        },
    };
}

function makeRouter(sessionId, menuItems) {
    const sessions = new Map([[sessionId, { menuItems }]]);
    return new ToolRouter({
        handlers: makeFakeHandlers(),
        getSession: (id) => sessions.get(id) || {},
        updateSession: (id, patch) => {
            const next = { ...(sessions.get(id) || {}), ...patch };
            sessions.set(id, next);
            return next;
        },
    });
}

describe('search_menu_items — cena pozycji', () => {
    it('przenosi cene z kolumny price_pln (ksztalt zywej bazy)', async () => {
        const router = makeRouter('sess_price_pln', [
            { id: 'pizza-32', base_name: 'Pizza Margherita', size_or_variant: '32 cm', price_pln: 29 },
            { id: 'pizza-40', base_name: 'Pizza Margherita', size_or_variant: '40 cm', price_pln: 39 },
        ]);

        const result = await router.executeToolCall({
            sessionId: 'sess_price_pln',
            toolName: 'search_menu_items',
            args: { query: 'margherita' },
            requestId: 'req-price-pln',
        });

        expect(result.ok).toBe(true);
        const prices = result.response.menuItems.map((item) => item.price);
        expect(prices).not.toContain(null);
        expect(prices).toEqual(expect.arrayContaining([29, 39]));
    });

    it('rozroznia ceny wariantow rozmiarowych tej samej pozycji', async () => {
        const router = makeRouter('sess_price_variants', [
            { id: 'pizza-32', base_name: 'Pizza Margherita', size_or_variant: '32 cm', price_pln: 29 },
            { id: 'pizza-40', base_name: 'Pizza Margherita', size_or_variant: '40 cm', price_pln: 39 },
        ]);

        const result = await router.executeToolCall({
            sessionId: 'sess_price_variants',
            toolName: 'search_menu_items',
            args: { query: 'margherita' },
            requestId: 'req-price-variants',
        });

        const big = result.response.menuItems.find((item) => item.variant === '40 cm');
        expect(big).toBeTruthy();
        expect(big.price).toBe(39);
    });

    it('nadal obsluguje starsze pole price (zgodnosc wsteczna)', async () => {
        const router = makeRouter('sess_price_legacy', [
            { id: 'legacy-1', name: 'Pierogi ruskie', price: 18, item_tags: ['pierogi'] },
        ]);

        const result = await router.executeToolCall({
            sessionId: 'sess_price_legacy',
            toolName: 'search_menu_items',
            args: { query: 'pierogi' },
            requestId: 'req-price-legacy',
        });

        expect(result.response.menuItems[0].price).toBe(18);
    });

    it('przenosi dietary_flags do skroconej listy dla modelu', async () => {
        // Shortlist `menuItems` jest tym, co model traktuje jako WYNIK wyszukiwania.
        // Pelna karta (`menu`) niesie `dietary_flags`, ale shortlist ich nie mial,
        // wiec na pytanie „czy to bezglutenowe?" po wczesniejszym wyszukaniu model
        // odpowiadal z niepelnych danych. To informacja alergenowa — musi byc przy
        // pozycji, na ktora model patrzy.
        const router = makeRouter('sess_flags', [
            {
                id: 'gf-1',
                base_name: 'Placki ziemniaczane',
                price_pln: 29,
                dietary_flags: ['gluten_free', 'vegetarian'],
            },
        ]);

        const result = await router.executeToolCall({
            sessionId: 'sess_flags',
            toolName: 'search_menu_items',
            args: { query: 'placki' },
            requestId: 'req-flags',
        });

        expect(result.response.menuItems[0].dietary_flags).toEqual(['gluten_free', 'vegetarian']);
    });

    it('daje pusta liste flag, gdy pozycja ich nie ma', async () => {
        const router = makeRouter('sess_flags_empty', [
            { id: 'plain-1', base_name: 'Rosol', price_pln: 18 },
        ]);

        const result = await router.executeToolCall({
            sessionId: 'sess_flags_empty',
            toolName: 'search_menu_items',
            args: { query: 'rosol' },
            requestId: 'req-flags-empty',
        });

        expect(result.response.menuItems[0].dietary_flags).toEqual([]);
    });

    it('zostawia null, gdy pozycja naprawde nie ma ceny', async () => {
        const router = makeRouter('sess_price_missing', [
            { id: 'noprice-1', base_name: 'Danie dnia', item_tags: ['danie'] },
        ]);

        const result = await router.executeToolCall({
            sessionId: 'sess_price_missing',
            toolName: 'search_menu_items',
            args: { query: 'danie' },
            requestId: 'req-price-missing',
        });

        expect(result.response.menuItems[0].price).toBeNull();
    });
});
