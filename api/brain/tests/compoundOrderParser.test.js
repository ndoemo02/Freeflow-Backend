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

const MULTI_MAIN_MENU = [
    { id: 'main_flaki', name: 'Flaki z indyka', base_name: 'Flaki z indyka', type: 'MAIN', category: 'Danie główne' },
    { id: 'main_burger', name: 'Burger wołowy', base_name: 'Burger wołowy', type: 'MAIN', category: 'Danie główne' },
    { id: 'side_frytki', name: 'Frytki', base_name: 'Frytki', type: 'ADDON', category: 'Dodatki' },
    { id: 'side_surowka', name: 'Surówka', base_name: 'Surówka', type: 'ADDON', category: 'Dodatki' },
];

const STARA_MENU = [
    { id: 'main_rolada', name: 'Rolada wołowa (na zamówienie)', base_name: 'Rolada wołowa', type: 'MAIN', category: 'Danie główne' },
    { id: 'main_schabowy', name: 'Kotlet schabowy', base_name: 'Kotlet schabowy', type: 'MAIN', category: 'Danie główne' },
    { id: 'addon_kapusta', name: 'Kapusta modra', base_name: 'Kapusta modra', type: 'ADDON', category: 'Dodatki' },
    { id: 'addon_ziemniaki', name: 'Ziemniaki', base_name: 'Ziemniaki', type: 'ADDON', category: 'Dodatki' },
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

    it('preserves addon modifier metadata for "2 razy ostry sos"', () => {
        const result = parseCompoundOrder('2 razy ostry sos', MENU);

        expect(result.items.length).toBe(1);
        expect(result.items[0]?.dish.toLowerCase()).toContain('sos');
        expect(result.items[0]?.meta?.modifier).toContain('ostry');
        expect(result.items[0]?.quantity).toBe(2);
    });

    it('parses "podwójny sos ostry" as qty=2 with modifier', () => {
        const result = parseCompoundOrder('podwójny sos ostry', MENU);

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

    it('collapses serving phrase "Rolada ... z ... i ..." into single MAIN item', () => {
        const result = parseCompoundOrder('Rolada śląska z kluskami i modrą kapustą', STARA_MENU);

        expect(result.items.length).toBe(1);
        expect(result.items[0]?.dish).toBe('Rolada wołowa');
        expect(result.items[0]?.quantity).toBe(1);
        expect(result.items[0]?.meta?.collapsedServingPhrase).toBe(true);
    });

    it('collapses qty serving phrase "dwa Kotlet ... z ... i ..." into single MAIN item with qty=2', () => {
        const result = parseCompoundOrder('dwa Kotlet schabowy z ziemniakami i kapustą', STARA_MENU);

        expect(result.items.length).toBe(1);
        expect(result.items[0]?.dish).toBe('Kotlet schabowy');
        expect(result.items[0]?.quantity).toBe(2);
    });

    // Regression: multi-dish utterance with "z ... i ..." must NOT be collapsed
    // to single item by tryWholePhraseSingleItem (substring-match false positive).
    // The parser sees "flaki z indyka" / "burger wołowy z frytkami" / "surówką" as
    // three segments, so items.length >= 2 with both main dishes present.
    it('regression: "flaki z indyka i burger wołowy z frytkami i surówką" contains flaki and burger', () => {
        const result = parseCompoundOrder('flaki z indyka i burger wołowy z frytkami i surówką', MULTI_MAIN_MENU);

        expect(result.items.length).toBeGreaterThanOrEqual(2);
        expect(findDish(result.items, 'flaki')?.quantity).toBe(1);
        expect(findDish(result.items, 'burger')?.quantity).toBe(1);
    });

    it('regression: "proszę jeszcze flaki z indyka i burger wołowy z frytkami i surówką" contains flaki and burger', () => {
        const result = parseCompoundOrder(
            'proszę jeszcze flaki z indyka i burger wołowy z frytkami i surówką',
            MULTI_MAIN_MENU,
        );

        expect(result.items.length).toBeGreaterThanOrEqual(2);
        expect(findDish(result.items, 'flaki')?.quantity).toBe(1);
        expect(findDish(result.items, 'burger')?.quantity).toBe(1);
    });

    it('regression: "2 flaki z indyka i 3 burgery wołowe" → 2 items with correct quantities', () => {
        const result = parseCompoundOrder('2 flaki z indyka i 3 burgery wołowe', MULTI_MAIN_MENU);

        expect(result.items.length).toBe(2);
        expect(findDish(result.items, 'flaki')?.quantity).toBe(2);
        expect(findDish(result.items, 'burger')?.quantity).toBe(3);
    });
});
