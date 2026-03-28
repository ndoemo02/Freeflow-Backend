/**
 * Gemini Live Safety — NLU Regression Matrix
 *
 * 50 deterministic test cases covering:
 *   G1 — Discovery vs create_order (15 cases)
 *   G2 — Confirmation contexts (10 cases)
 *   G3 — Checkout bridge adversarial (10 cases)
 *   G4 — Catalog aliases + cuisine discovery (10 cases)
 *   G5 — Menu request collisions (5 cases)
 *
 * All tests are offline (no network, no LLM).
 * EXPERT_MODE=false and LLM_TRANSLATOR_ENABLED=false are the defaults.
 *
 * Run: npx vitest run api/brain/tests/live_safety_regression_matrix.test.js
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NLURouter } from '../nlu/router.js';

vi.mock('../../_supabase.js', () => ({
    supabase: {
        from: vi.fn(() => ({
            select: vi.fn(() => {
                const responseBase = { data: [], error: null };
                const qb = Promise.resolve(responseBase);
                qb.eq = vi.fn().mockReturnValue(Promise.resolve(responseBase));
                qb.in = vi.fn().mockReturnValue(Promise.resolve(responseBase));
                qb.limit = vi.fn().mockReturnValue(Promise.resolve(responseBase));
                return qb;
            })
        }))
    }
}));

// ── Session fixtures ────────────────────────────────────────────────────────

/** Full ordering session at Callzone with menu loaded. */
const CALLZONE_SESSION = {
    currentRestaurant: { id: 'bd9f2244-7618-4071-aa96-52616a7b4c70', name: 'Callzone' },
    last_menu: [
        { id: 'v1', name: 'Vege Burger', base_name: 'Vege Burger', price_pln: '28.00' },
        { id: 'b1', name: 'Bacon Burger', base_name: 'Bacon Burger', price_pln: '32.00' },
    ],
    conversationPhase: 'ordering',
};

/** Callzone selected, menu not yet loaded. */
const CALLZONE_NO_MENU = {
    currentRestaurant: { id: 'bd9f2244-7618-4071-aa96-52616a7b4c70', name: 'Callzone' },
    conversationPhase: 'restaurant_selected',
};

/** Awaiting order confirmation. */
const CONFIRM_ORDER_SESSION = {
    expectedContext: 'confirm_order',
    conversationPhase: 'ordering',
    cart: { items: [{ name: 'Vege Burger', qty: 1 }], total: 28 },
    pendingOrder: { items: [{ name: 'Vege Burger', qty: 1 }] },
};

/** Awaiting add-to-cart confirmation. */
const CONFIRM_ADD_TO_CART_SESSION = {
    expectedContext: 'confirm_add_to_cart',
    conversationPhase: 'ordering',
};

/** Awaiting restaurant confirmation after fuzzy match. */
const CONFIRM_RESTAURANT_SESSION = {
    expectedContext: 'confirm_restaurant',
    pendingRestaurantConfirm: { id: 'RTEST', name: 'Test Restaurant' },
};

// ── Helper ──────────────────────────────────────────────────────────────────

async function runRouter(text, sessionSeed = {}) {
    const nlu = new NLURouter();
    return nlu.detect({ text, body: { text }, session: sessionSeed });
}

// ── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
    global.BRAIN_DEBUG = false;
    process.env.USE_LLM_INTENT = 'false';
    process.env.EXPERT_MODE = 'false';
    process.env.LLM_TRANSLATOR_ENABLED = 'false';
});

// ════════════════════════════════════════════════════════════════════════════
// G1 — Discovery vs create_order (15 cases)
// ════════════════════════════════════════════════════════════════════════════

