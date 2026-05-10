import { describe, it, expect, vi, beforeEach } from 'vitest';

const { resolveMenuItemConflictMock } = vi.hoisted(() => ({
    resolveMenuItemConflictMock: vi.fn(async () => ({ status: 'ITEM_NOT_FOUND' })),
}));

vi.mock('../services/DisambiguationService.js', () => ({
    DISAMBIGUATION_RESULT: {
        ITEM_NOT_FOUND: 'ITEM_NOT_FOUND',
        ADD_ITEM: 'ADD_ITEM',
        DISAMBIGUATION_REQUIRED: 'DISAMBIGUATION_REQUIRED',
    },
    resolveMenuItemConflict: resolveMenuItemConflictMock,
}));

import { OrderHandler } from '../domains/food/orderHandler.js';

const MENU_WITH_HALLOWEEN_VARIANTS = [
    {
        id: 'halloween-double',
        name: 'Halloween Double',
        base_name: 'Halloween Double',
        category: 'Burgery',
        type: 'MAIN',
        price_pln: 49,
    },
    {
        id: 'halloween-standard',
        name: 'Halloween Standard',
        base_name: 'Halloween Standard',
        category: 'Burgery',
        type: 'MAIN',
        price_pln: 39,
    },
    {
        id: 'classic-burger',
        name: 'Classic Burger',
        base_name: 'Classic Burger',
        category: 'Burgery',
        type: 'MAIN',
        price_pln: 29,
    },
];

const MENU_WITH_SINGLE_VARIANT = [
    {
        id: 'halloween-double',
        name: 'Halloween Double',
        base_name: 'Halloween Double',
        category: 'Burgery',
        type: 'MAIN',
        price_pln: 49,
    },
    {
        id: 'classic-burger',
        name: 'Classic Burger',
        base_name: 'Classic Burger',
        category: 'Burgery',
        type: 'MAIN',
        price_pln: 29,
    },
];

const MENU_STARA_KAMIENICA = [
    {
        id: 'nalesniki-nutella',
        name: 'Nalesnik z nutella bananami bita smietana',
        base_name: 'Nalesnik z nutella',
        category: 'Dania glowne',
        type: 'MAIN',
        price_pln: 29,
    },
    {
        id: 'gulasz-wegierski',
        name: 'Gulasz po wegiersku',
        base_name: 'Gulasz po wegiersku',
        category: 'Dania glowne',
        type: 'MAIN',
        price_pln: 32,
    },
    {
        id: 'zupa-dnia',
        name: 'Zupa dnia',
        base_name: 'Zupa dnia',
        category: 'Zupy',
        type: 'MAIN',
        price_pln: 16,
    },
];

function makeSession(overrides = {}) {
    return {
        currentRestaurant: { id: 'R1', name: 'Klaps Burgers' },
        lastRestaurant: { id: 'R1', name: 'Klaps Burgers' },
        last_menu: MENU_WITH_HALLOWEEN_VARIANTS,
        cart: { items: [], total: 0 },
        ...overrides,
    };
}

