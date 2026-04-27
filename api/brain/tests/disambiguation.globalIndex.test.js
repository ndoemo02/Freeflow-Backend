import { beforeEach, describe, expect, it, vi } from 'vitest';

const MENU_ROWS = [
    { id: 'sk-1', restaurant_id: 'sk1', name: 'Nalesniki z nutella', base_name: 'Nalesniki z nutella', category: 'Nalesniki', price_pln: 22 },
    { id: 'sk-2', restaurant_id: 'sk1', name: 'Sos czosnkowy', base_name: 'Sos czosnkowy', category: 'Dodatki', price_pln: 4 },
    { id: 'sk-3', restaurant_id: 'sk1', name: 'Sos pikantny', base_name: 'Sos pikantny', category: 'Dodatki', price_pln: 4 },
    { id: 'dh-1', restaurant_id: 'dh1', name: 'Rosol domowy', base_name: 'Rosol domowy', category: 'Zupy', price_pln: 18 },
    { id: 'dh-2', restaurant_id: 'dh1', name: 'Sos ostry', base_name: 'Sos ostry', category: 'Dodatki', price_pln: 3 },
];

const RESTAURANTS = [
    { id: 'sk1', name: 'Stara Kamienica' },
    { id: 'dh1', name: 'Dwor Hubertus' },
];

vi.mock('../../_supabase.js', () => ({
    supabase: {
        from: vi.fn((table) => ({
            select: vi.fn(() => {
                if (table === 'menu_items_v2') {
                    return Promise.resolve({ data: MENU_ROWS, error: null });
                }
                if (table === 'restaurants') {
                    return Promise.resolve({ data: RESTAURANTS, error: null });
                }
                return Promise.resolve({ data: [], error: null });
            }),
        })),
    },
}));

import { resolveMenuItemConflict, DISAMBIGUATION_RESULT } from '../services/DisambiguationService.js';
import { resetGlobalMenuIndexCache } from '../nlu/globalMenuIndex.js';

describe('DisambiguationService globalMenuIndex flow', () => {
    beforeEach(() => {
        resetGlobalMenuIndexCache();
    });

    it('uses global index when restaurant is unknown and returns best match', async () => {
        const result = await resolveMenuItemConflict('nalesniki nutella', {});

        expect(result.status).toBe(DISAMBIGUATION_RESULT.ADD_ITEM);
        expect(result.item?.restaurant_id).toBe('sk1');
        expect(result.restaurant?.id).toBe('sk1');
    });

    it('keeps scoped search when restaurant is known (no cross-restaurant fallback)', async () => {
        const result = await resolveMenuItemConflict('rosol domowy', {
            restaurant_id: 'sk1',
            hardLock: false,
        });

        expect(result.status).toBe(DISAMBIGUATION_RESULT.ITEM_NOT_FOUND);
    });

    it('returns item clarify options when confidence is low', async () => {
        const result = await resolveMenuItemConflict('sos czerwony', {});

        expect(result.status).toBe(DISAMBIGUATION_RESULT.DISAMBIGUATION_REQUIRED);
        expect(result.clarifyType).toBe('item');
        expect(Array.isArray(result.options)).toBe(true);
        expect(result.options.length).toBeGreaterThan(0);
    });
});