describe('G1 — Discovery vs create_order', () => {

    it('G1-01 "dwa kebaby" no ctx → find_nearby (isNumericDiscovery)', async () => {
        const r = await runRouter('dwa kebaby');
        expect(r.intent).toBe('find_nearby');
    });

    it('G1-02 "trzy pizze" no ctx → find_nearby (isNumericDiscovery)', async () => {
        const r = await runRouter('trzy pizze');
        expect(r.intent).toBe('find_nearby');
    });

    it('G1-03 "kilka burgerów" no ctx → find_nearby (isNumericDiscovery)', async () => {
        const r = await runRouter('kilka burgerów');
        expect(r.intent).toBe('find_nearby');
    });

    it('G1-04 "kebab" no ctx → find_nearby (findRegex or food_word_fallback)', async () => {
        const r = await runRouter('kebab');
        expect(r.intent).toBe('find_nearby');
    });

    it('G1-05 "pizza" no ctx → find_nearby', async () => {
        const r = await runRouter('pizza');
        expect(r.intent).toBe('find_nearby');
    });

    it('G1-06 "burger" no ctx → find_nearby', async () => {
        const r = await runRouter('burger');
        expect(r.intent).toBe('find_nearby');
    });

    it('G1-07 "sushi" no ctx → find_nearby (food_word_fallback)', async () => {
        const r = await runRouter('sushi');
        expect(r.intent).toBe('find_nearby');
        expect(r.source).toBe('food_word_fallback');
    });

    it('G1-08 "szukam restauracji" no ctx → find_nearby', async () => {
        const r = await runRouter('szukam restauracji');
        expect(r.intent).toBe('find_nearby');
    });

    it('G1-09 "restauracje w pobliżu" no ctx → find_nearby', async () => {
        const r = await runRouter('restauracje w pobliżu');
        expect(r.intent).toBe('find_nearby');
    });

    it('G1-10 "vege burger" CALLZONE session → create_order via dish_guard', async () => {
        const r = await runRouter('vege burger', CALLZONE_SESSION);
        expect(r.intent).toBe('create_order');
        expect(r.source).toBe('dish_guard');
        expect(r.entities.dish).toBe('Vege Burger');
    });

    it('G1-11 "dwa vege burgery" CALLZONE session → create_order (dish_guard or compound_parser, both before numerics check)', async () => {
        const r = await runRouter('dwa vege burgery', CALLZONE_SESSION);
        expect(r.intent).toBe('create_order');
        expect(['dish_guard', 'compound_parser']).toContain(r.source);
        expect(r.entities.dish).toBe('Vege Burger');
        // quantity may be on entities.quantity (dish_guard) or entities.items[0].quantity (compound_parser)
        const qty = r.entities.quantity ?? r.entities.items?.[0]?.quantity;
        expect(qty).toBe(2);
    });

    it('G1-12 "poproszę bacon burgera" CALLZONE session → create_order via dish_guard', async () => {
        const r = await runRouter('poproszę bacon burgera', CALLZONE_SESSION);
        expect(r.intent).toBe('create_order');
        expect(r.source).toBe('dish_guard');
        expect(r.entities.dish).toBe('Bacon Burger');
    });

    it('G1-13 "zamawiam" CALLZONE_NO_MENU → create_order via lexical_override', async () => {
        const r = await runRouter('zamawiam', CALLZONE_NO_MENU);
        expect(r.intent).toBe('create_order');
        expect(r.source).toBe('lexical_override');
    });

    it('G1-14 "gdzie zjem w Gliwicach" with currentRestaurant → find_nearby (restaurant_navigation_override)', async () => {
        // isExplicitRestaurantSearch matches "gdzie zjem" phrase
        const r = await runRouter('gdzie zjem w Gliwicach', CALLZONE_NO_MENU);
        expect(r.intent).toBe('find_nearby');
        expect(r.source).toBe('restaurant_navigation_override');
    });

    it('G1-15 "gdzie zjem w Bytomiu" no ctx → find_nearby', async () => {
        const r = await runRouter('gdzie zjem w Bytomiu');
        expect(r.intent).toBe('find_nearby');
    });
});

// ════════════════════════════════════════════════════════════════════════════
// G2 — Confirmation contexts (10 cases)
// ════════════════════════════════════════════════════════════════════════════

describe('G2 — Confirmation contexts', () => {

    it('G2-01 "tak" + expectedContext=confirm_order → confirm_order (rule_guard)', async () => {
        const r = await runRouter('tak', CONFIRM_ORDER_SESSION);
        expect(r.intent).toBe('confirm_order');
        expect(r.source).toBe('rule_guard');
    });

    it('G2-02 "ok" + expectedContext=confirm_order → confirm_order (rule_guard)', async () => {
        const r = await runRouter('ok', CONFIRM_ORDER_SESSION);
        expect(r.intent).toBe('confirm_order');
        expect(r.source).toBe('rule_guard');
    });

    it('G2-03 "potwierdzam" + expectedContext=confirm_order → confirm_order (rule_guard)', async () => {
        const r = await runRouter('potwierdzam', CONFIRM_ORDER_SESSION);
        expect(r.intent).toBe('confirm_order');
        expect(r.source).toBe('rule_guard');
    });

    it('G2-04 "nie" + expectedContext=confirm_order → cancel_order (rule_guard)', async () => {
        const r = await runRouter('nie', CONFIRM_ORDER_SESSION);
        expect(r.intent).toBe('cancel_order');
        expect(r.source).toBe('rule_guard');
    });

    it('G2-05 "anuluj" + expectedContext=confirm_order → cancel_order (rule_guard)', async () => {
        const r = await runRouter('anuluj', CONFIRM_ORDER_SESSION);
        expect(r.intent).toBe('cancel_order');
        expect(r.source).toBe('rule_guard');
    });

    it('G2-06 "tak" + expectedContext=confirm_add_to_cart → confirm_add_to_cart (rule_guard)', async () => {
        const r = await runRouter('tak', CONFIRM_ADD_TO_CART_SESSION);
        expect(r.intent).toBe('confirm_add_to_cart');
        expect(r.source).toBe('rule_guard');
    });

    it('G2-07 "dawaj" + expectedContext=confirm_add_to_cart → confirm_add_to_cart (rule_guard)', async () => {
        const r = await runRouter('dawaj', CONFIRM_ADD_TO_CART_SESSION);
        expect(r.intent).toBe('confirm_add_to_cart');
        expect(r.source).toBe('rule_guard');
    });

    it('G2-08 "nie" + expectedContext=confirm_add_to_cart → cancel_order (rule_guard)', async () => {
        const r = await runRouter('nie', CONFIRM_ADD_TO_CART_SESSION);
        expect(r.intent).toBe('cancel_order');
        expect(r.source).toBe('rule_guard');
    });

    it('G2-09 "tak" + expectedContext=confirm_restaurant → select_restaurant (rule_guard)', async () => {
        const r = await runRouter('tak', CONFIRM_RESTAURANT_SESSION);
        expect(r.intent).toBe('select_restaurant');
        expect(r.source).toBe('rule_guard');
    });

    it('G2-10 "tak" no expectedContext, no ordering phase → confirm (generic_confirm)', async () => {
        const r = await runRouter('tak', {});
        expect(r.intent).toBe('confirm');
        expect(r.source).toBe('generic_confirm');
    });
});

