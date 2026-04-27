/**
 * ToolValidator — boundary and contract tests.
 *
 * Pure synchronous function — no mocks needed.
 *
 * Covers:
 *   - Unknown tool → unknown_tool error
 *   - Missing required field → missing_required_field
 *   - quantity=0 → clamped to 1 (coercion, not block)
 *   - quantity=100 → clamped to 99 (QUANTITY_MAX)
 *   - items=[] → missing_required_field
 *   - items length > 20 → items_too_many
 *   - lat=999 → field silently dropped (out-of-range)
 *   - lng=-200 → field silently dropped (out-of-range)
 *   - item missing .dish → missing_required_field
 *   - Happy path add_item_to_cart → valid=true, sanitized payload
 *   - Happy path find_nearby with coords → valid=true, lat/lng preserved
 *
 * Run: npx vitest run api/voice/live/tests/toolValidator.test.js
 */
import { describe, it, expect } from 'vitest';
import { validateAndSanitize } from '../ToolValidator.js';

describe('ToolValidator — unknown tool', () => {
    it('returns unknown_tool for unrecognised toolName', () => {
        const result = validateAndSanitize('not_a_real_tool', { dish: 'Kebab' });
        expect(result.valid).toBe(false);
        expect(result.error).toBe('unknown_tool');
    });
});

describe('ToolValidator — missing required fields', () => {
    it('add_item_to_cart: missing dish → missing_required_field', () => {
        const result = validateAndSanitize('add_item_to_cart', { quantity: 2 });
        expect(result.valid).toBe(false);
        expect(result.error).toBe('missing_required_field');
        expect(result.field).toBe('dish');
    });

    it('add_items_to_cart: missing items → missing_required_field', () => {
        const result = validateAndSanitize('add_items_to_cart', {});
        expect(result.valid).toBe(false);
        expect(result.error).toBe('missing_required_field');
        expect(result.field).toBe('items');
    });

    it('add_items_to_cart: items=[] → missing_required_field', () => {
        const result = validateAndSanitize('add_items_to_cart', { items: [] });
        expect(result.valid).toBe(false);
        expect(result.error).toBe('missing_required_field');
        expect(result.field).toBe('items');
    });

    it('add_items_to_cart: item without .dish → missing_required_field for items[0].dish', () => {
        const result = validateAndSanitize('add_items_to_cart', {
            items: [{ quantity: 1 }]   // no dish
        });
        expect(result.valid).toBe(false);
        expect(result.error).toBe('missing_required_field');
        expect(result.field).toBe('items[0].dish');
    });
});

describe('ToolValidator — quantity coercion', () => {
    it('quantity=0 → clamped to 1 (not blocked)', () => {
        const result = validateAndSanitize('add_item_to_cart', { dish: 'Kebab', quantity: 0 });
        expect(result.valid).toBe(true);
        expect(result.sanitized.quantity).toBe(1);
    });

    it('quantity=100 → clamped to 99 (QUANTITY_MAX)', () => {
        const result = validateAndSanitize('add_item_to_cart', { dish: 'Kebab', quantity: 100 });
        expect(result.valid).toBe(true);
        expect(result.sanitized.quantity).toBe(99);
    });

    it('quantity=5 → preserved as-is', () => {
        const result = validateAndSanitize('add_item_to_cart', { dish: 'Kebab', quantity: 5 });
        expect(result.valid).toBe(true);
        expect(result.sanitized.quantity).toBe(5);
    });
});

describe('ToolValidator — items array limits', () => {
    it('items with 21 entries → items_too_many (ITEMS_MAX=20)', () => {
        const items = Array.from({ length: 21 }, (_, i) => ({ dish: `Dish ${i}`, quantity: 1 }));
        const result = validateAndSanitize('add_items_to_cart', { items });
        expect(result.valid).toBe(false);
        expect(result.error).toBe('items_too_many');
        expect(result.max).toBe(20);
    });

    it('items with 20 entries → valid (at limit)', () => {
        const items = Array.from({ length: 20 }, (_, i) => ({ dish: `Dish ${i}`, quantity: 1 }));
        const result = validateAndSanitize('add_items_to_cart', { items });
        expect(result.valid).toBe(true);
        expect(result.sanitized.items).toHaveLength(20);
    });
});

