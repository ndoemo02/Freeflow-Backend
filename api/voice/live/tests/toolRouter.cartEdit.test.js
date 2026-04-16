import { describe, expect, it, vi } from 'vitest';
import { ToolRouter } from '../ToolRouter.js';

function createHarness(initialSession = {}) {
    const sessions = new Map();
    sessions.set('sess_test', {
        cart: { items: [], total: 0 },
        ...initialSession,
    });

    const getSession = (sessionId) => sessions.get(sessionId) || {};
    const updateSession = (sessionId, patch) => {
        const current = sessions.get(sessionId) || {};
        Object.assign(current, patch);
        sessions.set(sessionId, current);
        return current;
    };

    const router = new ToolRouter({
        pipeline: { handlers: {} },
        handlers: {},
        getSession,
        updateSession,
    });

    return { router, sessions, getSession, updateSession };
}

describe('ToolRouter cart edit tools', () => {
    it('update_cart_item_quantity updates qty and cart total', async () => {
        const { router, getSession } = createHarness({
            cart: {
                items: [{ id: 'i1', name: 'Cola', price_pln: 7, qty: 1 }],
                total: 7,
            },
        });

        const result = await router.executeToolCall({
            sessionId: 'sess_test',
            toolName: 'update_cart_item_quantity',
            args: { dish: 'Cola', quantity: 3 },
            requestId: 'req_1',
        });

        expect(result.ok).toBe(true);
        expect(result.response.reply).toContain('Zmienilam ilosc');
        const session = getSession('sess_test');
        expect(session.cart.items[0].qty).toBe(3);
        expect(session.cart.total).toBe(21);
    });

    it('remove_item_from_cart decreases quantity when quantity arg is smaller than current qty', async () => {
        const { router, getSession } = createHarness({
            cart: {
                items: [{ id: 'i1', name: 'Frytki', price_pln: 10, qty: 3 }],
                total: 30,
            },
        });

        const result = await router.executeToolCall({
            sessionId: 'sess_test',
            toolName: 'remove_item_from_cart',
            args: { dish: 'Frytki', quantity: 1 },
            requestId: 'req_2',
        });

        expect(result.ok).toBe(true);
        expect(result.response.reply).toContain('Zmniejszylam ilosc');
        const session = getSession('sess_test');
        expect(session.cart.items[0].qty).toBe(2);
        expect(session.cart.total).toBe(20);
    });

    it('remove_item_from_cart removes whole item when quantity is not provided', async () => {
        const { router, getSession } = createHarness({
            cart: {
                items: [
                    { id: 'i1', name: 'Frytki', price_pln: 10, qty: 1 },
                    { id: 'i2', name: 'Cola', price_pln: 7, qty: 1 },
                ],
                total: 17,
            },
        });

        const result = await router.executeToolCall({
            sessionId: 'sess_test',
            toolName: 'remove_item_from_cart',
            args: { dish: 'Frytki' },
            requestId: 'req_3',
        });

        expect(result.ok).toBe(true);
        expect(result.response.reply).toContain('Usunelam');
        const session = getSession('sess_test');
        expect(session.cart.items).toHaveLength(1);
        expect(session.cart.items[0].name).toBe('Cola');
        expect(session.cart.total).toBe(7);
    });

    it('replace_cart_item adds new dish and removes old dish', async () => {
        const { router, getSession } = createHarness({
            currentRestaurant: { id: 'r1', name: 'Lawasz Kebab' },
            cart: {
                items: [{ id: 'old_1', name: 'Kurczak XL', price_pln: 20, qty: 2, restaurant_id: 'r1', restaurant_name: 'Lawasz Kebab' }],
                total: 40,
            },
        });

        const originalExecute = router.executeToolCall.bind(router);
        const addSpy = vi.fn(async ({ sessionId, args }) => {
            const session = getSession(sessionId);
            session.cart.items.push({
                id: 'new_1',
                name: args.dish,
                price_pln: 22,
                qty: Number(args.quantity || 1),
                restaurant_id: 'r1',
                restaurant_name: 'Lawasz Kebab',
            });
            session.cart.total = 84;
            return {
                ok: true,
                response: {
                    ok: true,
                    intent: 'create_order',
                    cart: session.cart,
                },
                trace: [],
            };
        });

        router.executeToolCall = vi.fn(async (payload) => {
            if (payload.toolName === 'add_item_to_cart') {
                return addSpy(payload);
            }
            return originalExecute(payload);
        });

        const result = await router.executeToolCall({
            sessionId: 'sess_test',
            toolName: 'replace_cart_item',
            args: { from_dish: 'Kurczak XL', to_dish: 'Wolowina XL' },
            requestId: 'req_4',
        });

        expect(result.ok).toBe(true);
        expect(result.response.reply).toContain('Zamienilam');
        expect(addSpy).toHaveBeenCalledTimes(1);
        const session = getSession('sess_test');
        const names = session.cart.items.map((item) => item.name);
        expect(names).toContain('Wolowina XL');
        expect(names).not.toContain('Kurczak XL');
    });
});