// ════════════════════════════════════════════════════════════════════════════
// G3 — Checkout bridge adversarial (10 cases)
// ════════════════════════════════════════════════════════════════════════════

describe('G3 — Checkout bridge adversarial', () => {

    it('G3-01 "koszyk" alone → open_checkout (anchored regex)', async () => {
        const r = await runRouter('koszyk');
        expect(r.intent).toBe('open_checkout');
        expect(r.source).toBe('explicit_checkout_bridge');
    });

    it('G3-02 "zamówienie" alone → open_checkout (anchored regex)', async () => {
        const r = await runRouter('zamówienie');
        expect(r.intent).toBe('open_checkout');
        expect(r.source).toBe('explicit_checkout_bridge');
    });

    it('G3-03 "pokaż koszyk" → open_checkout', async () => {
        const r = await runRouter('pokaż koszyk');
        expect(r.intent).toBe('open_checkout');
        expect(r.source).toBe('explicit_checkout_bridge');
    });

    it('G3-04 "przejdź do płatności" → open_checkout (platnosc regex)', async () => {
        // "platnosc\w*" in checkout regex matches "platnosci"
        const r = await runRouter('przejdź do płatności');
        expect(r.intent).toBe('open_checkout');
        expect(r.source).toBe('explicit_checkout_bridge');
    });

    it('G3-05 "zapłać" → open_checkout', async () => {
        const r = await runRouter('zapłać');
        expect(r.intent).toBe('open_checkout');
        expect(r.source).toBe('explicit_checkout_bridge');
    });

    it('G3-06 "checkout" → open_checkout', async () => {
        const r = await runRouter('checkout');
        expect(r.intent).toBe('open_checkout');
        expect(r.source).toBe('explicit_checkout_bridge');
    });

    it('G3-07 "menu" with currentRestaurant → menu_request NOT open_checkout (explicit_menu_override wins)', async () => {
        const r = await runRouter('menu', CALLZONE_SESSION);
        expect(r.intent).toBe('menu_request');
        expect(r.intent).not.toBe('open_checkout');
    });

    it('G3-08 "pokaż menu" with currentRestaurant → menu_request NOT open_checkout', async () => {
        const r = await runRouter('pokaż menu', CALLZONE_SESSION);
        expect(r.intent).toBe('menu_request');
        expect(r.source).toBe('explicit_menu_override');
    });

    it('G3-09 "pokaż menu koszyk" with currentRestaurant → menu_request (explicit_menu_override fires before checkout bridge)', async () => {
        const r = await runRouter('pokaż menu koszyk', CALLZONE_SESSION);
        expect(r.intent).toBe('menu_request');
        expect(r.intent).not.toBe('open_checkout');
    });

    it('G3-10 "dodaj do koszyka burger" no ctx → find_nearby NOT open_checkout', async () => {
        const r = await runRouter('dodaj do koszyka burger');
        expect(r.intent).toBe('find_nearby');
        expect(r.intent).not.toBe('open_checkout');
    });
});

// ════════════════════════════════════════════════════════════════════════════
// G4 — Catalog aliases + cuisine discovery (10 cases)
// ════════════════════════════════════════════════════════════════════════════

