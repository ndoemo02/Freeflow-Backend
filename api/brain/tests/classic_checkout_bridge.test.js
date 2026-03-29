import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectIntent } from '../intent-router.js';

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
            }),
        })),
    },
}));

const CART_PHRASES = [
    'chciałbym podejrzeć koszyk',
    'chcialbym podejrzec koszyk',
    'podejrzyj zamowienie',
    'pokaż koszyk',
    'koszyk',
];

describe('classic intent-router checkout bridge', () => {
    beforeEach(() => {
        global.BRAIN_DEBUG = false;
    });

    it.each(CART_PHRASES)('"%s" -> open_checkout', async (phrase) => {
        const result = await detectIntent(phrase, {});
        expect(result.intent).toBe('open_checkout');
        expect(result.source).toBe('explicit_checkout_bridge_classic');
    });

    it('"dodaj do koszyka burger" must not map to open_checkout', async () => {
        const result = await detectIntent('dodaj do koszyka burger', {});
        expect(result.intent).not.toBe('open_checkout');
    });
});

