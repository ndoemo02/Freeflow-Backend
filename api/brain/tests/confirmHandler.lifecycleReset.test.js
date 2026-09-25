
import { describe, it, expect } from 'vitest';
import { ConfirmOrderHandler } from '../domains/food/confirmHandler.js';
import { getSession } from '../session/sessionStore.js';

describe('ConfirmOrderHandler — cart stays editable until manual submission', () => {
    it('commits items to the cart but keeps session, restaurant and menu context', async () => {
        const handler = new ConfirmOrderHandler();
        const sessionId = `sess_test_confirm_keep_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const restaurant = { id: 'rest_1', name: 'Restauracja Testowa' };

        const session = {
            pendingOrder: {
                restaurant_id: 'rest_1',
                restaurant: 'Restauracja Testowa',
                items: [
                    { id: 'dish_1', name: 'Pierogi', price_pln: 13, quantity: 2 },
                ],
            },
            cart: { items: [], total: 0 },
            restaurantContext: restaurant,
            currentRestaurant: restaurant,
            lastRestaurant: restaurant,
            lastMenuItems: [{ id: 'dish_1', name: 'Pierogi' }],
            lastMenu: [{ id: 'dish_1', name: 'Pierogi' }],
            orderMode: 'building',
            conversationPhase: 'ordering',
        };

        const result = await handler.execute({ session, sessionId });

        expect(result.intent).toBe('confirm_order');
        expect(result.conversationClosed).toBe(false);
        expect(result).not.toHaveProperty('newSessionId');
        expect(result).not.toHaveProperty('closedReason');
        expect(result.actions).toEqual([{ type: 'SHOW_CART', payload: { mode: 'summary' } }]);
        expect(result.meta.cart.items).toHaveLength(1);
        expect(result.meta.cartReview).toMatchObject({
            restaurantId: 'rest_1',
            restaurantName: 'Restauracja Testowa',
            itemCount: 1,
            total: 26,
        });
        expect(result.contextUpdates).not.toHaveProperty('currentRestaurant');
        expect(result.contextUpdates).not.toHaveProperty('conversationPhase');

        expect(session.cart.items).toHaveLength(1);
        expect(session.currentRestaurant).toEqual(restaurant);
        expect(session.lastRestaurant).toEqual(restaurant);
        expect(session.lastMenu).toHaveLength(1);

        expect(getSession(sessionId)?.status).not.toBe('closed');
    });
});
