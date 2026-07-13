import { describe, expect, it } from 'vitest';
import {
    normalizeGroundedMenuQuery,
    resolveUniqueGroundedMenuItem,
    searchGroundedMenuItems,
} from '../grounding/menuGrounding.js';

const menu = [
    { id: 'beef-spicy', name: 'Wołowina pikantna', category: 'Wołowina', available: true },
    { id: 'beef-five', name: 'Wołowina 5 smaków', category: 'Wołowina', available: true },
    { id: 'pasta-spinach', name: 'Tagliatelle ze szpinakiem', category: 'Makaron', available: true },
    { id: 'cola', name: 'Coca-Cola', category: 'Napoje', available: true },
    { id: 'water', name: 'Woda mineralna', category: 'Napoje', available: true },
];

describe('menu grounding', () => {
    it('normalizes Polish inflection and the na ostro synonym', () => {
        expect(normalizeGroundedMenuQuery(
            'Chciałbym zamówić wołowinę na ostro z Vien-Thien',
            { restaurantName: 'Vien-Thien' },
        )).toBe('wolowina pikant');
    });

    it('resolves a unique spicy beef item without guessing another beef dish', () => {
        const result = resolveUniqueGroundedMenuItem(
            menu,
            'Chciałbym zamówić wołowinę na ostro z Vien-Thien',
            { restaurantName: 'Vien-Thien' },
        );
        expect(result.item?.id).toBe('beef-spicy');
        expect(result.score).toBe(100);
    });

    it('uses category metadata for drinks', () => {
        const names = searchGroundedMenuItems(menu, 'coś do picia').map((entry) => entry.item.name);
        expect(names).toContain('Coca-Cola');
        expect(names).toContain('Woda mineralna');
    });

    it('uses category plus item name for spinach pasta', () => {
        const result = searchGroundedMenuItems(menu, 'makaron ze szpinakiem');
        expect(result[0]?.item?.id).toBe('pasta-spinach');
    });

    it('returns no match for a dish absent from the menu', () => {
        expect(searchGroundedMenuItems(menu, 'lasagne')).toEqual([]);
    });
});
