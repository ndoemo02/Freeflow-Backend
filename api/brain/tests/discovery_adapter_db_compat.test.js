import { describe, it, expect } from 'vitest';
import { enrichRestaurant, mapRestaurantToFeatures } from '../discovery/restaurantFeatureAdapter.ts';
import { mapItemToMetadata } from '../discovery/itemMetadataAdapter.ts';

describe('restaurantFeatureAdapter DB compatibility', () => {
    it('uses DB-backed taxonomy/support/price fields when present', () => {
        const restaurant = {
            id: 'r-db-1',
            name: 'Sushi DB',
            cuisine_type: 'Japonskie',
            description: 'Sushi premium',
            taxonomy_groups: ['asian'],
            taxonomy_cats: ['sushi'],
            taxonomy_tags: ['vege'],
            supports_delivery: false,
            price_level: 4,
        };

        const features = mapRestaurantToFeatures(restaurant);
        expect(features.topGroups).toEqual(['asian']);
        expect(features.categories).toEqual(['sushi']);
        expect(features.tags).toContain('vege');
        expect(features.tags).not.toContain('delivery');

        const enriched = enrichRestaurant(restaurant);
        expect(enriched._price_level).toBe(4);
        expect(enriched._supports_delivery).toBe(false);
    });

    it('falls back to runtime inference when DB taxonomy fields are empty/missing', () => {
        const restaurant = {
            id: 'r-legacy-1',
            name: 'Burger Express',
            cuisine_type: 'Burgery',
            description: 'Szybkie jedzenie, dostawa i dowoz',
            taxonomy_groups: [],
            taxonomy_cats: [],
            taxonomy_tags: [],
        };

        const features = mapRestaurantToFeatures(restaurant);
        expect(features.topGroups).toContain('fast_food');
        expect(features.categories).toContain('burgers');
        expect(features.tags).toContain('quick');
        expect(features.tags).toContain('delivery');

        const enriched = enrichRestaurant(restaurant);
        expect(enriched._supports_delivery).toBe(true);
        expect(enriched._price_level).toBe(2);
    });

    it('accepts live delivery_available flag from current DB read-path', () => {
        const restaurant = {
            id: 'r-live-1',
            name: 'Pizza Live',
            cuisine_type: 'Pizza',
            taxonomy_groups: ['fast_food'],
            taxonomy_cats: ['pizza'],
            taxonomy_tags: [],
            delivery_available: true,
        };

        const features = mapRestaurantToFeatures(restaurant);
        expect(features.tags).toContain('delivery');

        const enriched = enrichRestaurant(restaurant);
        expect(enriched._supports_delivery).toBe(true);
    });
});

describe('itemMetadataAdapter DB compatibility', () => {
    it('prefers DB-backed item metadata fields when present', () => {
        const item = {
            id: 'm-db-1',
            name: 'Pizza Pepperoni',
            base_name: 'pizza pepperoni',
            item_family: 'pizza',
            item_variant: 'XL',
            item_aliases: ['pepperoni pizza', 'pizza pepperoni'],
            item_tags: ['spicy'],
            dietary_flags: ['contains_meat'],
        };

        const mapped = mapItemToMetadata(item);
        expect(mapped.base_name).toBe('pizza pepperoni');
        expect(mapped.item_family).toBe('pizza');
        expect(mapped.item_variant).toBe('XL');
        expect(mapped.item_aliases).toEqual(['pepperoni pizza', 'pizza pepperoni']);
        expect(mapped.item_tags).toEqual(['spicy']);
        expect(mapped.dietary_flags).toEqual(['contains_meat']);
    });

    it('uses fallback inference for legacy item rows', () => {
        const item = {
            id: 'm-legacy-1',
            name: 'Rollo Kebab',
            item_aliases: [],
        };

        const mapped = mapItemToMetadata(item);
        expect(mapped.base_name).toBe('rollo kebab');
        expect(mapped.item_family).toBe('rollo');
        expect(mapped.item_variant).toBeNull();
        expect(mapped.item_aliases).toContain('rollo kebab');
        expect(mapped.item_aliases).toContain('rollo');
        expect(mapped.item_tags).toEqual([]);
        expect(mapped.dietary_flags).toEqual([]);
    });
});
