import { describe, it, expect } from 'vitest';
import { NLURouter } from '../nlu/router.js';

describe('discovery override in restaurant context', () => {
    it('keeps "gdzie zjem w Piekarach" as find_nearby even with currentRestaurant', async () => {
        const nlu = new NLURouter();
        const result = await nlu.detect({
            text: 'gdzie zjem w Piekarach',
            body: { text: 'gdzie zjem w Piekarach' },
            session: {
                currentRestaurant: {
                    id: 'fc844513-2869-4f42-b04f-c21e1e4cceb7',
                    name: 'Tasty King Kebab',
                },
                last_menu: [
                    { id: 'm1', name: 'Nuggets box', base_name: 'Nuggets box' },
                    { id: 'm2', name: 'Kebab amerykański', base_name: 'Kebab amerykański' },
                ],
            },
        });

        expect(result.intent).toBe('find_nearby');
        expect(result.source).toBe('restaurant_navigation_override');
    });
});