describe('OrderHandler variant mismatch guard', () => {
    let handler;

    beforeEach(() => {
        handler = new OrderHandler();
        resolveMenuItemConflictMock.mockClear();
    });

    // --- Positive cases: guard should trigger ---

    it('VM1: clarifies when user requests a variant that does not exist (Halloween Standard → Halloween Double only)', async () => {
        const session = makeSession({ last_menu: MENU_WITH_SINGLE_VARIANT });
        const ctx = {
            text: 'dodaj Halloween Standard',
            session,
            entities: { dish: 'Halloween Standard', quantity: 1 },
            body: { text: 'dodaj Halloween Standard' },
        };

        const result = await handler.execute(ctx);

        expect(result.meta?.clarify?.status).toBe('AMBIGUOUS');
        expect(result.meta?.clarify?.clarifyType).toBe('item');
        const options = result.meta?.clarify?.options || [];
        expect(options.length).toBeGreaterThanOrEqual(1);
        expect(options.some(o => o.name === 'Halloween Double')).toBe(true);
    });

    it('VM2: clarifies when multiple variants exist and user picks non-existent one', async () => {
        const session = makeSession({ last_menu: MENU_WITH_HALLOWEEN_VARIANTS });
        const ctx = {
            text: 'dodaj Halloween Supreme',
            session,
            entities: { dish: 'Halloween Supreme', quantity: 1 },
            body: { text: 'dodaj Halloween Supreme' },
        };

        const result = await handler.execute(ctx);

        const options = result.meta?.clarify?.options || [];
        expect(options.length).toBeGreaterThanOrEqual(2);
        const names = options.map(o => o.name);
        expect(names).toContain('Halloween Double');
        expect(names).toContain('Halloween Standard');
    });

    it('VM3: clarifies when user says "Standard" but only "Double" exists', async () => {
        const session = makeSession({ last_menu: MENU_WITH_SINGLE_VARIANT });
        const ctx = {
            text: 'Standard',
            session,
            entities: { dish: 'Standard', quantity: 1 },
            body: { text: 'Standard' },
        };

        const result = await handler.execute(ctx);

        // Should clarify rather than silently pick Double
        expect(result.meta?.addedToCart || false).toBe(false);
    });

    // --- Negative cases: guard should NOT trigger ---

    it('VM4: adds item when exact match exists (Halloween Double → Halloween Double)', async () => {
        const session = makeSession({ last_menu: MENU_WITH_HALLOWEEN_VARIANTS });
        const ctx = {
            text: 'dodaj Halloween Double',
            session,
            entities: { dish: 'Halloween Double', quantity: 1 },
            body: { text: 'dodaj Halloween Double' },
        };

        const result = await handler.execute(ctx);

        expect(result.meta?.addedToCart).toBe(true);
        expect(result.reply).toContain('Halloween Double');
    });

    it('VM5: generic request without variant should NOT trigger variant mismatch', async () => {
        const session = makeSession({ last_menu: MENU_WITH_HALLOWEEN_VARIANTS });
        const ctx = {
            text: 'dodaj Halloween',
            session,
            entities: { dish: 'Halloween', quantity: 1 },
            body: { text: 'dodaj Halloween' },
        };

        const result = await handler.execute(ctx);

        // "Halloween" is generic — may legitimately trigger shared_base_ambiguity
        // (multiple items share "Halloween" prefix), but must NOT be a variant mismatch.
        // Variant mismatch requires user to explicitly specify a variant word.
        const clarifyReason = result.meta?.clarify?.clarifyReason;
        expect(clarifyReason).not.toBe('variant_mismatch');
    });

    it('VM6: adds item with diacritic-tolerant match (nutella vs nutellą)', async () => {
        const session = makeSession({
            currentRestaurant: { id: 'STARA', name: 'Restauracja Stara Kamienica' },
            lastRestaurant: { id: 'STARA', name: 'Restauracja Stara Kamienica' },
            last_menu: MENU_STARA_KAMIENICA,
        });
        const ctx = {
            text: 'nalesniki z nutella',
            session,
            entities: { dish: 'nalesniki z nutella', quantity: 1 },
            body: { text: 'nalesniki z nutella' },
        };

        const result = await handler.execute(ctx);

        expect(result.meta?.addedToCart).toBe(true);
    });

    it('VM7: adds item when canonical form adds extra words (gulasz po wegiersku)', async () => {
        const session = makeSession({
            currentRestaurant: { id: 'STARA', name: 'Restauracja Stara Kamienica' },
            lastRestaurant: { id: 'STARA', name: 'Restauracja Stara Kamienica' },
            last_menu: MENU_STARA_KAMIENICA,
        });
        const ctx = {
            text: 'gulasz po wegiersku',
            session,
            entities: { dish: 'gulasz po wegiersku', quantity: 1 },
            body: { text: 'gulasz po wegiersku' },
        };

        const result = await handler.execute(ctx);

        expect(result.meta?.addedToCart).toBe(true);
    });
});
