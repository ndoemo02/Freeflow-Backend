import { describe, it, expect } from 'vitest';
import { ToolRouter } from '../../voice/live/ToolRouter.js';

function makeFakeHandlers() {
    return {
        food: {
            find_nearby: {
                execute: async () => ({
                    reply: 'Znalazłam restauracje.',
                    restaurants: [{ id: 'r1', name: 'Rest 1', distance: 1.2 }],
                    contextUpdates: { expectedContext: 'select_restaurant' },
                }),
            },
            select_restaurant: {
                execute: async () => ({
                    reply: 'Wybrano restaurację.',
                    contextUpdates: {
                        currentRestaurant: { id: 'r1', name: 'Rest 1' },
                        conversationPhase: 'restaurant_selected',
                    },
                }),
            },
            menu_request: {
                execute: async () => ({
                    reply: 'Pokazuję menu.',
                    menuItems: [{ id: 'm1', name: 'Pierogi', price_pln: 13 }],
                    contextUpdates: { expectedContext: 'create_order' },
                }),
            },
            show_more_options: { execute: async () => ({ reply: 'Więcej opcji.' }) },
        },
        ordering: {
            create_order: {
                execute: async (ctx) => ({
                    reply: `Dodano ${ctx.entities?.dish || 'pozycję'}.`,
                    contextUpdates: {
                        cart: { items: [{ name: ctx.entities?.dish || 'x', qty: 1 }], total: 13 },
                        expectedContext: 'order_continue',
                    },
                    actions: [{ type: 'SHOW_CART', payload: { mode: 'badge' } }],
                }),
            },
            confirm_add_to_cart: { execute: async () => ({ reply: 'Potwierdzono.', contextUpdates: { expectedContext: null } }) },
            open_checkout: { execute: async () => ({ reply: 'Checkout.', contextUpdates: { conversationPhase: 'checkout' } }) },
            confirm_order: { execute: async () => ({ reply: 'Zamówienie potwierdzone.', contextUpdates: { conversationPhase: 'idle' } }) },
            cancel_order: { execute: async () => ({ reply: 'Anulowano.', contextUpdates: { expectedContext: null } }) },
        },
        system: {
            fallback: { execute: async () => ({ reply: 'Fallback.' }) },
        },
    };
}

