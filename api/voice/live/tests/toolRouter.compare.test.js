import { describe, expect, it, vi } from 'vitest';
import { ToolRouter } from '../ToolRouter.js';

function createHarness(initialSession = {}, compareProvider = null) {
    const sessions = new Map();
    sessions.set('sess_compare', {
        cart: { items: [], total: 0 },
        orderMode: 'neutral',
        ...initialSession,
    });

    const getSession = (sessionId) => sessions.get(sessionId) || {};
    const updateSession = (sessionId, patch) => {
        const current = sessions.get(sessionId) || {};
        Object.assign(current, patch);
        sessions.set(sessionId, current);
        return current;
    };

    const router = new ToolRouter({
        pipeline: { handlers: {} },
        handlers: {},
        getSession,
        updateSession,
        compareProvider: compareProvider || vi.fn(async () => ({
            ok: true,
            reply: 'Porownanie gotowe.',
            restaurants: [
                { id: 'r1', name: 'Rest 1', city: 'Piekary Slaskie', comparison_items: [{ name: 'Pierogi', price_pln: 20 }] },
                { id: 'r2', name: 'Rest 2', city: 'Piekary Slaskie', comparison_items: [{ name: 'Pierogi', price_pln: 22 }] },
            ],
            comparison: { query: 'pierogi', city: 'Piekary Slaskie', metric: 'best_match' },
            candidateCount: 2,
            topMatch: 'Pierogi',
            score: 1.12,
        })),
    });

    return { router, sessions, getSession };
}

