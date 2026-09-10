vi.mock('../../../brain/session/sessionAccess.js', async importOriginal => ({ ...(await importOriginal()), requireSessionAccess: mocks.access }));
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), execute: vi.fn(), token: vi.fn(), fetch: vi.fn(), access: vi.fn() }));
vi.mock('../../../brain/session/sessionAdapter.js', () => ({
    loadSession: mocks.load, saveSession: mocks.save, touchSession: vi.fn(async () => null),
}));
vi.mock('../../../_cors.js', () => ({ applyCORS: () => false }));
vi.mock('../../../config/configService.js', () => ({ getConfig: async () => ({ live_model: 'gemini-live-test' }) }));
vi.mock('../ToolRouter.js', () => ({ ToolRouter: class { executeToolCall(args) { return mocks.execute(args); } } }));
vi.mock('@google/genai', () => ({ GoogleGenAI: class { authTokens = { create: mocks.token }; } }));
vi.mock('ws', () => ({ WebSocketServer: class {
    constructor(options) { this.options = options; }
    clients = new Set();
    handlers = {};
    on(name, callback) { this.handlers[name] = callback; }
} }));

const sessionId = 'sess_route_durable';
const context = { scenario_id: 'krakow-tourist', preferred_locale: 'en', source: 'launch' };
const storedSession = () => ({
    status: 'active', currentRestaurant: { id: 'demo_krakow', name: 'Demo Krakow' },
    lastMenu: [{ id: 'menu_1', name: 'Pierogi' }], demoScenarioId: 'krakow-tourist',
    demoDatasetId: 'krakow-v1', demoContext: { scenarioId: 'krakow-tourist', preferredLocale: 'en', source: 'launch' },
});
let durable;
let gateway;
function response() {
    return {
        statusCode: 200, body: null, setHeader() {}, end() { return this; },
        status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; },
    };
}
function request(body = {}) {
    return { method: 'POST', headers: { origin: 'http://localhost:5173' }, body: { session_id: sessionId, ...body } };
}
async function httpHandler(transport) {
    if (transport === 'express') {
        const routes = {};
        const { registerLiveRoutes } = await import('../index.js');
        registerLiveRoutes({ post(path, handler) { routes[path] = handler; }, get() {}, options() {} });
        return routes['/api/voice/live/tool-call'];
    }
    return (await import(`../${transport}.js`)).default;
}

beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('LIVE_MODE', 'true');
    vi.stubEnv('GOOGLE_API_KEY', 'test-only');
    vi.stubEnv('OPENAI_API_KEY', 'test-only');
    vi.stubEnv('OPENAI_REALTIME_FALLBACK_ENABLED', 'true');
    vi.stubEnv('LIVE_INTERNAL_KEY', '');
    mocks.access.mockReset().mockResolvedValue({ userId: 'test-user' });
    durable = storedSession();
    mocks.load.mockReset().mockImplementation(async () => ({ data: structuredClone(durable) }));
    mocks.save.mockReset().mockImplementation(async ({ data }) => {
        durable = structuredClone(data);
        return { updated_at: new Date().toISOString() };
    });
    mocks.execute.mockReset().mockImplementation(async ({ sessionId: id }) => {
        const { getSession, updateSession } = await import('../../../brain/session/sessionStore.js');
        const snapshot = structuredClone(getSession(id));
        updateSession(id, { lastMenu: [{ id: 'menu_2', name: 'Soup' }] });
        return { ok: true, response: { snapshot } };
    });
    mocks.token.mockReset().mockResolvedValue({ name: 'ephemeral-test' });
    mocks.fetch.mockReset().mockImplementation(async () => new Response('{"value":"ephemeral-test"}', { status: 200 }));
    vi.stubGlobal('fetch', mocks.fetch);
});
afterEach(() => {
    if (gateway?._keepaliveInterval) clearInterval(gateway._keepaliveInterval);
    gateway = null;
    vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules();
});

