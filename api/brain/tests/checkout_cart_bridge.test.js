/**
 * Regression: cart/checkout command bridge in NLU router.
 * Phrases like "przejdźmy do koszyka" must map to open_checkout,
 * NOT clarify_order / "Nie rozumiem tego polecenia."
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NLURouter } from '../nlu/router.js';

vi.mock('../../_supabase.js', () => ({
    supabase: {
        from: vi.fn(() => ({
            select: vi.fn(() => {
                const responseBase = { data: [], error: null };
                const queryBuilder = Promise.resolve(responseBase);
                queryBuilder.eq = vi.fn().mockReturnValue(Promise.resolve(responseBase));
                queryBuilder.in = vi.fn().mockReturnValue(Promise.resolve(responseBase));
                queryBuilder.limit = vi.fn().mockReturnValue(Promise.resolve(responseBase));
                return queryBuilder;
            })
        }))
    }
}));

const CART_PHRASES = [
    'przejdźmy do koszyka',
    'przejdz do koszyka',
    'przejdzmy do koszyka',
    'przejdź do koszyka',
    'pokaz koszyk',
    'pokaż koszyk',
    'koszyk',
    'checkout',
    'kasa',
    'płatność',
    'platnosc',
];

const NOT_CHECKOUT_PHRASES = [
    { text: 'dodaj do koszyka burger', expected: 'create_order' },
];

describe('checkout/cart command bridge', () => {
    beforeEach(() => {
        global.BRAIN_DEBUG = false;
        process.env.USE_LLM_INTENT = 'false';
    });

    it.each(CART_PHRASES)(
        '"%s" → open_checkout (source: explicit_checkout_bridge)',
        async (phrase) => {
            const nlu = new NLURouter();
            const result = await nlu.detect({
                text: phrase,
                body: { text: phrase },
                session: {}
            });

            expect(result.intent).toBe('open_checkout');
            expect(result.source).toBe('explicit_checkout_bridge');
        }
    );

    it('"dodaj do koszyka burger" must NOT trigger open_checkout', async () => {
        const nlu = new NLURouter();
        const result = await nlu.detect({
            text: 'dodaj do koszyka burger',
            body: { text: 'dodaj do koszyka burger' },
            session: {}
        });

        expect(result.intent).not.toBe('open_checkout');
    });
});
