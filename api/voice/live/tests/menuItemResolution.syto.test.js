import { beforeEach, describe, expect, it, vi } from 'vitest';
import sytoMenu from './fixtures/sytoPoNaszymuMenu.json';

// Replays the owner's production voice run of 2026-09-25 (session sess_1790312400027_c7xg4g)
// against a snapshot of the real "Syto po Naszymu" menu, in the exact shape getMenuItems returns.
vi.mock('../../../brain/menuService.js', async (original) => ({
    ...await original(),
    getMenuItems: async () => sytoMenu,
    loadMenuPreview: async () => sytoMenu,
}));

import { ToolRouter } from '../ToolRouter.js';

const restaurant = { id: 'a2be7ddb-d1dd-49d6-9026-57ecd4c94d60', name: 'Syto po Naszymu' };
const rosol = sytoMenu.find((item) => item.name === 'Rosół z domowym makaronem');

let session;
let router;

function freshSession(cartItems = []) {
    const items = cartItems.map((item) => ({ ...item, qty: item.qty ?? 1, restaurant_id: restaurant.id }));
    return {
        currentRestaurant: restaurant,
        lastRestaurant: restaurant,
        last_menu: sytoMenu,
        lastMenu: sytoMenu,
        menuItems: sytoMenu,
        cart: { items, total: items.reduce((sum, item) => sum + item.price_pln * item.qty, 0) },
        conversationPhase: 'restaurant_selected',
        orderMode: 'restaurant_selected',
    };
}

async function call(toolName, args, transcript) {
    vi.stubGlobal('fetch', vi.fn(() => {
        throw new Error('External request forbidden');
    }));
    try {
        return await router.executeToolCall({
            sessionId: 'sess_syto_menu_resolution',
            toolName,
            transcript,
            args: { ...args, restaurant_id: restaurant.id, restaurant_name: restaurant.name },
            requestId: `req_${Math.random().toString(36).slice(2, 10)}`,
            turnId: `turn_${Math.random().toString(36).slice(2, 10)}`,
        });
    } finally {
        vi.unstubAllGlobals();
    }
}

const cartLines = () => session.cart.items.map((item) => [item.name, item.qty ?? item.quantity]);

beforeEach(() => {
    session = freshSession();
    router = new ToolRouter({
        getSession: () => session,
        updateSession: (_, patch) => (session = { ...session, ...patch }),
    });
});

