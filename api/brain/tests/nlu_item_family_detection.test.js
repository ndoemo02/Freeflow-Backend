import { describe, it, expect } from 'vitest';
import { NLURouter } from '../nlu/router.js';

describe('NLU item-family discovery detection', () => {
    it('routes item-family queries to discovery with detected dish family', async () => {
        const nlu = new NLURouter();
        const cases = [
            { text: 'rollo w piekarach', family: 'rollo' },
            { text: 'pita w bytomiu', family: 'pita' },
            { text: 'lawasz w piekarach', family: 'lawasz' },
            { text: 'kebab w katowicach', family: 'kebab' },
        ];

        for (const scenario of cases) {
            const result = await nlu.detect({
                text: scenario.text,
                body: { text: scenario.text },
                session: {},
            });

            expect(result.intent).toBe('find_nearby');
            expect(result.source).toBe('item_family_detection');
            expect(result.entities?.dish).toBe(scenario.family);
        }
    });
});
