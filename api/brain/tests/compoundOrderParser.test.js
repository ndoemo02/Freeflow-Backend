import { describe, it, expect } from 'vitest';
import { parseCompoundOrder } from '../nlu/compoundOrderParser.js';

const MENU = [
    { id: 'drink_pepsi', name: 'Pepsi', base_name: 'Pepsi' },
    { id: 'drink_cola', name: 'Cola', base_name: 'Cola' },
    { id: 'drink_coffee_black', name: 'Kawa Czarna', base_name: 'Kawa Czarna' },
    { id: 'addon_sos', name: 'Sos', base_name: 'Sos' },
    { id: 'addon_sos_pikantny', name: 'Sos Pikantny', base_name: 'Sos Pikantny' },
    { id: 'main_burger', name: 'Burger Klasyczny', base_name: 'Burger Klasyczny' },
    { id: 'side_fries', name: 'Frytki', base_name: 'Frytki' },
];

function findDish(items, token) {
    const normalizedToken = String(token || '').toLowerCase();
    return items.find((item) => String(item?.dish || '').toLowerCase().includes(normalizedToken));
}

describe('compoundOrderParser', () => {
    it('parses "3 Pepsi" as single item qty=3', () => {
        const result = parseCompoundOrder('3 Pepsi', MENU);

        expect(result.items.length).toBe(1);
        expect(findDish(result.items, 'pepsi')?.quantity).toBe(3);
    });

    it('parses "trzy Pepsi" as single item qty=3', () => {
        const result = parseCompoundOrder('trzy Pepsi', MENU);

        expect(result.items.length).toBe(1);
        expect(findDish(result.items, 'pepsi')?.quantity).toBe(3);
    });

    it('parses "dwie czarne kawy i Pepsi"', () => {
        const result = parseCompoundOrder('dwie czarne kawy i Pepsi', MENU);

        expect(result.items.length).toBe(2);
        expect(findDish(result.items, 'kawa')?.quantity).toBe(2);
        expect(findDish(result.items, 'pepsi')?.quantity).toBe(1);
    });

    it('parses "Pepsi i dwie czarne kawy"', () => {
        const result = parseCompoundOrder('Pepsi i dwie czarne kawy', MENU);

        expect(result.items.length).toBe(2);
        expect(findDish(result.items, 'pepsi')?.quantity).toBe(1);
        expect(findDish(result.items, 'kawa')?.quantity).toBe(2);
    });

    it('parses "dwie Pepsi i czarna kawa"', () => {
        const result = parseCompoundOrder('dwie Pepsi i czarna kawa', MENU);

        expect(result.items.length).toBe(2);
        expect(findDish(result.items, 'pepsi')?.quantity).toBe(2);
        expect(findDish(result.items, 'kawa')?.quantity).toBe(1);
    });

    it('collapses "Pepsi Pepsi Pepsi" into one item with quantity=3', () => {
        const result = parseCompoundOrder('Pepsi Pepsi Pepsi', MENU);

        expect(result.items.length).toBe(1);
        expect(findDish(result.items, 'pepsi')?.quantity).toBe(3);
    });

    it('parses "3 Pepsi + kawa"', () => {
        const result = parseCompoundOrder('3 Pepsi + kawa', MENU);

        expect(result.items.length).toBe(2);
        expect(findDish(result.items, 'pepsi')?.quantity).toBe(3);
        expect(findDish(result.items, 'kawa')?.quantity).toBe(1);
    });

    it('parses "3x Pepsi" as a single item with quantity=3', () => {
        const result = parseCompoundOrder('3x Pepsi', MENU);

        expect(result.items.length).toBe(1);
        expect(findDish(result.items, 'pepsi')?.quantity).toBe(3);
    });

    it('parses "Pepsi x3" as a single item with quantity=3', () => {
        const result = parseCompoundOrder('Pepsi x3', MENU);

        expect(result.items.length).toBe(1);
        expect(findDish(result.items, 'pepsi')?.quantity).toBe(3);
    });

    it('parses "dwa razy sos pikantny" into "Sos Pikantny" qty=2', () => {
        const result = parseCompoundOrder('dwa razy sos pikantny', MENU);

        expect(result.items.length).toBe(1);
        expect(findDish(result.items, 'sos pikantny')?.quantity).toBe(2);
    });

    it('parses "2 razy sos pikantny" into "Sos Pikantny" qty=2', () => {
        const result = parseCompoundOrder('2 razy sos pikantny', MENU);

        expect(result.items.length).toBe(1);
        expect(findDish(result.items, 'sos pikantny')?.quantity).toBe(2);
    });

    it('preserves addon modifier metadata for "2 x sos pikantny"', () => {
        const result = parseCompoundOrder('2 x sos pikantny', MENU);

        expect(result.items.length).toBe(1);
        expect(result.items[0]?.dish.toLowerCase()).toContain('sos');
        expect(result.items[0]?.meta?.modifier).toContain('pikant');
        expect(result.items[0]?.quantity).toBe(2);
    });

    it('preserves addon modifier metadata for "2 x sos ostry"', () => {
        const result = parseCompoundOrder('2 x sos ostry', MENU);

        expect(result.items.length).toBe(1);
        expect(result.items[0]?.dish.toLowerCase()).toContain('sos');
        expect(result.items[0]?.meta?.modifier).toContain('ostry');
        expect(result.items[0]?.quantity).toBe(2);
    });

    it('parses heuristic compound without conjunction: "zamawiam Pepsi 3 czarne kawy"', () => {
        const result = parseCompoundOrder('zamawiam Pepsi 3 czarne kawy', MENU);

        expect(result.items.length).toBe(2);
        expect(findDish(result.items, 'pepsi')?.quantity).toBe(1);
        expect(findDish(result.items, 'kawa')?.quantity).toBe(3);
        expect(Array.isArray(result.heuristicTraces)).toBe(true);
        expect(result.heuristicTraces.length).toBeGreaterThan(0);
    });

    it('parses "Pepsi i 3 czarne kawy"', () => {
        const result = parseCompoundOrder('Pepsi i 3 czarne kawy', MENU);

        expect(result.items.length).toBe(2);
        expect(findDish(result.items, 'pepsi')?.quantity).toBe(1);
        expect(findDish(result.items, 'kawa')?.quantity).toBe(3);
    });

    it('parses "2 razy sos" into generic addon token without modifier', () => {
        const result = parseCompoundOrder('2 razy sos', MENU);

        expect(result.items.length).toBe(1);
        expect(findDish(result.items, 'sos')?.quantity).toBe(2);
        expect(result.items[0]?.meta?.modifier || null).toBe(null);
    });

    it('keeps resolver-safe drink token when menu contains bundle alias item', () => {
        const bundleMenu = [
            { id: 'drink_bundle', name: 'Pepsi / Mirinda / 7up', base_name: 'Pepsi / Mirinda / 7up' },
        ];
        const result = parseCompoundOrder('3 x Pepsi', bundleMenu);

        expect(result.items.length).toBe(1);
        expect(result.items[0]?.dish).toBe('Pepsi');
        expect(result.items[0]?.quantity).toBe(3);
        expect(result.items[0]?.meta?.canonicalAliasBundle).toBe(true);
        expect(result.items[0]?.meta?.rawLabel).toBe('Pepsi');
    });
});