describe('ToolRouter compare_restaurants', () => {
    it('executes compare tool via injected provider and returns find_nearby-shaped response', async () => {
        const compareProvider = vi.fn(async () => ({
            ok: true,
            reply: 'Porownanie gotowe.',
            restaurants: [
                { id: 'r1', name: 'Rest 1', city: 'Piekary Slaskie', comparison_items: [{ name: 'Pierogi', price_pln: 20 }] },
                { id: 'r2', name: 'Rest 2', city: 'Piekary Slaskie', comparison_items: [{ name: 'Pierogi', price_pln: 22 }] },
            ],
            comparison: { query: 'pierogi', city: 'Piekary Slaskie', metric: 'best_match' },
            candidateCount: 2,
            topMatch: 'Pierogi',
            score: 1.12,
        }));
        const { router, getSession } = createHarness({}, compareProvider);

        const result = await router.executeToolCall({
            sessionId: 'sess_compare',
            toolName: 'compare_restaurants',
            args: { query: 'pierogi', metric: 'best_match' },
            requestId: 'req_cmp_1',
        });

        expect(compareProvider).toHaveBeenCalledTimes(1);
        expect(result.ok).toBe(true);
        expect(result.response.intent).toBe('find_nearby');
        expect(result.response.restaurants).toHaveLength(2);
        expect(result.response.meta?.source).toBe('live_tool:compare_restaurants');
        expect(result.trace.some((entry) => entry.includes('compare_restaurants:executed'))).toBe(true);

        const session = getSession('sess_compare');
        expect(session.expectedContext).toBe('select_restaurant');
        expect(session.lastIntent).toBe('find_nearby');
        expect(Array.isArray(session.last_restaurants_list)).toBe(true);
        expect(session.last_restaurants_list).toHaveLength(2);
    });

    it('keeps response safe when compare returns empty list', async () => {
        const compareProvider = vi.fn(async () => ({
            ok: true,
            reply: 'Nie znaleziono dopasowan.',
            restaurants: [],
            comparison: { query: 'xyz', city: 'Piekary Slaskie', metric: 'best_match', results: [] },
            candidateCount: 0,
            topMatch: null,
            score: 0,
        }));
        const { router, getSession } = createHarness({}, compareProvider);

        const result = await router.executeToolCall({
            sessionId: 'sess_compare',
            toolName: 'compare_restaurants',
            args: { query: 'xyz' },
            requestId: 'req_cmp_2',
        });

        expect(result.ok).toBe(true);
        expect(result.response.restaurants).toHaveLength(0);
        expect(result.response.reply).toContain('Nie znaleziono');
        const session = getSession('sess_compare');
        expect(session.expectedContext).toBeNull();
        expect(session.lastIntent).toBe('find_nearby');
    });

    it('auto-routes find_nearby with compare cues to compare provider', async () => {
        const compareProvider = vi.fn(async ({ args }) => ({
            ok: true,
            reply: 'Porownanie pierogow gotowe.',
            restaurants: [
                { id: 'r1', name: 'Rest 1', city: 'Piekary Slaskie', comparison_items: [{ name: 'Pierogi ruskie', price_pln: 18 }] },
                { id: 'r2', name: 'Rest 2', city: 'Piekary Slaskie', comparison_items: [{ name: 'Pierogi miesne', price_pln: 20 }] },
            ],
            comparison: {
                query: args?.query || null,
                category: args?.category || null,
                city: args?.city || 'Piekary Slaskie',
                metric: args?.metric || 'best_match',
            },
            candidateCount: 2,
            topMatch: 'Pierogi ruskie',
            score: 0.98,
        }));
        const { router } = createHarness({}, compareProvider);

        const result = await router.executeToolCall({
            sessionId: 'sess_compare',
            toolName: 'find_nearby',
            args: {
                cuisine: 'pierogi',
                location: 'Piekary Slaskie',
            },
            transcript: 'Porownaj pierogi w 3 restauracjach, po 2 dania',
            requestId: 'req_cmp_3',
        });

        expect(compareProvider).toHaveBeenCalledTimes(1);
        const [{ args: compareArgs }] = compareProvider.mock.calls[0];
        expect(compareArgs.query).toBe('pierogi');
        expect(compareArgs.city).toBe('Piekary Slaskie');
        expect(compareArgs.max_restaurants).toBe(3);
        expect(compareArgs.max_items_per_restaurant).toBe(2);
        expect(result.response.meta?.source).toBe('live_tool:compare_restaurants');
        expect(result.trace).toContain('live_find_autoroute:compare_restaurants');
    });

    it('auto-routes dish-like cuisine (pierogi) to compare on first discovery turn', async () => {
        const compareProvider = vi.fn(async ({ args }) => ({
            ok: true,
            reply: 'Znalazlam pierogi w kilku restauracjach.',
            restaurants: [
                { id: 'r1', name: 'Rest 1', city: 'Piekary Slaskie', comparison_items: [{ name: 'Pierogi ruskie', price_pln: 18 }] },
                { id: 'r2', name: 'Rest 2', city: 'Piekary Slaskie', comparison_items: [{ name: 'Pierogi z miesem', price_pln: 20 }] },
            ],
            comparison: {
                query: args?.query || null,
                category: args?.category || null,
                city: args?.city || 'Piekary Slaskie',
                metric: args?.metric || 'best_match',
            },
            candidateCount: 2,
            topMatch: 'Pierogi ruskie',
            score: 0.95,
        }));
        const { router } = createHarness({}, compareProvider);

        const result = await router.executeToolCall({
            sessionId: 'sess_compare',
            toolName: 'find_nearby',
            args: {
                cuisine: 'Pierogi',
                lat: 50.3951,
                lng: 18.9587,
            },
            transcript: 'Gdzie znajde pierogi w Piekarach',
            requestId: 'req_cmp_5',
        });

        expect(compareProvider).toHaveBeenCalledTimes(1);
        const [{ args: compareArgs }] = compareProvider.mock.calls[0];
        expect(compareArgs.query).toBe('Pierogi');
        expect(result.response.meta?.source).toBe('live_tool:compare_restaurants');
        expect(result.trace).toContain('live_find_autoroute:compare_restaurants');
    });

    it('uses session pendingDish when compare follow-up is generic ("porownaj ceny miedzy nimi")', async () => {
        const compareProvider = vi.fn(async ({ args }) => ({
            ok: true,
            reply: 'Porownanie cen gotowe.',
            restaurants: [
                { id: 'r1', name: 'Rest 1', city: 'Piekary Slaskie', comparison_items: [{ name: 'Pierogi ruskie', price_pln: 18 }] },
                { id: 'r2', name: 'Rest 2', city: 'Piekary Slaskie', comparison_items: [{ name: 'Pierogi z miesem', price_pln: 21 }] },
            ],
            comparison: {
                query: args?.query || null,
                category: args?.category || null,
                city: args?.city || 'Piekary Slaskie',
                metric: args?.metric || 'best_match',
            },
            candidateCount: 2,
            topMatch: 'Pierogi ruskie',
            score: 1.01,
        }));
        const { router } = createHarness(
            {
                pendingDish: 'pierogi',
                last_restaurants_list: [
                    { id: 'r1', name: 'Rest 1', city: 'Piekary Slaskie' },
                    { id: 'r2', name: 'Rest 2', city: 'Piekary Slaskie' },
                ],
            },
            compareProvider,
        );

        const result = await router.executeToolCall({
            sessionId: 'sess_compare',
            toolName: 'find_nearby',
            args: {
                location: 'Piekary Slaskie',
            },
            transcript: 'Porownaj ceny miedzy nimi',
            requestId: 'req_cmp_4',
        });

        expect(compareProvider).toHaveBeenCalledTimes(1);
        const [{ args: compareArgs }] = compareProvider.mock.calls[0];
        expect(compareArgs.query).toBe('pierogi');
        expect(compareArgs.metric).toBe('lowest_price');
        expect(compareArgs.city).toBe('Piekary Slaskie');
        expect(result.response.meta?.source).toBe('live_tool:compare_restaurants');
    });
});