describe.each(['tool-call', 'express'])('%s durable tool boundary', (transport) => {
    it.each(['token', 'openai-session'])('preserves restaurant, menu and demo dataset across fresh %s -> tool instances', async (credentialRoute) => {
        const mint = await httpHandler(credentialRoute);
        const minted = response();
        await mint(request({ demo_context: context }), minted);
        expect(minted.statusCode).toBe(200);
        vi.resetModules(); // Models independent serverless module caches; adapter data survives.
        const execute = await httpHandler(transport);
        const result = response();
        await execute(request({ tool: 'get_cart_state' }), result);
        expect(result.statusCode).toBe(200);
        expect(result.body.response.snapshot).toMatchObject(storedSession());
        vi.resetModules();
        const { prepareLiveSession } = await import('../liveSessionBoundary.js');
        expect(await prepareLiveSession(sessionId, {})).toMatchObject({ lastMenu: [{ id: 'menu_2', name: 'Soup' }], demoDatasetId: 'krakow-v1' });
    });

    it('reads and persists snake_case demo_context before executing the tool', async () => {
        durable = { currentRestaurant: storedSession().currentRestaurant, lastMenu: storedSession().lastMenu };
        const handler = await httpHandler(transport);
        const res = response();
        await handler(request({ tool: 'get_cart_state', demo_context: context }), res);
        expect(res.statusCode).toBe(200);
        expect(res.body.response.snapshot).toMatchObject({ demoDatasetId: 'krakow-v1', preferredLocale: 'en' });
    });

    it('does not return tool data if its final durable checkpoint fails', async () => {
        const handler = await httpHandler(transport);
        mocks.execute.mockImplementationOnce(async () => {
            mocks.save.mockRejectedValueOnce(new Error('private checkpoint detail'));
            return { ok: true, response: { restaurants: ['must not escape'] } };
        });
        const res = response();
        await handler(request({ tool: 'get_cart_state' }), res);
        expect(res.statusCode).toBe(503);
        expect(res.body).toEqual({ ok: false, error: 'live_session_unavailable' });
    });
});

describe.each(['token', 'openai-session', 'tool-call', 'express'])('%s fail-closed boundary', (transport) => {
    it.each([401, 403, 503])('does not hydrate, mint credentials or run tools after access denial %s', async (statusCode) => {
        const code = statusCode === 401 ? 'unauthorized' : statusCode === 403 ? 'session_not_owned' : 'session_unavailable';
        mocks.access.mockRejectedValueOnce(Object.assign(new Error(code), { code, statusCode }));
        const handler = await httpHandler(transport);
        const res = response();
        await handler(request({ tool: 'get_cart_state' }), res);
        expect(res.statusCode).toBe(statusCode);
        expect(mocks.load).not.toHaveBeenCalled();
        expect(mocks.execute).not.toHaveBeenCalled();
        expect(mocks.token).not.toHaveBeenCalled();
        expect(mocks.fetch).not.toHaveBeenCalled();
    });

    it.each(['invalid', 'load', 'save'])('stops before provider/tool invocation on %s failure', async (failure) => {
        const handler = await httpHandler(transport);
        if (failure !== 'invalid') mocks[failure].mockRejectedValue(new Error('private database detail'));
        const res = response();
        await handler(request({ tool: 'get_cart_state', demo_context: failure === 'invalid' ? { scenario_id: 'unknown' } : context }), res);
        expect(res.statusCode).toBe(failure === 'invalid' ? 400 : 503);
        expect(res.body.error).toBe(failure === 'invalid' ? 'invalid_demo_context' : 'live_session_unavailable');
        expect(JSON.stringify(res.body)).not.toContain('private database detail');
        expect(mocks.execute).not.toHaveBeenCalled();
        expect(mocks.token).not.toHaveBeenCalled();
        expect(mocks.fetch).not.toHaveBeenCalled();
    });
});

async function socketFixture() {
    const { GeminiLiveGateway } = await import('../GeminiLiveGateway.js');
    gateway = new GeminiLiveGateway({ toolRouter: { executeToolCall: mocks.execute }, isLiveEnabled: () => true });
    const server = gateway.attach({});
    const socket = { readyState: 1, handlers: {}, sent: [], on(name, cb) { this.handlers[name] = cb; }, send(payload) { this.sent.push(JSON.parse(payload)); }, close: vi.fn() };
    const req = { url: `/?session_id=${sessionId}`, headers: { origin: 'http://localhost:5173' } };
    await new Promise(resolve => server.options.verifyClient({ req }, resolve));
    await server.handlers.connection(socket, req);
    return { socket, send: (payload) => socket.handlers.message(Buffer.from(JSON.stringify(payload))) };
}

