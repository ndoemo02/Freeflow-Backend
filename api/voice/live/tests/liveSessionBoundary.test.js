import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), touch: vi.fn() }));
vi.mock('../../../brain/session/sessionAdapter.js', () => ({
    loadSession: mocks.load, saveSession: mocks.save, touchSession: mocks.touch,
}));

const sessionId = 'sess_live_durable';
let durable;
const originalSession = () => ({
    status: 'active', currentRestaurant: { id: 'demo_krakow', name: 'Demo Krakow' },
    lastMenu: [{ id: 'menu_1', name: 'Pierogi' }], last_menu_restaurant_id: 'demo_krakow',
    demoScenarioId: 'krakow-tourist', demoDatasetId: 'krakow-v1', preferredLocale: 'en',
    demoContext: { scenarioId: 'krakow-tourist', preferredLocale: 'en', source: 'query' },
});

beforeEach(() => {
    vi.resetModules();
    durable = structuredClone(originalSession());
    mocks.load.mockReset().mockImplementation(async () => ({ data: structuredClone(durable) }));
    mocks.save.mockReset().mockImplementation(async ({ data }) => {
        durable = structuredClone(data);
        return { data, updated_at: new Date().toISOString() };
    });
    mocks.touch.mockReset().mockResolvedValue(null);
});
afterEach(() => vi.resetModules());

describe('durable Live session boundary', () => {
    it('waits for an older asynchronous hydration before publishing the durable patch', async () => {
        const store = await import('../../../brain/session/sessionStore.js');
        const { prepareLiveSession } = await import('../liveSessionBoundary.js');
        let release;
        mocks.load.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
        const legacyRead = store.getSessionAsync(sessionId);
        const preparation = prepareLiveSession(sessionId, { demo_context: { preferred_locale: 'pl' } });
        await new Promise(resolve => setImmediate(resolve));
        const readsBeforeRelease = mocks.load.mock.calls.length;
        release({ data: originalSession() });
        await Promise.all([legacyRead, preparation]);
        expect(readsBeforeRelease).toBe(1);
        expect(store.getSession(sessionId).preferredLocale).toBe('pl');
        expect(durable.preferredLocale).toBe('pl');
    });

    it('hydrates before merging snake_case demo context, even after a legacy optimistic read', async () => {
        const store = await import('../../../brain/session/sessionStore.js');
        store.getSession(sessionId);
        const { prepareLiveSession } = await import('../liveSessionBoundary.js');
        const session = await prepareLiveSession(sessionId, {
            demo_context: { scenario_id: 'krakow-tourist', preferred_locale: 'pl', source: 'launch' },
        });
        expect(session.currentRestaurant).toEqual(originalSession().currentRestaurant);
        expect(session.lastMenu).toEqual(originalSession().lastMenu);
        expect(session.demoDatasetId).toBe('krakow-v1');
        expect(session.preferredLocale).toBe('pl');
        expect(mocks.load).toHaveBeenCalledWith(sessionId, { requireDurable: true });
        expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ id: sessionId }), { requireDurable: true });
    });

    it('keeps persisted scenario and locale when the next fresh instance omits context', async () => {
        const { prepareLiveSession } = await import('../liveSessionBoundary.js');
        await prepareLiveSession(sessionId, {});
        vi.resetModules();
        const fresh = await import('../liveSessionBoundary.js');
        expect(await fresh.prepareLiveSession(sessionId, {})).toMatchObject({
            ...originalSession(), demoContext: expect.objectContaining({ datasetId: 'krakow-v1' }),
        });
    });

    it.each([{}, { preferred_locale: 'pl' }])('merges a partial context without resetting the persisted scenario: %j', async (demo_context) => {
        const { prepareLiveSession } = await import('../liveSessionBoundary.js');
        expect(await prepareLiveSession(sessionId, { demo_context })).toMatchObject({
            demoDatasetId: 'krakow-v1', preferredLocale: demo_context.preferred_locale || 'en',
        });
    });

    it('fails closed on an inconsistent persisted dataset', async () => {
        durable.demoDatasetId = 'piekary-v1';
        const { prepareLiveSession } = await import('../liveSessionBoundary.js');
        await expect(prepareLiveSession(sessionId, {})).rejects.toMatchObject({ code: 'live_session_unavailable' });
        expect(mocks.save).not.toHaveBeenCalled();
    });

    it.each([null, [], 'krakow-tourist', { scenario_id: 'unknown' }, { preferred_locale: 'xx' }])(
        'rejects invalid supplied context before touching storage: %j', async (demo_context) => {
            const { prepareLiveSession } = await import('../liveSessionBoundary.js');
            await expect(prepareLiveSession(sessionId, { demo_context })).rejects.toMatchObject({
                code: 'invalid_demo_context', statusCode: 400,
            });
            expect(mocks.load).not.toHaveBeenCalled();
            expect(mocks.save).not.toHaveBeenCalled();
        },
    );

    it.each(['load', 'save'])('fails closed on %s failure and does not poison the next hydration', async (operation) => {
        const { prepareLiveSession } = await import('../liveSessionBoundary.js');
        mocks[operation].mockRejectedValueOnce(new Error('storage unavailable'));
        await expect(prepareLiveSession(sessionId, {})).rejects.toMatchObject({
            code: 'live_session_unavailable', statusCode: 503,
        });
        expect(await prepareLiveSession(sessionId, {})).toMatchObject({ demoDatasetId: 'krakow-v1' });
    });

    it('waits for durable persistence before returning a usable session', async () => {
        const { prepareLiveSession } = await import('../liveSessionBoundary.js');
        let release;
        mocks.save.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
        let finished = false;
        const pending = prepareLiveSession(sessionId, {}).then(() => { finished = true; });
        await vi.waitFor(() => expect(release).toBeTypeOf('function'));
        expect(finished).toBe(false);
        release({ updated_at: new Date().toISOString() });
        await pending;
        expect(finished).toBe(true);
    });
});