describe('Syto po Naszymu — menu item resolution from the owner voice run', () => {
    it('07:02:00 "Kotlet schabowy standard" ×2 adds the standard variant, not "duży"', async () => {
        await call('add_item_to_cart', { dish: 'Kotlet schabowy standard', quantity: 2 }, 'Tak, dwie porcje.');
        expect(cartLines()).toEqual([['Kotlet schabowy — standard', 2]]);
    });

    it('07:03:22 "Pierogi z kapustą i grzybami" adds the kapusta i grzyby variant', async () => {
        await call('add_item_to_cart', { dish: 'Pierogi z kapustą i grzybami', quantity: 1 }, 'Jedno, bo sypirogusz kapustom i z grzybami.');
        expect(cartLines()).toEqual([['Pierogi — kapusta i grzyby', 1]]);
    });

    it('07:03:04 batch: pierogi z kapustą i grzybami + miska kaszy are added at once and named in the reply', async () => {
        const result = await call(
            'add_items_to_cart',
            {
                items: [
                    { dish: 'Pierogi z kapustą i grzybami', quantity: 1 },
                    { dish: 'Miska kaszy z pieczonymi warzywami', quantity: 1 },
                ],
            },
            'gości tam Michał Mikołaj. Poprosiłbym te pierogi z kapustą i z grzybami, e, również jedną porcję i miskę kaszy z pieczonymi warzywami.',
        );
        // Owner decision 2026-09-25 (DECISIONS.md, C2): a fully resolved bundle is committed without a confirmation turn.
        expect(cartLines()).toEqual([
            ['Pierogi — kapusta i grzyby', 1],
            ['Miska kaszy z pieczonymi warzywami', 1],
        ]);
        expect(session.pendingOrder ?? null).toBeNull();
        expect(session.expectedContext ?? null).toBeNull();
        const reply = String(result.response.reply || result.response.text || '');
        expect(reply).toContain('Pierogi — kapusta i grzyby');
        expect(reply).toContain('Miska kaszy z pieczonymi warzywami');
        const liveTool = result.response.meta.liveTool;
        expect(liveTool.pendingConfirmationPrepared).toBe(false);
        expect(liveTool.successDowngraded).toBe(false);
    });

    it('09:45 a second bundle is added on top of the first instead of replacing it', async () => {
        await call(
            'add_items_to_cart',
            { items: [{ dish: 'Pierogi z kapustą i grzybami', quantity: 1 }, { dish: 'Miska kaszy z pieczonymi warzywami', quantity: 1 }] },
            'Poproszę pierogi z kapustą i grzybami i miskę kaszy.',
        );
        await call(
            'add_items_to_cart',
            { items: [{ dish: 'Kompot domowy 0,3 l', quantity: 1 }, { dish: 'Maślanka 0,4 l', quantity: 1 }] },
            'Dodaj jeszcze kompot 0,3 i maślankę.',
        );
        expect(cartLines()).toEqual([
            ['Pierogi — kapusta i grzyby', 1],
            ['Miska kaszy z pieczonymi warzywami', 1],
            ['Kompot domowy 0,3 l', 1],
            ['Maślanka 0,4 l', 1],
        ]);
    });

    it('a bundle for another restaurant never joins a cart locked to a different restaurant', async () => {
        const otherLine = { id: 'other-item', name: 'Kebab w bułce', price_pln: 25, qty: 1, restaurant_id: 'other-restaurant-id' };
        session.cart = { items: [otherLine], total: 25, restaurantId: 'other-restaurant-id' };
        await call(
            'add_items_to_cart',
            { items: [{ dish: 'Pierogi z kapustą i grzybami', quantity: 1 }, { dish: 'Miska kaszy z pieczonymi warzywami', quantity: 1 }] },
            'Poproszę pierogi z kapustą i grzybami i miskę kaszy.',
        );
        expect(cartLines()).toEqual([['Kebab w bułce', 1]]);
    });

    it('after an order the session keeps its restaurant, so "dodaj jeszcze kompot" starts a new cart there', async () => {
        // State after POST /api/orders clears the voice session cart (orders.js).
        session = { ...freshSession(), orderMode: 'completed', expectedContext: null, pendingOrder: null };
        vi.stubGlobal('fetch', vi.fn(() => { throw new Error('External request forbidden'); }));
        try {
            await router.executeToolCall({
                sessionId: 'sess_syto_menu_resolution',
                toolName: 'add_item_to_cart',
                transcript: 'Dodaj jeszcze kompot 0,3.',
                args: { dish: 'Kompot domowy 0,3 l', quantity: 1 },
                requestId: 'req_after_order',
                turnId: 'turn_after_order',
            });
        } finally {
            vi.unstubAllGlobals();
        }
        expect(cartLines()).toEqual([['Kompot domowy 0,3 l', 1]]);
    });

    it('generic base: a request naming another dish under the same base asks instead of guessing', async () => {
        const pizzaMenu = [
            { id: 'p-marg-32', name: 'Pizza Margherita 32 cm', base_name: 'Pizza', size_or_variant: '32 cm', price_pln: 29, category: 'Pizza', available: true, restaurant_id: restaurant.id },
            { id: 'p-haw-45', name: 'Pizza Hawajska 45 cm', base_name: 'Pizza', size_or_variant: '45 cm', price_pln: 49, category: 'Pizza', available: true, restaurant_id: restaurant.id },
        ];
        session = { ...freshSession(), last_menu: pizzaMenu, lastMenu: pizzaMenu, menuItems: pizzaMenu };
        await call('add_item_to_cart', { dish: 'Pizza Hawajska 32 cm', quantity: 1 }, 'dodaj pizzę hawajską 32 cm');
        expect(session.cart.items.map((item) => item.id)).not.toContain('p-marg-32');
    });

    it('size written as "0.3l" selects the same kompot as "0,3 l"', async () => {
        await call('add_item_to_cart', { dish: 'Kompot domowy 0.3l', quantity: 1 }, 'kompot domowy zero trzy');
        expect(cartLines()).toEqual([['Kompot domowy 0,3 l', 1]]);
    });

    it('07:03:53 "Tak, proszę bardzo. Czy to będzie wszystko?" still adds the confirmed naleśniki', async () => {
        await call('add_item_to_cart', { dish: 'Naleśniki z serem i wanilią', quantity: 1 }, 'Tak, proszę bardzo. Czy to będzie wszystko?');
        expect(cartLines()).toEqual([['Naleśniki z serem i wanilią', 1]]);
    });

    it('07:05:04 "Kompot domowy" without a size never adds a different dish; it asks for the variant', async () => {
        session = freshSession([rosol]);
        const result = await call('add_item_to_cart', { dish: 'Kompot domowy', quantity: 1 }, 'Może być ten niższy.');
        expect(cartLines()).toEqual([['Rosół z domowym makaronem', 1]]);
        const serialized = JSON.stringify(result);
        expect(serialized).toContain('0,3 l');
        expect(serialized).toContain('0,5 l');
    });

    it('a drink phrase that misses the family match is never turned into a soup by fuzzy fallback', async () => {
        session = freshSession([rosol]);
        await call('add_item_to_cart', { dish: 'domowy kompot', quantity: 1 }, 'poproszę domowy kompot');
        expect(cartLines()).toEqual([['Rosół z domowym makaronem', 1]]);
    });

    it('"Kompot domowy 0,3 l" adds the small kompot', async () => {
        await call('add_item_to_cart', { dish: 'Kompot domowy 0,3 l', quantity: 1 }, 'ten mniejszy, zero trzy');
        expect(cartLines()).toEqual([['Kompot domowy 0,3 l', 1]]);
    });

    it('a bare "Pierogi" with a garbled transcript asks with all three variants', async () => {
        const result = await call('add_item_to_cart', { dish: 'Pierogi', quantity: 1 }, 'Não vi esse problema.');
        expect(cartLines()).toEqual([]);
        const options = (result.response.meta?.clarify?.options || []).map((option) => option.name);
        expect(options).toEqual(expect.arrayContaining(['Pierogi — kapusta i grzyby', 'Pierogi — ruskie', 'Pierogi — z mięsem']));
        expect(result.response.reply).toContain('Pierogi — z mięsem');
    });

    it('regression guard: "Rosół z domowym makaronem" still adds rosół', async () => {
        await call('add_item_to_cart', { dish: 'Rosół z domowym makaronem', quantity: 1 }, 'jedną porcję');
        expect(cartLines()).toEqual([['Rosół z domowym makaronem', 1]]);
    });
});