describe('Gemini gateway durable boundary', () => {
    it.each(['tool-call', 'express', 'token', 'openai-session'])('keeps %s behind an active WS tool in the same process', async (transport) => {
        const { send } = await socketFixture();
        const handler = await httpHandler(transport);
        let release;
        mocks.execute.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
        const ws = send({ type: 'tool_call', tool: 'get_cart_state', args: {} });
        await vi.waitFor(() => expect(release).toBeTypeOf('function'));
        const res = response();
        const http = handler(request({ tool: 'get_cart_state' }), res);
        await new Promise(resolve => setImmediate(resolve));
        const whileBlocked = [mocks.load.mock.calls.length, mocks.execute.mock.calls.length,
            mocks.token.mock.calls.length, mocks.fetch.mock.calls.length];
        release({ ok: true, response: {} });
        await Promise.all([ws, http]);
        expect(whileBlocked).toEqual([1, 1, 0, 0]);
        expect(res.statusCode).toBe(200);
    });

    it('hydrates tools even without session_init', async () => {
        const { socket, send } = await socketFixture();
        await send({ type: 'tool_call', tool: 'get_cart_state', args: {} });
        expect(mocks.execute).toHaveBeenCalledOnce();
        expect(socket.sent.find(message => message.type === 'tool_result').response.snapshot).toMatchObject(storedSession());
    });

    it('queues a tool behind an in-flight session_init persistence', async () => {
        const { send } = await socketFixture();
        let release;
        mocks.save.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
        const init = send({ type: 'session_init', demo_context: context });
        const tool = send({ type: 'tool_call', tool: 'get_cart_state', args: {} });
        await vi.waitFor(() => expect(release).toBeTypeOf('function'));
        expect(mocks.execute).not.toHaveBeenCalled();
        release({ updated_at: new Date().toISOString() });
        await Promise.all([init, tool]);
        expect(mocks.execute).toHaveBeenCalledOnce();
    });

    it('blocks tool execution after an invalid session_init until a valid init succeeds', async () => {
        const { socket, send } = await socketFixture();
        await send({ type: 'session_init', demo_context: { scenario_id: 'unknown' } });
        await send({ type: 'tool_call', tool: 'get_cart_state', args: {} });
        expect(mocks.execute).not.toHaveBeenCalled();
        expect(socket.sent.some(message => message.error === 'invalid_demo_context')).toBe(true);
        await send({ type: 'session_init', demo_context: context });
        await send({ type: 'tool_call', tool: 'get_cart_state', args: {} });
        expect(mocks.execute).toHaveBeenCalledOnce();
    });

    it.each(['load', 'save'])('blocks tools after a session_init %s failure', async (operation) => {
        const { socket, send } = await socketFixture();
        mocks[operation].mockRejectedValueOnce(new Error('private storage detail'));
        await send({ type: 'session_init', demo_context: context });
        await send({ type: 'tool_call', tool: 'get_cart_state', args: {} });
        expect(mocks.execute).not.toHaveBeenCalled();
        expect(socket.sent.filter(message => message.type === 'tool_error')).toHaveLength(2);
        expect(JSON.stringify(socket.sent)).not.toContain('private storage detail');
    });

    it.each(['load', 'save'])('rejects direct tools on %s failure, including when session_init is missing', async (operation) => {
        const { socket, send } = await socketFixture();
        mocks[operation].mockRejectedValueOnce(new Error('private storage detail'));
        await send({ type: 'tool_call', tool: 'get_cart_state', args: {} });
        expect(mocks.execute).not.toHaveBeenCalled();
        expect(socket.sent.at(-1)).toMatchObject({ type: 'tool_error', error: 'live_session_unavailable' });
    });

    it('rejects invalid context on a direct tool message', async () => {
        const { socket, send } = await socketFixture();
        await send({ type: 'tool_call', tool: 'get_cart_state', args: {}, demo_context: { scenario_id: 'unknown' } });
        expect(mocks.execute).not.toHaveBeenCalled();
        expect(socket.sent.at(-1)).toMatchObject({ type: 'tool_error', error: 'invalid_demo_context' });
    });
});
