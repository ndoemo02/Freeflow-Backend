/**
 * Targeted test: restaurant switch conflict message uses deterministic source name.
 *
 * Verifies:
 *  1. Source name from cart item metadata (cart.items[0].restaurant_name)
 *  2. Fallback to session.currentRestaurant.name when cart items lack metadata
 *  3. Final fallback to 'innej restauracji' when neither is available
 *  4. Target name always comes from selected restaurant object
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../session/sessionStore.js', () => ({
    getSession: vi.fn().mockResolvedValue({}),
    updateSession: vi.fn().mockResolvedValue({}),
}));
vi.mock('../helpers.js', () => ({
    fuzzyMatch: vi.fn().mockReturnValue(false),
}));

const { SelectRestaurantHandler } = await import('../domains/food/selectHandler.js');

function makeCtx({ cartItems = [], cartRestaurantId = null, currentRestaurant = null, forceSwitch = false } = {}) {
    return {
        text: 'testowe',
        entities: { forceSwitch },
        body: {
            meta: {
                state: {
                    cart: {
                        items: cartItems,
                        restaurantId: cartRestaurantId,
                        total: 0,
                    },
                },
            },
        },
        session: { currentRestaurant },
    };
}

const TARGET = { id: 'REST_B', name: 'Burger Palace', city: 'Gliwice' };

describe('_checkCartConflict — source restaurant name resolution', () => {
    const handler = new SelectRestaurantHandler();

    it('uses cart item restaurant_name as source (primary)', () => {
        const ctx = makeCtx({
            cartItems: [{ id: 'i1', name: 'Kebab', restaurant_name: 'Kebab King', restaurant_id: 'REST_A' }],
            cartRestaurantId: 'REST_A',
            currentRestaurant: { id: 'REST_A', name: 'Should NOT appear' },
        });

        const result = handler._checkCartConflict(ctx.session, TARGET, ctx);

        expect(result).not.toBeNull();
        expect(result.reply).toContain('Kebab King');
        expect(result.reply).not.toContain('Should NOT appear');
        expect(result.reply).toContain(TARGET.name);
    });

    it('falls back to session.currentRestaurant.name when cart items lack restaurant_name', () => {
        const ctx = makeCtx({
            cartItems: [{ id: 'i1', name: 'Pizza', restaurant_id: 'REST_A' }], // no restaurant_name
            cartRestaurantId: 'REST_A',
            currentRestaurant: { id: 'REST_A', name: 'Pizzeria Roma' },
        });

        const result = handler._checkCartConflict(ctx.session, TARGET, ctx);

        expect(result).not.toBeNull();
        expect(result.reply).toContain('Pizzeria Roma');
        expect(result.reply).toContain(TARGET.name);
    });

    it('final fallback to "innej restauracji" when no name available', () => {
        const ctx = makeCtx({
            cartItems: [{ id: 'i1', name: 'Taco' }], // no restaurant_name, no restaurant_id
            cartRestaurantId: 'REST_A',
            currentRestaurant: null,
        });

        const result = handler._checkCartConflict(ctx.session, TARGET, ctx);

        expect(result).not.toBeNull();
        expect(result.reply).toContain('innej restauracji');
        expect(result.reply).toContain(TARGET.name);
    });

    it('message matches full expected template', () => {
        const ctx = makeCtx({
            cartItems: [{ id: 'i1', name: 'Burger', restaurant_name: 'Old Burger Bar', restaurant_id: 'REST_A' }],
            cartRestaurantId: 'REST_A',
            currentRestaurant: { id: 'REST_A', name: 'Ignored' },
        });

        const result = handler._checkCartConflict(ctx.session, TARGET, ctx);

        expect(result.reply).toBe(
            `Masz już pozycje z Old Burger Bar. Czy wyczyścić koszyk i przejść do ${TARGET.name}?`
        );
        expect(result.meta.source).toBe('restaurant_switch_conflict');
        expect(result.contextUpdates.expectedContext).toBe('confirm_restaurant_switch');
    });

    it('returns null when forceSwitch=true (no conflict raised)', () => {
        const ctx = makeCtx({
            cartItems: [{ id: 'i1', name: 'Sushi', restaurant_name: 'Sushi Bar', restaurant_id: 'REST_A' }],
            cartRestaurantId: 'REST_A',
            forceSwitch: true,
        });

        const result = handler._checkCartConflict(ctx.session, TARGET, ctx);
        expect(result).toBeNull();
    });

    it('returns null when cart is empty', () => {
        const ctx = makeCtx({ cartItems: [], cartRestaurantId: null });
        const result = handler._checkCartConflict(ctx.session, TARGET, ctx);
        expect(result).toBeNull();
    });
});
