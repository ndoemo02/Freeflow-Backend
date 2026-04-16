/**
 * P0 Regression: Explicit Restaurant Lock in Order Flow
 *
 * When an utterance/tool-call includes BOTH item + restaurant, the system must
 * never substitute an item from a different restaurant.
 *
 * Test matrix:
 *   A. item + known restaurant (entity cache hit) → item looked up in that restaurant
 *   B. item + known restaurant (entity ID in entities) → scoped to that restaurant
 *   C. item + restaurant not in DB → clarify / not found (no global fallback)
 *   D. item + restaurant but item not in that restaurant → ITEM_NOT_FOUND (no cross-restaurant)
 *   E. no restaurant in entities → existing global search behaviour unchanged
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrderHandler } from '../domains/food/orderHandler.js';
import { resolveMenuItemConflict, DISAMBIGUATION_RESULT } from '../services/DisambiguationService.js';

// ── Supabase mock ────────────────────────────────────────────────────────────
// Menu items: naleśniki only in Stara Kamienica (sk1), rosół only in Dwór Hubertus (dh1)
const MOCK_MENU_ITEMS = [
    { id: 'i-sk-1', name: 'Naleśniki z nutellą', base_name: 'Nalesniki z nutella', price_pln: 22, restaurant_id: 'sk1' },
    { id: 'i-dh-1', name: 'Rosół domowy',         base_name: 'Rosol domowy',         price_pln: 18, restaurant_id: 'dh1' },
    { id: 'i-cz-1', name: 'Pizza Callzone',        base_name: 'Pizza Callzone',        price_pln: 35, restaurant_id: 'cz1' },
];
const MOCK_RESTAURANTS = [
    { id: 'sk1', name: 'Restauracja Stara Kamienica' },
    { id: 'dh1', name: 'Dwór Hubertus' },
    { id: 'cz1', name: 'Callzone' },
];

vi.mock('../../_supabase.js', () => {
    const makeSelect = (table) => ({
        select: vi.fn((_cols) => {
            const base = {
                ilike: vi.fn((_col, pattern) => {
                    // Used by resolveRestaurantByName DB fallback
                    const search = pattern.replace(/%/g, '').toLowerCase();
                    const filtered = MOCK_RESTAURANTS.filter(r =>
                        r.name.toLowerCase().includes(search)
                    );
                    return Promise.resolve({ data: filtered, error: null });
                }),
                in: vi.fn((_col, ids) => {
                    const filtered = MOCK_RESTAURANTS.filter(r => ids.includes(r.id));
                    return Promise.resolve({ data: filtered, error: null });
                }),
                limit: vi.fn(function (n) {
                    // chain: select(...).ilike(...).limit(n) used by resolveRestaurantByName
                    return this;
                }),
            };
            if (table === 'menu_items_v2') {
                return Promise.resolve({ data: MOCK_MENU_ITEMS, error: null });
            }
            return base;
        }),
    });

    return {
        supabase: {
            from: vi.fn((table) => makeSelect(table)),
        },
    };
});

// ── DisambiguationService unit tests ────────────────────────────────────────

describe('DisambiguationService — hardLock', () => {
    it('D. item not in scoped restaurant → ITEM_NOT_FOUND (no global fallback)', async () => {
        // naleśniki are only in sk1 — asking with hardLock + dh1 should return NOT_FOUND
        const result = await resolveMenuItemConflict('nalesniki z nutella', {
            restaurant_id: 'dh1',
            hardLock: true,
            session: {},
        });
        expect(result.status).toBe(DISAMBIGUATION_RESULT.ITEM_NOT_FOUND);
    });

    it('without hardLock global fallback still works (unchanged behaviour)', async () => {
        // rosół not in sk1, but hardLock=false → falls back to global → finds it in dh1
        const result = await resolveMenuItemConflict('rosol domowy', {
            restaurant_id: 'sk1',
            hardLock: false,
            session: {},
        });
        // May be ADD_ITEM (found globally) — what matters is it is NOT blocked
        expect([DISAMBIGUATION_RESULT.ADD_ITEM, DISAMBIGUATION_RESULT.DISAMBIGUATION_REQUIRED])
            .toContain(result.status);
    });
});

// ── OrderHandler integration tests ──────────────────────────────────────────

function makeHandler() {
    return new OrderHandler();
}

function makeCtx({ dish, restaurantName = null, restaurantId = null, entityCache = null, text = null }) {
    return {
        intent: 'create_order',
        entities: {
            dish,
            quantity: 1,
            restaurant: restaurantName,
            restaurantId: restaurantId,
        },
        body: { text: text || dish },
        session: {
            currentRestaurant: null,
            lastRestaurant: null,
            last_menu: [],
            cart: { items: [], total: 0 },
            entityCache: entityCache ? { restaurants: entityCache } : undefined,
        },
        meta: {},
        nluResult: {},
    };
}

describe('OrderHandler — explicit restaurant lock (P0)', () => {

    it('A. entity cache hit — injects restaurant context before item search', async () => {
        const handler = makeHandler();
        const ctx = makeCtx({
            dish: 'nalesniki z nutella',
            restaurantName: 'Stara Kamienica',
            entityCache: [{ id: 'sk1', name: 'Restauracja Stara Kamienica' }],
        });

        // After execute, currentRestaurant should be injected
        await handler.execute(ctx);
        // The session should have been injected (local to this request)
        expect(ctx.session.currentRestaurant?.id).toBe('sk1');
    });

    it('B. restaurantId in entities — used directly, no DB lookup needed', async () => {
        const handler = makeHandler();
        const ctx = makeCtx({
            dish: 'nalesniki z nutella',
            restaurantId: 'sk1',
            restaurantName: 'Restauracja Stara Kamienica',
        });

        await handler.execute(ctx);
        expect(ctx.session.currentRestaurant?.id).toBe('sk1');
    });

    it('D. item not in explicit restaurant → clarify / not found (no cross-restaurant add)', async () => {
        const handler = makeHandler();
        // naleśniki only in sk1; asking for them with restaurantId=dh1 (Dwór Hubertus)
        const ctx = makeCtx({
            dish: 'nalesniki z nutella',
            restaurantId: 'dh1',
            restaurantName: 'Dwór Hubertus',
        });

        const result = await handler.execute(ctx);

        // Must NOT be a successful add_to_cart for a different restaurant
        const addedToCart = Boolean(result?.meta?.addedToCart);
        const wrongRestaurantAdded =
            addedToCart &&
            result?.meta?.restaurant?.id !== 'dh1';

        expect(wrongRestaurantAdded).toBe(false);
        // Should be a clarify or not-found response
        if (addedToCart) {
            expect(result?.meta?.restaurant?.id).toBe('dh1');
        }
    });

    it('E. no restaurant in entities → global search unchanged (backward compat)', async () => {
        const handler = makeHandler();
        // No restaurant specified — session also empty → global search runs normally
        const ctx = makeCtx({ dish: 'pizza callzone' });
        // Should not throw; restaurantMentioned=false so hardLock=false
        const result = await handler.execute(ctx);
        // Any non-error result is acceptable here; just verify it ran
        expect(result).toBeDefined();
        expect(ctx.session.currentRestaurant).toBeNull(); // no injection happened
    });

    it('existing cart lock test unaffected (regression)', async () => {
        const handler = makeHandler();
        const session = {
            currentRestaurant: { id: 'r2', name: 'Nowa Restauracja' },
            lastRestaurant: { id: 'r2', name: 'Nowa Restauracja' },
            last_menu: [
                { id: 'dish-r2-1', name: 'Pizza Margherita', base_name: 'Pizza Margherita', price_pln: 34, restaurant_id: 'r2', type: 'MAIN' },
            ],
            cart: {
                items: [{ id: 'dish-r1-1', name: 'Burger Klasyczny', qty: 1, price_pln: 29, restaurant_id: 'r1', restaurant_name: 'Stara Restauracja' }],
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
    });
});

// ── P1 additions ─────────────────────────────────────────────────────────────

describe('OrderHandler — P1 restaurant unresolved early exit', () => {

    it('B. restaurant mentioned but unresolvable → clarify response, no global item fallback', async () => {
        // Mock DB to return empty for unknown restaurant
        const { supabase } = await import('../../_supabase.js');
        supabase.from.mockImplementation((table) => {
            if (table === 'restaurants') {
                return {
                    select: vi.fn(() => ({
                        ilike: vi.fn(() => ({ limit: vi.fn(() => Promise.resolve({ data: [], error: null })) })),
                        in: vi.fn(() => Promise.resolve({ data: [], error: null })),
                    })),
                };
            }
            return { select: vi.fn(() => Promise.resolve({ data: [], error: null })) };
        });

        const handler = makeHandler();
        const ctx = makeCtx({
            dish: 'nalesniki z nutella',
            restaurantName: 'Nieznana Restauracja XYZ',
        });

        const result = await handler.execute(ctx);

        // Must not add to cart
        expect(result?.meta?.addedToCart).toBeFalsy();
        // Must be an explicit-restaurant-unresolved clarify
        expect(result?.meta?.source).toBe('explicit_restaurant_unresolved');
        expect(result?.reply).toContain('Nieznana Restauracja XYZ');
        expect(result?.contextUpdates?.expectedContext).toBe('clarify_order');
    });

    it('C. resolved restaurant but item not there → ITEM_NOT_FOUND, no cross-restaurant add (regression)', async () => {
        const handler = makeHandler();
        // naleśniki only in sk1; asking with restaurantId=dh1 + hardLock
        const ctx = makeCtx({
            dish: 'nalesniki z nutella',
            restaurantId: 'dh1',
            restaurantName: 'Dwór Hubertus',
        });

        const result = await handler.execute(ctx);

        const wrongAdd = Boolean(result?.meta?.addedToCart) && result?.meta?.restaurant?.id !== 'dh1';
        expect(wrongAdd).toBe(false);
    });
});
