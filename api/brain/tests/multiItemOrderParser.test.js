import { describe, it, expect } from 'vitest';
import { applyMultiItemParsing, parseMultiOrderCandidates } from '../core/pipeline/multiItemOrderParser.js';

describe('multi-item parser', () => {
    it('parses conjunction ordering text into two candidates', () => {
        const candidates = parseMultiOrderCandidates('Pepsi i kawa czarna');
        expect(candidates).toEqual(['Pepsi', 'Kawa Czarna']);
    });

    it('marks orderMode=multi_candidate and preserves dish when multiple items exist', () => {
        const result = applyMultiItemParsing({
            text: 'Pepsi i kawa czarna',
            intent: 'create_order',
            entities: { dish: 'Pepsi' },
        });

        expect(result.orderMode).toBe('multi_candidate');
        expect(result.entities.dish).toBe('Pepsi');
        expect(result.entities.items).toEqual([
            { dish: 'Pepsi', quantity: 1 },
            { dish: 'Kawa Czarna', quantity: 1 },
        ]);
    });
});
