import { describe, it, expect } from 'vitest';
import { FindRestaurantHandler } from '../domains/food/findHandler.js';

describe('FindRestaurantHandler GPS city enrichment', () => {
    it('enriches GPS cuisine results with same-city cuisine restaurants when only one GPS hit exists', async () => {
        const repo = {
            searchNearby: async () => ([
                { id: 'r_tasty', name: 'Tasty King Kebab', cuisine_type: 'Kebab', lat: 50.39, lng: 18.95, distance: 1.2 }
            ]),
            searchRestaurants: async () => ([
                { id: 'r_tasty', name: 'Tasty King Kebab', cuisine_type: 'Kebab', city: 'Piekary Slaskie' },
                { id: 'r_lawasz', name: 'LAWASZ KEBAB', cuisine_type: 'Kebab', city: 'Piekary Slaskie' }
            ])
        };

        const handler = new FindRestaurantHandler(repo);

        const result = await handler.execute({
            text: 'mam ochote na kebab',
            body: { lat: 50.395, lng: 18.958 },
            coords: { lat: 50.395, lng: 18.958 },
            entities: { cuisine: 'Kebab', location: null },
            session: { last_location: 'Piekary Slaskie' }
        });

        const names = (result.restaurants || []).map(r => r.name);
        expect(names).toContain('Tasty King Kebab');
        expect(names).toContain('LAWASZ KEBAB');
    });
});