describe('Live ToolRouter', () => {
    it('returns unknown_tool for unsupported tool', async () => {
        const sessions = new Map();
        const getSession = (id) => sessions.get(id) || {};
        const updateSession = (id, patch) => {
            const prev = sessions.get(id) || {};
            const next = { ...prev, ...patch };
            sessions.set(id, next);
            return next;
        };

        const router = new ToolRouter({
            handlers: makeFakeHandlers(),
            getSession,
            updateSession,
        });

        const result = await router.executeToolCall({
            sessionId: 'sess_live_test_unknown',
            toolName: 'not_existing',
            args: {},
        });

        expect(result.ok).toBe(false);
        expect(result.error).toBe('unknown_tool');
    });

    it('missing sessionId returns missing_session_id error', async () => {
        const router = new ToolRouter({
            handlers: makeFakeHandlers(),
            getSession: () => ({}),
            updateSession: (_, p) => p,
        });

        const result = await router.executeToolCall({
            sessionId: '',
            toolName: 'add_item_to_cart',
            args: { dish: 'Pierogi', quantity: 1 },
        });

        expect(result.ok).toBe(false);
        expect(result.error).toBe('missing_session_id');
    });

    it('add_item_to_cart without currentRestaurant falls back to find_nearby (ICM state redirect)', async () => {
        // Session has no currentRestaurant → checkRequiredState for create_order fails
        // fallbackIntent = 'find_nearby' → router redirects to find_nearby handler
        const sessions = new Map([
            ['sess_icm_test', { conversationPhase: 'neutral' }],
        ]);
        const getSession = (id) => sessions.get(id) || {};
        const updateSession = (id, patch) => {
            const next = { ...(sessions.get(id) || {}), ...patch };
            sessions.set(id, next);
            return next;
        };

        const router = new ToolRouter({
            handlers: makeFakeHandlers(),
            getSession,
            updateSession,
        });

        const result = await router.executeToolCall({
            sessionId: 'sess_icm_test',
            toolName: 'add_item_to_cart',
            args: { dish: 'Pierogi', quantity: 1 },
        });

        // Router falls back to find_nearby — still returns ok=true (it handled it)
        expect(result.ok).toBe(true);
        expect(result.response.intent).toBe('find_nearby');
        expect(result.trace.some(t => t.includes('icm_fallback_intent'))).toBe(true);
    });

    it('confirm_order without pendingOrder → ICM state fails → redirects to find_nearby', async () => {
        // confirm_order requires pendingOrder + expectedContext=confirm_order.
        // With empty session, ICM check fails.
        // getFallbackIntent falls back to 'find_nearby' (|| 'find_nearby' in getFallbackIntent impl).
        const sessions = new Map([
            ['sess_confirm_block', { conversationPhase: 'ordering' }],
        ]);
        const getSession = (id) => sessions.get(id) || {};
        const updateSession = (id, patch) => {
            const next = { ...(sessions.get(id) || {}), ...patch };
            sessions.set(id, next);
            return next;
        };

        const router = new ToolRouter({
            handlers: makeFakeHandlers(),
            getSession,
            updateSession,
        });

        const result = await router.executeToolCall({
            sessionId: 'sess_confirm_block',
            toolName: 'confirm_order',
            args: {},
        });

        // ICM redirects: confirm_order → find_nearby
        expect(result.ok).toBe(true);
        expect(result.response.intent).toBe('find_nearby');
        expect(result.trace.some(t => t.includes('icm_required_state:fail'))).toBe(true);
        expect(result.trace.some(t => t.includes('icm_fallback_intent:find_nearby'))).toBe(true);
    });

    it('get_cart_state returns cart snapshot without dispatching to handler', async () => {
        const sessions = new Map([
            ['sess_cart_state', {
                cart: { items: [{ name: 'Kebab', qty: 1 }], total: 18 },
            }],
        ]);
        const getSession = (id) => sessions.get(id) || {};
        const updateSession = (id, patch) => {
            const next = { ...(sessions.get(id) || {}), ...patch };
            sessions.set(id, next);
            return next;
        };

        const router = new ToolRouter({
            handlers: makeFakeHandlers(),
            getSession,
            updateSession,
        });

        const result = await router.executeToolCall({
            sessionId: 'sess_cart_state',
            toolName: 'get_cart_state',
            args: {},
        });

        expect(result.ok).toBe(true);
        expect(result.response.intent).toBe('get_cart_state');
        expect(result.response.cart.items).toHaveLength(1);
    });

    it('executes create_order tool and preserves contract', async () => {
        const sessions = new Map([
            ['sess_live_test_order', {
                conversationPhase: 'ordering',
                currentRestaurant: { id: 'r1', name: 'Rest 1' },
                orderMode: 'restaurant_selected',
            }],
        ]);

        const getSession = (id) => sessions.get(id) || {};
        const updateSession = (id, patch) => {
            const prev = sessions.get(id) || {};
            const next = { ...prev, ...patch };
            sessions.set(id, next);
            return next;
        };

        const router = new ToolRouter({
            handlers: makeFakeHandlers(),
            getSession,
            updateSession,
        });

        const result = await router.executeToolCall({
            sessionId: 'sess_live_test_order',
            toolName: 'add_item_to_cart',
            args: { dish: 'Pierogi', quantity: 2 },
            requestId: 'req-1',
        });

        expect(result.ok).toBe(true);
        expect(result.response.ok).toBe(true);
        expect(result.response.intent).toBe('create_order');
        expect(result.response.reply).toContain('Dodano');
        expect(result.response.meta.liveTool.toolName).toBe('add_item_to_cart');
        expect(Array.isArray(result.response.actions)).toBe(true);
        expect(Array.isArray(result.trace)).toBe(true);
    });
});

