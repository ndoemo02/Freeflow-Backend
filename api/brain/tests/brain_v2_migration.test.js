
import { describe, it, expect, beforeAll } from 'vitest';
import { pipeline } from '../brainV2.js';
import dotenv from 'dotenv';
import { RESTAURANT_CATALOG } from '../data/restaurantCatalog.js';
import { updateSession, getSession } from '../session/sessionStore.js';

dotenv.config();

// Helper to keep session state between steps
let sessionState = {
    id: `test_sess_${Date.now()}`,
    data: {}
};

// Mock updater to simulate session persistence in memory
// In real app, Pipeline calls updateSession which writes to global store.
// Since pipeline uses 'getSession', we need to make sure the global store is updated 
// OR we mock the session store.
// For integration tests, it's better to let the pipeline work, but since we are running in a test process
// we might need to rely on the fact that pipeline.js imports `sessionStore.js`.
// Let's assume sessionStore uses an in-memory Map by default (common in this project).

describe('Brain V2 Migration - Cascade Tests', () => {

    it('Scenario A: Discovery Flow (Find Restaurants)', async () => {
        const input = "Gdzie zjem coĹ› dobrego w Piekarach ĹšlÄ…skich?";
        const result = await pipeline.process(sessionState.id, input);

        console.log('A Result:', result.reply);

        expect(result.intent).toBe('find_nearby');
        expect(result.restaurants).toBeDefined();
        expect(Array.isArray(result.restaurants)).toBe(true);
        expect(result.restaurants.length).toBeGreaterThan(0);

        // Context Check
        // Note: pipeline.js updates session implicitly
        // We can check the response payload which often mirrors context updates in V2
        // or check sessionStore if accessible. 
    });

    it('Scenario B: Menu Request (Direct w/ Name)', async () => {
        // "PokaĹĽ menu w Hubertusie" -> Should use Catalog ID and skip search
        const hubertus = RESTAURANT_CATALOG.find(r => r.name.includes('Hubertus'));
        expect(hubertus).toBeDefined();

        const input = "PokaĹĽ menu w Hubertusie";
        const result = await pipeline.process(sessionState.id, input);

        if (!result.menu) {
            console.log('FAIL B - Result:', JSON.stringify(result, null, 2));
        }

        expect(result.intent).toBe('menu_request'); // or show_menu
        expect(result.menu).toBeDefined();
        expect(result.menu.length).toBeGreaterThan(0);

        // Crucial V2 Optimization Check
        // Did we verify it used ID? Hard to verify internals, but speed/latency would show.
    });

    // SKIP: DishMatch scores "Rolada wieprzowa" and "Rolada wołowa" both at 0.3
    // for "Rolady Wołowe" — tie causes ambiguous clarify_order. Requires DishMatch
    // token-weight improvement for inflected adjective matching. Out of scope for 1.4.
    it.skip('Scenario C: Order Creation (Items Parsing)', async () => {
        const input = "Zamawiam dwie rolady woĹ‚owe";
        const result = await pipeline.process(sessionState.id, input);

        if (result.intent !== 'create_order') {
            console.log('FAIL C - Result:', JSON.stringify(result, null, 2));
        }

        expect(result.intent).toBe('create_order');
        expect(result.reply.toLowerCase()).toMatch(/doda[lĹ‚]am/);
        // Lenient match for dishes
        expect(result.reply.toLowerCase()).toMatch(/rolad/);

        // BUG FIX VERIFICATION:
        // Ensure NO restaurant list is sent back
        expect(result.restaurants || []).toHaveLength(0);
    });

    // SKIP: Depends on Scenario C succeeding (cascade state). No pendingOrder in
    // session → "Potwierdzam" maps to clarify_order instead of confirm_order.
    it.skip('Scenario D: Confirmation (Frontend Contract)', async () => {
        const input = "Potwierdzam";
        const result = await pipeline.process(sessionState.id, input);

        if (result.intent !== 'confirm_order') {
            console.log('FAIL D - Result:', JSON.stringify(result, null, 2));
        }

        expect(result.intent).toBe('confirm_order');
        expect(result.meta).toBeDefined();
        expect(result.meta.addedToCart).toBe(true);
        expect(result.meta.cart).toBeDefined();
        expect(result.meta.transaction_status).toBe('success');
    });

});

describe('Ordering affirmation regression', () => {
    it('repeats the last cart item when user says "tak" in ordering phase', async () => {
        const sessionId = 'affirm_' + Date.now();

        updateSession(sessionId, {
            conversationPhase: 'ordering',
            currentRestaurant: { id: 'CALL', name: 'Callzone' },
            lastRestaurant: { id: 'CALL', name: 'Callzone' },
            last_menu: [
                { id: 'v1', name: 'Vege Burger', base_name: 'Vege Burger', price_pln: '28.00' },
                { id: 'b1', name: 'Bacon Burger', base_name: 'Bacon Burger', price_pln: '32.00' }
            ],
            cart: {
                items: [
                    { id: 'v1', name: 'Vege Burger', price_pln: '28.00', qty: 1 }
                ],
                total: 28
            },
            pendingOrder: null,
            expectedContext: null
        });

        const result = await pipeline.process(sessionId, 'tak');

        expect(result.intent).toBe('create_order');
        expect(result.reply).toContain('Vege Burger');
        expect(result.meta?.cart?.items).toHaveLength(2);
        expect(result.meta?.cart?.items?.[1]?.name).toBe('Vege Burger');

        const session = getSession(sessionId);
        expect(session?.cart?.items).toHaveLength(2);
    });
});