describe('ToolValidator — lat/lng bounds', () => {
    it('lat=999 → dropped from sanitized (out of [-90, 90])', () => {
        const result = validateAndSanitize('find_nearby', { lat: 999, lng: 18.5 });
        expect(result.valid).toBe(true);
        expect(result.sanitized.lat).toBeUndefined();
        expect(result.sanitized.lng).toBe(18.5);
    });

    it('lng=-200 → dropped from sanitized (out of [-180, 180])', () => {
        const result = validateAndSanitize('find_nearby', { lat: 50.2, lng: -200 });
        expect(result.valid).toBe(true);
        expect(result.sanitized.lat).toBe(50.2);
        expect(result.sanitized.lng).toBeUndefined();
    });

    it('valid lat/lng preserved', () => {
        const result = validateAndSanitize('find_nearby', { lat: 50.2049, lng: 18.9533 });
        expect(result.valid).toBe(true);
        expect(result.sanitized.lat).toBe(50.2049);
        expect(result.sanitized.lng).toBe(18.9533);
    });
});

describe('ToolValidator — happy paths', () => {
    it('add_item_to_cart valid payload → valid=true with sanitized dish+quantity', () => {
        const result = validateAndSanitize('add_item_to_cart', { dish: 'Vege Burger', quantity: 2 });
        expect(result.valid).toBe(true);
        expect(result.sanitized.dish).toBe('Vege Burger');
        expect(result.sanitized.quantity).toBe(2);
    });

    it('add_items_to_cart valid payload → valid=true, items sanitized', () => {
        const result = validateAndSanitize('add_items_to_cart', {
            items: [
                { dish: 'Kebab Box', quantity: 2 },
                { dish: 'Frytki', quantity: 1 },
            ]
        });
        expect(result.valid).toBe(true);
        expect(result.sanitized.items).toHaveLength(2);
        expect(result.sanitized.items[0].dish).toBe('Kebab Box');
        expect(result.sanitized.items[0].quantity).toBe(2);
    });

    it('confirm_order (no required params) → valid=true', () => {
        const result = validateAndSanitize('confirm_order', {});
        expect(result.valid).toBe(true);
    });
});

describe('ToolValidator - cart edit tools', () => {
    it('update_cart_item_quantity valid payload -> valid=true', () => {
        const result = validateAndSanitize('update_cart_item_quantity', {
            dish: 'Cola',
            quantity: 3,
        });
        expect(result.valid).toBe(true);
        expect(result.sanitized.dish).toBe('Cola');
        expect(result.sanitized.quantity).toBe(3);
    });

    it('remove_item_from_cart valid payload without quantity -> valid=true', () => {
        const result = validateAndSanitize('remove_item_from_cart', {
            dish: 'Frytki',
        });
        expect(result.valid).toBe(true);
        expect(result.sanitized.dish).toBe('Frytki');
        expect(result.sanitized.quantity).toBeUndefined();
    });

    it('replace_cart_item valid payload -> valid=true', () => {
        const result = validateAndSanitize('replace_cart_item', {
            from_dish: 'Kurczak XL',
            to_dish: 'Wolowina XL',
            quantity: 2,
        });
        expect(result.valid).toBe(true);
        expect(result.sanitized.from_dish).toBe('Kurczak XL');
        expect(result.sanitized.to_dish).toBe('Wolowina XL');
        expect(result.sanitized.quantity).toBe(2);
    });
});

describe('ToolValidator - cart edit required fields', () => {
    it('update_cart_item_quantity without dish -> missing_required_field', () => {
        const result = validateAndSanitize('update_cart_item_quantity', { quantity: 2 });
        expect(result.valid).toBe(false);
        expect(result.error).toBe('missing_required_field');
        expect(result.field).toBe('dish');
    });

    it('replace_cart_item without to_dish -> missing_required_field', () => {
        const result = validateAndSanitize('replace_cart_item', { from_dish: 'A' });
        expect(result.valid).toBe(false);
        expect(result.error).toBe('missing_required_field');
        expect(result.field).toBe('to_dish');
    });
});

describe('ToolValidator - compare_restaurants', () => {
    it('sanitizes compare_restaurants limits and metric', () => {
        const result = validateAndSanitize('compare_restaurants', {
            query: 'pierogi',
            metric: 'najtansze',
            max_restaurants: 10,
            max_items_per_restaurant: 0,
        });

        expect(result.valid).toBe(true);
        expect(result.sanitized.query).toBe('pierogi');
        expect(result.sanitized.metric).toBe('lowest_price');
        expect(result.sanitized.max_restaurants).toBe(3);
        expect(result.sanitized.max_items_per_restaurant).toBe(1);
    });

    it('defaults unknown metric to best_match', () => {
        const result = validateAndSanitize('compare_restaurants', {
            query: 'pierogi',
            metric: 'semantic_magic_mode',
        });

        expect(result.valid).toBe(true);
        expect(result.sanitized.metric).toBe('best_match');
    });
});
