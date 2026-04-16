/**
 * IntentVerificationLayer v2 — State Machine Verifier — testy.
 *
 * Pokrywa:
 *   - Rule 1: Rapid-fire Protection
 *   - Rule 2: OrderMode FSM Transition Check
 *   - Rule 3: Args-Session State Coherence
 *   - Rule 4: Cart Sanity
 *   - Rule 5: Sequence Coherence
 *   - Confidence scoring & edge cases
 *
 * Uruchom: npx vitest run api/voice/live/tests/intentVerification.test.js
 */
import { describe, it, expect } from 'vitest';
import { verifyToolCall } from '../IntentVerificationLayer.js';

// ─── helpers ────────────────────────────────────────────────────────────────

function makeSession(overrides = {}) {
    return {
        orderMode: 'neutral',
        last_restaurants_list: [],
        currentRestaurant: null,
        lastRestaurant: null,
        pendingOrder: null,
        expectedContext: null,
        lastMenu: [],
        lastIntent: null,
        cart: { items: [], total: 0 },
        ...overrides,
    };
}

const RESTAURANTS = [
    { id: 'r1', name: 'Pizza Paradiso' },
    { id: 'r2', name: 'Kebab Master' },
    { id: 'r3', name: 'Sushi World' },
];

// ═══════════════════════════════════════════════════════════════════════════
// Rule 1: Rapid-fire Protection
// ═══════════════════════════════════════════════════════════════════════════

