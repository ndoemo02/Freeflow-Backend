import { describe, it, expect, vi, beforeEach } from 'vitest';

const { resolveMenuItemConflictMock, canonicalizeDishMock } = vi.hoisted(() => ({
    resolveMenuItemConflictMock: vi.fn(async () => ({ status: 'ITEM_NOT_FOUND' })),
    canonicalizeDishMock: vi.fn((text) => text),
}));

vi.mock('../services/DisambiguationService.js', () => ({
    DISAMBIGUATION_RESULT: {
        ITEM_NOT_FOUND: 'ITEM_NOT_FOUND',
        ADD_ITEM: 'ADD_ITEM',
        DISAMBIGUATION_REQUIRED: 'DISAMBIGUATION_REQUIRED',
    },
    resolveMenuItemConflict: resolveMenuItemConflictMock,
}));

vi.mock('../nlu/dishCanon.js', () => ({
    canonicalizeDish: canonicalizeDishMock,
}));

import { OrderHandler } from '../domains/food/orderHandler.js';

describe('OrderHandler main-item resolution', () => {
    let handler;

    beforeEach(() => {
        handler = new OrderHandler();
        resolveMenuItemConflictMock.mockClear();
        canonicalizeDishMock.mockReset();
    });

    it('adds MAIN dish even when canonical dish points to addon phrase', async () => {
        canonicalizeDishMock.mockReturnValue('Gyros z frytkami i tzatziki');

        const session = {
            currentRestaurant: { id: 'R_BOWL', name: 'Test Bowl House' },
            lastRestaurant: { id: 'R_BOWL', name: 'Test Bowl House' },
            last_menu: [
                {
                    id: 'addon-tzatziki',
                    name: 'Sos Tzatziki',
                    base_name: 'Sos Tzatziki',
                    category: 'Dodatki',
                    type: 'ADDON',
                    price_pln: 4,
                },
                {
                    id: 'main-bowl-1',
                    name: 'Bowl Gyros-Halloumi',
                    base_name: 'Bowl Gyros-Halloumi',
                    category: 'Danie glowne',
                    type: 'MAIN',
                    price_pln: 32,
                },
            ],
            cart: { items: [], total: 0 },
        };

        const response = await handler.execute({
            text: 'Bowl Gyros-Halloumi',
            entities: { dish: 'Bowl Gyros-Halloumi' },
            session,
        });

        expect(response.meta?.addedToCart).toBe(true);
        expect(response.contextUpdates?.cart?.items?.length).toBe(1);
        expect(response.contextUpdates?.cart?.items?.[0]?.id).toBe('main-bowl-1');
        expect(response.contextUpdates?.cart?.items?.[0]?.id).not.toBe('addon-tzatziki');
        expect(resolveMenuItemConflictMock).not.toHaveBeenCalled();
    });

    it('returns clarify_order when only addon matches and addon was not explicitly requested', async () => {
        canonicalizeDishMock.mockReturnValue('Tzatziki');

        const session = {
            currentRestaurant: { id: 'R_BOWL', name: 'Test Bowl House' },
            lastRestaurant: { id: 'R_BOWL', name: 'Test Bowl House' },
            last_menu: [
                {
                    id: 'addon-tzatziki',
                    name: 'Sos Tzatziki',
                    base_name: 'Sos Tzatziki',
                    category: 'Dodatki',
                    type: 'ADDON',
                    price_pln: 4,
                },
                {
                    id: 'main-bowl-1',
                    name: 'Bowl Gyros-Halloumi',
                    base_name: 'Bowl Gyros-Halloumi',
                    category: 'Danie glowne',
                    type: 'MAIN',
                    price_pln: 32,
                },
            ],
            cart: { items: [], total: 0 },
        };

        const response = await handler.execute({
            text: 'tzatziki',
            entities: { dish: 'tzatziki' },
            session,
        });

        expect(response.intent).toBe('clarify_order');
        expect(response.reply).toContain('dodatek');
        expect(response.meta?.clarify?.status).toBe('AMBIGUOUS');
        expect(response.meta?.clarify?.requestedCategory).toBe('ADDON');
        expect(response.meta?.clarify?.candidates?.[0]?.id).toBe('addon-tzatziki');
        expect(response.contextUpdates?.expectedContext).toBe('clarify_order');
        expect(session.cart.items.length).toBe(0);
    });

    it('does not block addon ordering when expectedContext is order_addon', async () => {
        canonicalizeDishMock.mockReturnValue('Sos Tzatziki');

        const session = {
            expectedContext: 'order_addon',
            currentRestaurant: { id: 'R_BOWL', name: 'Test Bowl House' },
            lastRestaurant: { id: 'R_BOWL', name: 'Test Bowl House' },
            last_menu: [
                {
                    id: 'addon-tzatziki',
                    name: 'Sos Tzatziki',
                    base_name: 'Sos Tzatziki',
                    category: 'Dodatki',
                    type: 'ADDON',
                    price_pln: 4,
                },
                {
                    id: 'main-bowl-1',
                    name: 'Bowl Gyros-Halloumi',
                    base_name: 'Bowl Gyros-Halloumi',
                    category: 'Danie glowne',
                    type: 'MAIN',
                    price_pln: 32,
                },
            ],
            cart: { items: [], total: 0 },
        };

        const response = await handler.execute({
            text: 'dodaj sos tzatziki',
            entities: { dish: 'sos tzatziki' },
            session,
        });

        expect(response.intent).not.toBe('clarify_order');
        expect(response.meta?.addedToCart).toBe(true);
        expect(response.contextUpdates?.cart?.items?.[0]?.id).toBe('addon-tzatziki');
    });

    it('adds two items for multi-item candidate utterance with quantity distribution', async () => {
        canonicalizeDishMock.mockImplementation((text) => text);

        const session = {
            currentRestaurant: { id: 'R_MULTI', name: 'Cafe Test' },
            lastRestaurant: { id: 'R_MULTI', name: 'Cafe Test' },
            last_menu: [
                {
                    id: 'drink-pepsi',
                    name: 'Pepsi',
                    base_name: 'Pepsi',
                    category: 'Napoje',
                    type: 'DRINK',
                    price_pln: 8,
                },
                {
                    id: 'drink-kawa-czarna',
                    name: 'Kawa czarna',
                    base_name: 'Kawa czarna',
                    category: 'Napoje',
                    type: 'DRINK',
                    price_pln: 10,
                },
            ],
            cart: { items: [], total: 0 },
        };

        const response = await handler.execute({
            text: 'Pepsi i dwie kawy czarne',
            entities: {
                items: [
                    { dish: 'Pepsi', quantity: 1 },
                    { dish: 'Kawa czarna', quantity: 2 },
                ],
                dish: 'Pepsi',
            },
            session,
        });

        expect(response.meta?.addedToCart).toBe(true);
        expect(response.meta?.orderMode).toBe('multi_candidate');
        expect(response.contextUpdates?.cart?.items?.length).toBe(2);
        const coffee = response.contextUpdates?.cart?.items?.find((item) => item.id === 'drink-kawa-czarna');
        const pepsi = response.contextUpdates?.cart?.items?.find((item) => item.id === 'drink-pepsi');
        expect(coffee?.qty).toBe(2);
        expect(pepsi?.qty).toBe(1);
    });

    it('allows single-item compound quantity drink order without clarify', async () => {
        canonicalizeDishMock.mockImplementation((text) => text);

        const session = {
            currentRestaurant: { id: 'R_DRINK', name: 'Drink Test' },
            lastRestaurant: { id: 'R_DRINK', name: 'Drink Test' },
            last_menu: [
                {
                    id: 'drink-pepsi',
                    name: 'Pepsi',
                    base_name: 'Pepsi',
                    category: 'Napoje',
                    type: 'DRINK',
                    price_pln: 8,
                },
            ],
            cart: { items: [], total: 0 },
        };

        const response = await handler.execute({
            text: '3 Pepsi',
            entities: {
                dish: 'Pepsi',
                items: [{ dish: 'Pepsi', quantity: 3, meta: { rawLabel: 'Pepsi' } }],
                compoundSource: 'compound_parser',
                skipCategoryClarify: true,
                skipGenericTokenBlock: true,
            },
            session,
        });

        expect(response.intent).not.toBe('clarify_order');
        expect(response.meta?.addedToCart).toBe(true);
        expect(response.contextUpdates?.cart?.items?.[0]?.id).toBe('drink-pepsi');
        expect(response.contextUpdates?.cart?.items?.[0]?.qty).toBe(3);
        expect(response.contextUpdates?.expectedContext).toBe('order_continue');
    });

    it('resolves addon by preserved modifier for "2 x sos pikantny"', async () => {
        canonicalizeDishMock.mockImplementation((text) => text);

        const session = {
            currentRestaurant: { id: 'R_ADDON', name: 'Addon Test' },
            lastRestaurant: { id: 'R_ADDON', name: 'Addon Test' },
            last_menu: [
                {
                    id: 'addon-sos-tzatziki',
                    name: 'Sos Tzatziki',
                    base_name: 'Sos Tzatziki',
                    category: 'Dodatki',
                    type: 'ADDON',
                    price_pln: 3,
                },
                {
                    id: 'addon-sos-pikantny',
                    name: 'Sos Pikantny',
                    base_name: 'Sos Pikantny',
                    category: 'Dodatki',
                    type: 'ADDON',
                    price_pln: 3,
                },
            ],
            cart: { items: [], total: 0 },
        };

        const response = await handler.execute({
            text: '2 x sos pikantny',
            entities: {
                dish: 'Sos',
                items: [{ dish: 'Sos', quantity: 2, meta: { rawLabel: 'sos pikantny', modifier: 'pikantny' } }],
                compoundSource: 'compound_parser',
            },
            session,
        });

        expect(response.intent).not.toBe('clarify_order');
        expect(response.meta?.addedToCart).toBe(true);
        expect(response.contextUpdates?.cart?.items?.[0]?.id).toBe('addon-sos-pikantny');
        expect(response.contextUpdates?.cart?.items?.[0]?.qty).toBe(2);
    });

    it('maps "ostry sos" modifier to pikantny variant and avoids tzatziki fallback', async () => {
        canonicalizeDishMock.mockImplementation((text) => text);

        const session = {
            currentRestaurant: { id: 'R_ADDON', name: 'Addon Test' },
            lastRestaurant: { id: 'R_ADDON', name: 'Addon Test' },
            last_menu: [
                {
                    id: 'addon-sos-tzatziki',
                    name: 'Sos Tzatziki',
                    base_name: 'Sos Tzatziki',
                    category: 'Dodatki',
                    type: 'ADDON',
                    price_pln: 3,
                },
                {
                    id: 'addon-sos-pikantny',
                    name: 'Sos Pikantny',
                    base_name: 'Sos Pikantny',
                    category: 'Dodatki',
                    type: 'ADDON',
                    price_pln: 3,
                },
            ],
            cart: { items: [], total: 0 },
        };

        const response = await handler.execute({
            text: '2 x sos ostry',
            entities: {
                dish: 'Sos',
                items: [{ dish: 'Sos', quantity: 2, meta: { rawLabel: 'sos ostry', modifier: 'ostry' } }],
                compoundSource: 'compound_parser',
            },
            session,
        });

        expect(response.intent).not.toBe('clarify_order');
        expect(response.meta?.addedToCart).toBe(true);
        expect(response.contextUpdates?.cart?.items?.[0]?.id).toBe('addon-sos-pikantny');
        expect(response.contextUpdates?.cart?.items?.[0]?.id).not.toBe('addon-sos-tzatziki');
        expect(response.contextUpdates?.cart?.items?.[0]?.qty).toBe(2);
    });

    it('returns MAIN clarify when ambiguous main candidates are detected', async () => {
        canonicalizeDishMock.mockReturnValue('xx');

        const session = {
            currentRestaurant: { id: 'R_MAIN', name: 'Main Test' },
            lastRestaurant: { id: 'R_MAIN', name: 'Main Test' },
            last_menu: [
                {
                    id: 'main-1',
                    name: 'Baxx Burger',
                    base_name: 'Baxx Burger',
                    category: 'Danie glowne',
                    type: 'MAIN',
                    price_pln: 29,
                },
                {
                    id: 'main-2',
                    name: 'Pizxxa Klasyczna',
                    base_name: 'Pizxxa Klasyczna',
                    category: 'Danie glowne',
                    type: 'MAIN',
                    price_pln: 32,
                },
            ],
            cart: { items: [], total: 0 },
        };

        const response = await handler.execute({
            text: 'xx',
            entities: { dish: 'xx' },
            session,
        });

        expect(response.intent).toBe('clarify_order');
        expect(response.meta?.clarify?.requestedCategory).toBe('MAIN');
        expect(response.reply.toLowerCase()).toContain('danie glowne');
    });

    it('blocks generic addon token in compound-like request and returns ADDON clarify', async () => {
        canonicalizeDishMock.mockImplementation((text) => text);

        const session = {
            currentRestaurant: { id: 'R_ADDON', name: 'Addon Test' },
            lastRestaurant: { id: 'R_ADDON', name: 'Addon Test' },
            last_menu: [
                {
                    id: 'addon-sos',
                    name: 'Sos',
                    base_name: 'Sos',
                    category: 'Dodatki',
                    type: 'ADDON',
                    price_pln: 2,
                },
                {
                    id: 'addon-sos-pikantny',
                    name: 'Sos Pikantny',
                    base_name: 'Sos Pikantny',
                    category: 'Dodatki',
                    type: 'ADDON',
                    price_pln: 3,
                },
            ],
            cart: { items: [], total: 0 },
        };

        const response = await handler.execute({
            text: 'dwa razy sos',
            entities: {
                dish: 'Sos',
                items: [{ dish: 'Sos', quantity: 2 }],
            },
            session,
        });

        expect(response.intent).toBe('clarify_order');
        expect(response.meta?.clarify?.requestedCategory).toBe('ADDON');
        expect(response.contextUpdates?.expectedContext).toBe('clarify_order');
        expect(session.cart.items.length).toBe(0);
    });
});
