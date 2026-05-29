import { describe, expect, it } from 'vitest';
import { ConfirmAddToCartHandler } from '../domains/food/confirmAddToCartHandler.js';

describe('ConfirmAddToCartHandler focus metadata', () => {
    it('emits focusedMenuItemId from the pending order item id when confirming add to cart', async () => {
        const session = {
            pendingOrder: {
                restaurant: 'Test Bistro',
                restaurant_id: 'rest-1',
                items: [
                    {
                        id: 'menu-1',
                        name: 'Pierogi',
                        price_pln: 13,
                        quantity: 1,
                    },
                ],
            },
            cart: { items: [], total: 0 },
        };

        const result = await new ConfirmAddToCartHandler().execute({
            session,
            entities: {},
            sessionId: 'sess-focus-confirm',
        });

        expect(result.meta?.focusedMenuItemId).toBe('menu-1');
    });
});