describe('Rule 1 — Rapid-fire Protection', () => {
    it('odrzuca identyczny tool+args w < 1500ms', () => {
        const args = { restaurant_id: 'r1' };
        const result = verifyToolCall({
            toolName: 'select_restaurant',
            args,
            session: makeSession({ last_restaurants_list: RESTAURANTS }),
            lastToolCallTimestamp: Date.now() - 300,
            lastToolCallArgsKey: JSON.stringify(args),
        });
        expect(result.verified).toBe(false);
        expect(result.confidence).toBe(0);
        expect(result.reason).toBe('duplicate_rapid_fire');
    });

    it('przepuszcza ten sam tool z INNYMI args w < 1500ms (lekka kara)', () => {
        const result = verifyToolCall({
            toolName: 'add_item_to_cart',
            args: { dish: 'cola' },
            session: makeSession({ orderMode: 'restaurant_selected', currentRestaurant: { id: 'r1' } }),
            lastToolCallTimestamp: Date.now() - 300,
            lastToolCallArgsKey: JSON.stringify({ dish: 'kebab' }),
        });
        expect(result.verified).toBe(true);
        expect(result.confidence).toBeLessThan(1.0);
        expect(result.trace.some((t) => t.includes('rapid_fire:different_args'))).toBe(true);
    });

    it('przepuszcza identyczny tool+args po > 1500ms', () => {
        const args = { restaurant_id: 'r1' };
        const result = verifyToolCall({
            toolName: 'select_restaurant',
            args,
            session: makeSession({ last_restaurants_list: RESTAURANTS }),
            lastToolCallTimestamp: Date.now() - 2000,
            lastToolCallArgsKey: JSON.stringify(args),
        });
        expect(result.verified).toBe(true);
    });

    it('odrzuca identyczny find_nearby w < 3000ms', () => {
        const args = { location: 'Piekary Slaskie', cuisine: 'Polish' };
        const result = verifyToolCall({
            toolName: 'find_nearby',
            args,
            session: makeSession(),
            lastToolCallTimestamp: Date.now() - 2000,
            lastToolCallArgsKey: JSON.stringify(args),
        });
        expect(result.verified).toBe(false);
        expect(result.reason).toBe('duplicate_rapid_fire');
        expect(result.trace.some((t) => t.includes('rapid_fire:duplicate_within_3000ms'))).toBe(true);
    });

    it('przepuszcza identyczny find_nearby po > 3000ms', () => {
        const args = { location: 'Piekary Slaskie', cuisine: 'Polish' };
        const result = verifyToolCall({
            toolName: 'find_nearby',
            args,
            session: makeSession(),
            lastToolCallTimestamp: Date.now() - 3300,
            lastToolCallArgsKey: JSON.stringify(args),
        });
        expect(result.verified).toBe(true);
    });

    it('przepuszcza gdy brak lastToolCallTimestamp', () => {
        const result = verifyToolCall({
            toolName: 'find_nearby',
            args: {},
            session: makeSession(),
        });
        expect(result.verified).toBe(true);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// Rule 2: OrderMode FSM Transition Check
// ═══════════════════════════════════════════════════════════════════════════

describe('Rule 2 — FSM Transition Check', () => {
    it('neutral + find_nearby = ok', () => {
        const result = verifyToolCall({
            toolName: 'find_nearby',
            args: {},
            session: makeSession({ orderMode: 'neutral' }),
        });
        expect(result.verified).toBe(true);
        expect(result.trace.some((t) => t.includes('fsm_transition_ok'))).toBe(true);
    });

    it('neutral + confirm_order = ESCALATION HARD REJECT', () => {
        const result = verifyToolCall({
            toolName: 'confirm_order',
            args: {},
            session: makeSession({ orderMode: 'neutral' }),
        });
        expect(result.verified).toBe(false);
        expect(result.confidence).toBe(0);
        expect(result.reason).toBe('fsm_escalation_blocked');
    });

    it('neutral + open_checkout = ESCALATION HARD REJECT', () => {
        const result = verifyToolCall({
            toolName: 'open_checkout',
            args: {},
            session: makeSession({ orderMode: 'neutral' }),
        });
        expect(result.verified).toBe(false);
        expect(result.reason).toBe('fsm_escalation_blocked');
    });

    it('restaurant_selected + confirm_order = ESCALATION HARD REJECT', () => {
        const result = verifyToolCall({
            toolName: 'confirm_order',
            args: {},
            session: makeSession({
                orderMode: 'restaurant_selected',
                currentRestaurant: { id: 'r1' },
            }),
        });
        expect(result.verified).toBe(false);
        expect(result.reason).toBe('fsm_escalation_blocked');
    });

    it('restaurant_selected + add_item_to_cart = ok', () => {
        const result = verifyToolCall({
            toolName: 'add_item_to_cart',
            args: { dish: 'pizza' },
            session: makeSession({
                orderMode: 'restaurant_selected',
                currentRestaurant: { id: 'r1' },
            }),
        });
        expect(result.verified).toBe(true);
    });

    it('building + confirm_order = ok (jesli state spelniony)', () => {
        const result = verifyToolCall({
            toolName: 'confirm_order',
            args: {},
            session: makeSession({
                orderMode: 'building',
                pendingOrder: { items: [{ dish: 'pizza' }] },
                expectedContext: 'confirm_order',
            }),
        });
        expect(result.verified).toBe(true);
    });

    it('awaiting_confirmation + find_nearby = soft penalty (nie escalation)', () => {
        const result = verifyToolCall({
            toolName: 'find_nearby',
            args: {},
            session: makeSession({ orderMode: 'awaiting_confirmation' }),
        });
        // Not in allowed set but not escalation either
        expect(result.confidence).toBeLessThan(1.0);
        expect(result.trace.some((t) => t.includes('fsm_transition_warn'))).toBe(true);
    });

    it('awaiting_confirmation + confirm_order = ok', () => {
        const result = verifyToolCall({
            toolName: 'confirm_order',
            args: {},
            session: makeSession({
                orderMode: 'awaiting_confirmation',
                pendingOrder: { items: [{ dish: 'kebab' }] },
                expectedContext: 'confirm_order',
            }),
        });
        expect(result.verified).toBe(true);
    });

    it('completed + find_nearby = ok (nowy cykl)', () => {
        const result = verifyToolCall({
            toolName: 'find_nearby',
            args: {},
            session: makeSession({ orderMode: 'completed' }),
        });
        expect(result.verified).toBe(true);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// Rule 3: Args-Session State Coherence
// ═══════════════════════════════════════════════════════════════════════════

describe('Rule 3a — select_restaurant: restaurant_id validation', () => {
    it('restaurant_id na liscie = ok', () => {
        const result = verifyToolCall({
            toolName: 'select_restaurant',
            args: { restaurant_id: 'r1' },
            session: makeSession({ last_restaurants_list: RESTAURANTS }),
        });
        expect(result.verified).toBe(true);
        expect(result.trace.some((t) => t.includes('args_ok:restaurant_id_in_list'))).toBe(true);
    });

    it('restaurant_id NIE na liscie = hard reject', () => {
        const result = verifyToolCall({
            toolName: 'select_restaurant',
            args: { restaurant_id: 'hallucinated_999' },
            session: makeSession({ last_restaurants_list: RESTAURANTS }),
        });
        expect(result.verified).toBe(false);
        expect(result.confidence).toBe(0);
        expect(result.reason).toBe('restaurant_id_not_in_session_list');
    });

    it('pusta lista = przepuszcza (nie mozemy zweryfikowac)', () => {
        const result = verifyToolCall({
            toolName: 'select_restaurant',
            args: { restaurant_id: 'any_id' },
            session: makeSession(),
        });
        expect(result.verified).toBe(true);
    });
});

describe('Rule 3a — select_restaurant: restaurant_name fuzzy match', () => {
    it('nazwa pasuje = ok', () => {
        const result = verifyToolCall({
            toolName: 'select_restaurant',
            args: { restaurant_name: 'Pizza Paradiso' },
            session: makeSession({ last_restaurants_list: RESTAURANTS }),
        });
        expect(result.verified).toBe(true);
        expect(result.adjustedTool).toBeUndefined();
    });

    it('nazwa nie pasuje = downgrade do find_nearby', () => {
        const result = verifyToolCall({
            toolName: 'select_restaurant',
            args: { restaurant_name: 'Nieznana Restauracja ABC' },
            session: makeSession({ last_restaurants_list: RESTAURANTS }),
        });
        expect(result.adjustedTool).toBe('find_nearby');
        expect(result.reason).toContain('downgraded_to_find_nearby');
    });

    it('brak nazwy i ID = lekka kara', () => {
        const result = verifyToolCall({
            toolName: 'select_restaurant',
            args: {},
            session: makeSession({ last_restaurants_list: RESTAURANTS }),
        });
        expect(result.trace.some((t) => t.includes('args_warn:select_restaurant_no_identifier'))).toBe(true);
    });
});

describe('Rule 3b — confirm_order state validation', () => {
    it('pendingOrder + expectedContext = confirm_order → ok', () => {
        const result = verifyToolCall({
            toolName: 'confirm_order',
            args: {},
            session: makeSession({
                orderMode: 'awaiting_confirmation',
                pendingOrder: { items: [{ dish: 'pizza' }] },
                expectedContext: 'confirm_order',
            }),
        });
        expect(result.verified).toBe(true);
    });

    it('brak pendingOrder → hard reject', () => {
        const result = verifyToolCall({
            toolName: 'confirm_order',
            args: {},
            session: makeSession({
                orderMode: 'awaiting_confirmation',
                expectedContext: 'confirm_order',
            }),
        });
        expect(result.verified).toBe(false);
        expect(result.reason).toBe('confirm_order_state_missing');
    });

    it('zly expectedContext → hard reject', () => {
        const result = verifyToolCall({
            toolName: 'confirm_order',
            args: {},
            session: makeSession({
                orderMode: 'building',
                pendingOrder: { items: [] },
                expectedContext: 'menu_request',
            }),
        });
        expect(result.verified).toBe(false);
        expect(result.reason).toBe('confirm_order_state_missing');
    });
});

describe('Rule 3c — add_item dish in menu', () => {
    const menuSession = makeSession({
        orderMode: 'restaurant_selected',
        currentRestaurant: { id: 'r1' },
        lastMenu: [
            { name: 'pizza margherita' },
            { name: 'kebab box' },
        ],
    });

    it('dish w menu = ok', () => {
        const result = verifyToolCall({
            toolName: 'add_item_to_cart',
            args: { dish: 'pizza margherita' },
            session: menuSession,
        });
        expect(result.trace.some((t) => t.includes('args_ok:dish_in_menu'))).toBe(true);
    });

    it('dish NIE w menu = obnizenie confidence (nie blokuje)', () => {
        const result = verifyToolCall({
            toolName: 'add_item_to_cart',
            args: { dish: 'trufle z kawiorem' },
            session: menuSession,
        });
        expect(result.verified).toBe(true);
        expect(result.trace.some((t) => t.includes('args_warn:dish_not_in_menu'))).toBe(true);
    });
});

describe('Rule 3d — add_item bez kontekstu restauracji', () => {
    it('brak currentRestaurant i lastRestaurant = penalty', () => {
        const result = verifyToolCall({
            toolName: 'add_item_to_cart',
            args: { dish: 'pizza' },
            session: makeSession({ orderMode: 'restaurant_selected' }),
        });
        expect(result.trace.some((t) => t.includes('args_warn:add_item_no_restaurant_context'))).toBe(true);
    });

    it('currentRestaurant present = no penalty', () => {
        const result = verifyToolCall({
            toolName: 'add_item_to_cart',
            args: { dish: 'pizza' },
            session: makeSession({
                orderMode: 'restaurant_selected',
                currentRestaurant: { id: 'r1' },
            }),
        });
        expect(result.trace.every((t) => !t.includes('no_restaurant_context'))).toBe(true);
    });

    // P1 fix: restaurant_name in args = no false-positive warning
    it('restaurant_name in args (no session restaurant) = no args_warn false-positive', () => {
        const result = verifyToolCall({
            toolName: 'add_item_to_cart',
            args: { dish: 'nalesniki', restaurant_name: 'Stara Kamienica' },
            session: makeSession({ orderMode: 'neutral' }),
        });
        expect(result.trace.every((t) => !t.includes('add_item_no_restaurant_context'))).toBe(true);
    });

    it('restaurant_id in args (no session restaurant) = no args_warn false-positive', () => {
        const result = verifyToolCall({
            toolName: 'add_item_to_cart',
            args: { dish: 'pizza', restaurant_id: 'r1' },
            session: makeSession({ orderMode: 'neutral' }),
        });
        expect(result.trace.every((t) => !t.includes('add_item_no_restaurant_context'))).toBe(true);
    });

    it('no dish, no session restaurant, no args restaurant = warning still fires', () => {
        const result = verifyToolCall({
            toolName: 'add_item_to_cart',
            args: { dish: 'kebab' },
            session: makeSession({ orderMode: 'neutral' }),
        });
        expect(result.trace.some((t) => t.includes('add_item_no_restaurant_context'))).toBe(true);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// Rule 4: Cart Sanity
// ═══════════════════════════════════════════════════════════════════════════

describe('Rule 4 — Cart Sanity', () => {
    it('confirm_order z pustym cart i pustym pending = penalty', () => {
        const result = verifyToolCall({
            toolName: 'confirm_order',
            args: {},
            session: makeSession({
                orderMode: 'awaiting_confirmation',
                pendingOrder: { items: [] },
                expectedContext: 'confirm_order',
                cart: { items: [], total: 0 },
            }),
        });
        expect(result.trace.some((t) => t.includes('cart_sanity:confirm_with_empty_cart_and_pending'))).toBe(true);
    });

    it('open_checkout z pustym cart i bez pending = penalty', () => {
        const result = verifyToolCall({
            toolName: 'open_checkout',
            args: {},
            session: makeSession({
                orderMode: 'building',
                cart: { items: [], total: 0 },
            }),
        });
        expect(result.trace.some((t) => t.includes('cart_sanity:checkout_with_empty_cart'))).toBe(true);
    });

    it('open_checkout z itemami w cart = brak penalty', () => {
        const result = verifyToolCall({
            toolName: 'open_checkout',
            args: {},
            session: makeSession({
                orderMode: 'building',
                cart: { items: [{ dish: 'pizza', qty: 1 }], total: 25 },
            }),
        });
        expect(result.trace.every((t) => !t.includes('cart_sanity'))).toBe(true);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// Rule 5: Sequence Coherence
// ═══════════════════════════════════════════════════════════════════════════

describe('Rule 5 — Sequence Coherence', () => {
    it('confirm_order zaraz po find_nearby = penalty', () => {
        const result = verifyToolCall({
            toolName: 'confirm_order',
            args: {},
            session: makeSession({
                orderMode: 'awaiting_confirmation',
                lastIntent: 'find_nearby',
                pendingOrder: { items: [{ dish: 'x' }] },
                expectedContext: 'confirm_order',
            }),
        });
        expect(result.trace.some((t) => t.includes('sequence_warn:confirm_order_directly_after_find_nearby'))).toBe(true);
    });

    it('select_restaurant bez prior discovery i pustej listy = penalty', () => {
        const result = verifyToolCall({
            toolName: 'select_restaurant',
            args: { restaurant_name: 'Test' },
            session: makeSession({ last_restaurants_list: [] }),
        });
        expect(result.trace.some((t) => t.includes('sequence_warn:select_without_prior_discovery'))).toBe(true);
    });

    it('select_restaurant z lista = brak sequence penalty', () => {
        const result = verifyToolCall({
            toolName: 'select_restaurant',
            args: { restaurant_id: 'r1' },
            session: makeSession({ last_restaurants_list: RESTAURANTS }),
        });
        expect(result.trace.every((t) => !t.includes('sequence_warn'))).toBe(true);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// Confidence & shape
// ═══════════════════════════════════════════════════════════════════════════

describe('Confidence & Response Shape', () => {
    it('confidence = 1.0 dla idealnego happy path', () => {
        const result = verifyToolCall({
            toolName: 'find_nearby',
            args: { cuisine: 'pizza' },
            session: makeSession(),
        });
        expect(result.verified).toBe(true);
        expect(result.confidence).toBe(1.0);
    });

    it('confidence w zakresie [0, 1]', () => {
        const result = verifyToolCall({
            toolName: 'add_item_to_cart',
            args: { dish: 'xyz' },
            session: makeSession({
                orderMode: 'neutral',
                lastMenu: [{ name: 'pizza' }],
            }),
        });
        expect(result.confidence).toBeGreaterThanOrEqual(0);
        expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('zawsze zwraca { verified, confidence, trace }', () => {
        const result = verifyToolCall({
            toolName: 'get_cart_state',
            args: {},
            session: makeSession(),
        });
        expect(typeof result.verified).toBe('boolean');
        expect(typeof result.confidence).toBe('number');
        expect(Array.isArray(result.trace)).toBe(true);
    });

    it('reason jest undefined gdy brak problemu', () => {
        const result = verifyToolCall({
            toolName: 'find_nearby',
            args: {},
            session: makeSession(),
        });
        expect(result.reason).toBeUndefined();
    });
});

describe('Cart edit tools - IVL coverage', () => {
    it('building + update_cart_item_quantity = ok', () => {
        const result = verifyToolCall({
            toolName: 'update_cart_item_quantity',
            args: { dish: 'Cola', quantity: 2 },
            session: makeSession({ orderMode: 'building', cart: { items: [{ name: 'Cola', qty: 1 }], total: 7 } }),
        });
        expect(result.verified).toBe(true);
        expect(result.trace.some((t) => t.includes('fsm_transition_ok:building:update_cart_item_quantity'))).toBe(true);
    });

    it('neutral + remove_item_from_cart = ok', () => {
        const result = verifyToolCall({
            toolName: 'remove_item_from_cart',
            args: { dish: 'Frytki' },
            session: makeSession({ orderMode: 'neutral', cart: { items: [{ name: 'Frytki', qty: 1 }], total: 10 } }),
        });
        expect(result.verified).toBe(true);
    });

    it('restaurant_selected + replace_cart_item = ok', () => {
        const result = verifyToolCall({
            toolName: 'replace_cart_item',
            args: { from_dish: 'Kurczak XL', to_dish: 'Wolowina XL' },
            session: makeSession({
                orderMode: 'restaurant_selected',
                currentRestaurant: { id: 'r1', name: 'Lawasz Kebab' },
                cart: { items: [{ name: 'Kurczak XL', qty: 2 }], total: 30 },
            }),
        });
        expect(result.verified).toBe(true);
    });
});
