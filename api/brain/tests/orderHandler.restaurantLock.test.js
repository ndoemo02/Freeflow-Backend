import { describe, expect, it } from 'vitest';
import { OrderHandler } from '../domains/food/orderHandler.js';

describe('OrderHandler restaurant cart lock', () => {
    it('returns soft switch confirmation when cart belongs to different restaurant', async () => {
        const handler = new OrderHandler();

        const session = {
            currentRestaurant: { id: 'r2', name: 'Nowa Restauracja', city: 'Piekary' },
            lastRestaurant: { id: 'r2', name: 'Nowa Restauracja', city: 'Piekary' },
            last_menu: [
                {
                    id: 'dish-r2-1',
                    name: 'Pizza Margherita',
                    base_name: 'Pizza Margherita',
                    category: 'pizza',
                    price_pln: 34,
                    restaurant_id: 'r2',
                    type: 'MAIN',
                },
            ],
            cart: {
                items: [
                    {
                        id: 'dish-r1-1',
                        name: 'Burger Klasyczny',
                        qty: 1,
                        price_pln: 29,
                        restaurant_id: 'r1',
                        restaurant_name: 'Stara Restauracja',
                    },
                ],
                total: 29,
                restaurantId: 'r1',
            },
        };

        const result = await handler.execute({
            intent: 'create_order',
            entities: { dish: 'pizza margherita', quantity: 1 },
            body: { text: 'zamawiam pizza margherita' },
            session,
            meta: {},
            nluResult: {},
        });

        expect(result?.contextUpdates?.expectedContext).toBe('confirm_restaurant_switch');
        expect(result?.contextUpdates?.pendingRestaurantSwitch?.id).toBe('r2');
        expect(result?.meta?.source).toBe('restaurant_switch_conflict_from_order');
        expect(String(result?.reply || '').toLowerCase()).toContain('wyczy');
        expect(session.cart.restaurantId).toBe('r1');
        expect(session.cart.items.length).toBe(1);
    });
});
