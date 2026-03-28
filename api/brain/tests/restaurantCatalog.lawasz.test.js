import { describe, it, expect } from 'vitest';
import { findRestaurantInText } from '../data/restaurantCatalog.js';

describe('restaurant catalog - LAWASZ KEBAB', () => {
    it('matches direct name "lawasz kebab"', () => {
        const match = findRestaurantInText('lawasz kebab');
        expect(match?.name).toBe('LAWASZ KEBAB');
    });

    it('matches short alias "lawasz"', () => {
        const match = findRestaurantInText('lawasz');
        expect(match?.name).toBe('LAWASZ KEBAB');
    });
});

