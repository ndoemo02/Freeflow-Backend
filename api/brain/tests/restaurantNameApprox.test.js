import { describe, expect, it } from 'vitest';
import { findRestaurantByApproximateName } from '../data/restaurantCatalog.js';

// ASR spellings of demo restaurant names from owner voice runs (2026-09-25, Gemini 3.1 and 3.8).
describe('findRestaurantByApproximateName', () => {
    it.each([
        ['Seto Ponośmy', 'Syto po Naszymu'],
        ['Si Leśna Italiane', 'Silesiana Italiana'],
        ['Gets and roll', 'Kebs & Roll'],
        ['Smog i piec', 'Smok i Piec'],
    ])('maps the garbled name "%s" to %s', (spoken, expected) => {
        expect(findRestaurantByApproximateName(spoken, { demoOnly: true })?.name).toBe(expected);
    });

    it.each(['Pizzeria Roma', 'McDonalds', 'Kebab King', 'Czyścisz samochód', 'Smk', ''])(
        'does not guess a demo restaurant for "%s"',
        (spoken) => {
            expect(findRestaurantByApproximateName(spoken, { demoOnly: true })).toBeNull();
        },
    );

});