describe('G4 — Catalog aliases and cuisine discovery', () => {

    it('G4-01 "lawasz" no ctx → select_restaurant (alias match for LAWASZ KEBAB)', async () => {
        const r = await runRouter('lawasz');
        expect(r.intent).toBe('select_restaurant');
        expect(r.source).toBe('catalog_match_explicit');
        expect(r.entities.restaurant).toBe('LAWASZ KEBAB');
    });

    it('G4-02 "monte carlo" no ctx → select_restaurant (alias for Pizzeria Monte Carlo)', async () => {
        const r = await runRouter('monte carlo');
        expect(r.intent).toBe('select_restaurant');
        expect(r.source).toBe('catalog_match_explicit');
        expect(r.entities.restaurant).toBe('Pizzeria Monte Carlo');
    });

    it('G4-03 "klaps" no ctx → select_restaurant (alias for Klaps Burgers)', async () => {
        const r = await runRouter('klaps');
        expect(r.intent).toBe('select_restaurant');
        expect(r.source).toBe('catalog_match_explicit');
        expect(r.entities.restaurant).toBe('Klaps Burgers');
    });

    it('G4-04 "hubertus" no ctx → select_restaurant (alias for Dwór Hubertus)', async () => {
        const r = await runRouter('hubertus');
        expect(r.intent).toBe('select_restaurant');
        expect(r.source).toBe('catalog_match_explicit');
        expect(r.entities.restaurant).toBe('Dwór Hubertus');
    });

    it('G4-05 "praga" no ctx → select_restaurant (alias for Bar Praha)', async () => {
        const r = await runRouter('praga');
        expect(r.intent).toBe('select_restaurant');
        expect(r.source).toBe('catalog_match_explicit');
        expect(r.entities.restaurant).toBe('Bar Praha');
    });

    it('G4-06 "tasty king" no ctx → select_restaurant (alias for Tasty King Kebab)', async () => {
        const r = await runRouter('tasty king');
        expect(r.intent).toBe('select_restaurant');
        expect(r.source).toBe('catalog_match_explicit');
        expect(r.entities.restaurant).toBe('Tasty King Kebab');
    });

    it('G4-07 "kamienica" no ctx → select_restaurant (alias for Restauracja Stara Kamienica)', async () => {
        const r = await runRouter('kamienica');
        expect(r.intent).toBe('select_restaurant');
        expect(r.source).toBe('catalog_match_explicit');
        expect(r.entities.restaurant).toBe('Restauracja Stara Kamienica');
    });

    it('G4-08 "rezydencja" no ctx → select_restaurant (alias for Rezydencja Luxury Hotel)', async () => {
        const r = await runRouter('rezydencja');
        expect(r.intent).toBe('select_restaurant');
        expect(r.source).toBe('catalog_match_explicit');
        expect(r.entities.restaurant).toBe('Rezydencja Luxury Hotel');
    });

    it('G4-09 "ramen" no ctx → find_nearby (food_word_fallback)', async () => {
        const r = await runRouter('ramen');
        expect(r.intent).toBe('find_nearby');
        expect(r.source).toBe('food_word_fallback');
    });

    it('G4-10 "kalzone" no ctx → select_restaurant (alias for Callzone)', async () => {
        const r = await runRouter('kalzone');
        expect(r.intent).toBe('select_restaurant');
        expect(r.source).toBe('catalog_match_explicit');
        expect(r.entities.restaurant).toBe('Callzone');
    });
});

// ════════════════════════════════════════════════════════════════════════════
// G5 — Menu request collisions (5 cases)
// ════════════════════════════════════════════════════════════════════════════

describe('G5 — Menu request collisions', () => {

    it('G5-01 "menu" no ctx → menu_request (regex_v2 — standalone menu keyword)', async () => {
        const r = await runRouter('menu');
        expect(r.intent).toBe('menu_request');
        expect(r.source).toBe('regex_v2');
    });

    it('G5-02 "pokaż menu" no ctx → menu_request (regex_v2)', async () => {
        const r = await runRouter('pokaż menu');
        expect(r.intent).toBe('menu_request');
    });

    it('G5-03 "co macie" with currentRestaurant → menu_request (explicit_menu_override)', async () => {
        const r = await runRouter('co macie', CALLZONE_SESSION);
        expect(r.intent).toBe('menu_request');
        expect(r.source).toBe('explicit_menu_override');
    });

    it('G5-04 "pokaż menu koszyk" with currentRestaurant → menu_request NOT checkout (menu fires first)', async () => {
        const r = await runRouter('pokaż menu koszyk', CALLZONE_SESSION);
        expect(r.intent).toBe('menu_request');
        expect(r.source).toBe('explicit_menu_override');
        expect(r.intent).not.toBe('open_checkout');
    });

    it('G5-05 "pokaż kartę" with currentRestaurant → menu_request (explicit_menu_override)', async () => {
        const r = await runRouter('pokaż kartę', CALLZONE_SESSION);
        expect(r.intent).toBe('menu_request');
        expect(r.source).toBe('explicit_menu_override');
    });
});
