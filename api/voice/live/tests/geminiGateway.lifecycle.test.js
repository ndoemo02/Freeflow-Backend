vi.mock('../../../brain/session/sessionAccess.js', () => ({ requireSessionAccess: vi.fn(async () => ({ userId: 'test-user' })) }));
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ prepare: vi.fn(), persist: vi.fn(), update: vi.fn(), config: vi.fn(), execute: vi.fn() }));
vi.mock('ws', async () => {
    const { EventEmitter } = await import('node:events');
    return { WebSocketServer: class extends EventEmitter { constructor(options) { super(); this.options = options; } clients = new Set(); } };
});
vi.mock('../liveSessionBoundary.js', () => ({
    prepareLiveSession: mocks.prepare, persistLiveSession: mocks.persist,
    liveSessionErrorResponse: error => error?.code === 'live_session_unavailable'
        ? { body: { error: error.code } } : null,
}));
vi.mock('../../../brain/session/sessionStore.js', () => ({ updateSessionDurable: mocks.update }));
vi.mock('../../../config/configService.js', () => ({ getConfig: mocks.config }));
vi.mock('../liveObservability.js', () => ({ liveLog: { wsConnect: vi.fn(), wsDisconnect: vi.fn(), toolCall: vi.fn(), toolFail: vi.fn() } }));
vi.mock('../liveMetrics.js', () => ({ liveMetricsRegisterClientStats: vi.fn(), liveMetricsRegisterReconnect: vi.fn(), liveMetricsSessionClose: vi.fn(), liveMetricsSessionStart: vi.fn() }));

import { requireSessionAccess } from '../../../brain/session/sessionAccess.js';
import { GeminiLiveGateway } from '../GeminiLiveGateway.js';

function deferred() {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}
class Socket extends EventEmitter {
    OPEN = 1;
    readyState = 1;
    sent = [];
    send(payload) {
        if (this.readyState !== 1) throw new Error('send_on_closed_socket');
        this.sent.push(JSON.parse(payload));
    }
    close(code = 1000) { this.readyState = 3; this.emit('close', code); }
    message(payload) { return this.listeners('message')[0](Buffer.from(JSON.stringify(payload))); }
}
const tool = request_id => ({ type: 'tool_call', tool: 'get_cart_state', args: {}, request_id });
const result = () => ({ ok: true, response: { cart: { items: [], total: 0 } } });
let gateway, server;
function connect(sessionId = 'sess_lifecycle') {
    const socket = new Socket();
    const req = { url: `/?session_id=${sessionId}`, headers: { origin: 'http://localhost:5173' } };
    const ready = new Promise(resolve => server.options.verifyClient({ req }, resolve)).then(() => server.listeners('connection')[0](socket, req));
    return { socket, ready };
}
beforeEach(() => {
    vi.useFakeTimers();
    mocks.prepare.mockReset().mockResolvedValue({});
    mocks.persist.mockReset().mockResolvedValue({});
    mocks.update.mockReset().mockResolvedValue({});
    mocks.config.mockReset().mockResolvedValue({ live_model: 'test' });
    mocks.execute.mockReset().mockResolvedValue(result());
    gateway = new GeminiLiveGateway({ toolRouter: { executeToolCall: mocks.execute }, isLiveEnabled: () => true });
    server = gateway.attach({});
});
afterEach(() => { clearInterval(gateway._keepaliveInterval); vi.useRealTimers(); });

describe('Gemini gateway queue lifecycle', () => {
    it('does not mistake absent GPS for 0,0 and reset the restaurant on first coordinates', async () => {
        const { socket, ready } = connect(); await ready;
        mocks.prepare.mockResolvedValueOnce({ session_lat: null, session_lng: null, currentRestaurant: { id: 'demo' } });
        await socket.message({ type: 'session_init', lat: 50, lng: 19 });
        expect(mocks.update.mock.calls[0][1]).not.toHaveProperty('currentRestaurant');
    });

    it('recovers the queue after a tool rejection and exposes no data before a failed checkpoint', async () => {
        const { socket, ready } = connect(); await ready;
        mocks.execute.mockRejectedValueOnce(new Error('tool_failed'));
        await socket.message(tool('failed'));
        mocks.persist.mockRejectedValueOnce(Object.assign(new Error('private detail'), { code: 'live_session_unavailable' }));
        await socket.message(tool('unsaved'));
        await socket.message(tool('good'));
        expect(socket.sent.filter(msg => msg.type === 'tool_result').map(msg => msg.request_id)).toEqual(['good']);
        expect(socket.sent.filter(msg => msg.type === 'tool_error').map(msg => msg.error)).toEqual(['tool_failed', 'live_session_unavailable']);
    });

    it('requires a fresh initialization after a timed-out execution fails its final persistence', async () => {
        const { socket, ready } = connect(); await ready;
        const hold = deferred(); mocks.execute.mockReturnValueOnce(hold.promise);
        mocks.persist.mockRejectedValueOnce(new Error('storage failure'));
        const slow = socket.message(tool('slow'));
        const queued = socket.message(tool('blocked'));
        await vi.advanceTimersByTimeAsync(12001);
        hold.resolve(result()); await Promise.all([slow, queued]);
        expect(mocks.execute).toHaveBeenCalledTimes(1);
        expect(socket.sent.at(-1)).toMatchObject({ error: 'live_session_unavailable', request_id: 'blocked' });
        await socket.message({ type: 'session_init' });
        await socket.message(tool('retry'));
        expect(mocks.execute).toHaveBeenCalledTimes(2);
    });

    it('does not start a queued tool after the socket closes during session initialization', async () => {
        const { socket, ready } = connect(); await ready;
        const hold = deferred(); mocks.prepare.mockReturnValueOnce(hold.promise);
        const init = socket.message({ type: 'session_init' });
        const queued = socket.message(tool('queued'));
        await vi.advanceTimersByTimeAsync(0);
        socket.close(); hold.resolve({});
        await Promise.all([init, queued]);
        expect(mocks.execute).not.toHaveBeenCalled();
    });

    it('does not start a tool if its socket closes while durable preparation is pending', async () => {
        const { socket, ready } = connect(); await ready;
        const hold = deferred(); mocks.prepare.mockReturnValueOnce(hold.promise);
        const pending = socket.message(tool('pending'));
        await vi.advanceTimersByTimeAsync(0);
        socket.close(); hold.resolve({});
        await pending;
        expect(mocks.execute).not.toHaveBeenCalled();
    });

    it('serializes replacement sockets behind the running tool and drops the old queued messages/results', async () => {
        const old = connect(); await old.ready;
        const hold = deferred(); mocks.execute.mockReturnValueOnce(hold.promise);
        const first = old.socket.message(tool('old-running'));
        const stale = old.socket.message(tool('old-queued'));
        await vi.advanceTimersByTimeAsync(0);
        const next = connect(); await next.ready;
        const fresh = next.socket.message(tool('new'));
        await vi.advanceTimersByTimeAsync(0);
        expect(mocks.execute).toHaveBeenCalledTimes(1);
        hold.resolve(result());
        await Promise.all([first, stale, fresh]);
        expect(mocks.execute.mock.calls.map(([args]) => args.requestId)).toEqual(['old-running', 'new']);
        expect(old.socket.sent.filter(msg => msg.type === 'tool_result')).toEqual([]);
        expect(next.socket.sent.filter(msg => msg.type === 'tool_result')).toHaveLength(1);
    });

    it.each(['resolve', 'reject'])('keeps the queue locked after timeout until execution settles (%s), without a late result', async (settlement) => {
        const { socket, ready } = connect(); await ready;
        const hold = deferred(); mocks.execute.mockReturnValueOnce(hold.promise);
        const first = socket.message(tool('slow'));
        const second = socket.message(tool('next'));
        await vi.advanceTimersByTimeAsync(12001);
        expect(socket.sent.filter(msg => msg.error === 'tool_timeout')).toHaveLength(1);
        expect(mocks.execute).toHaveBeenCalledTimes(1);
        if (settlement === 'resolve') hold.resolve(result());
        else hold.reject(new Error('late_failure'));
        await Promise.all([first, second]);
        expect(mocks.execute).toHaveBeenCalledTimes(2);
        expect(socket.sent.filter(msg => msg.type === 'tool_result').map(msg => msg.request_id)).toEqual(['next']);
        expect(mocks.persist).toHaveBeenCalledTimes(2);
    });

    it('does not send live_ready when the socket closes during model lookup', async () => {
        const hold = deferred(); mocks.config.mockReturnValueOnce(hold.promise);
        const { socket, ready } = connect();
        socket.close(); hold.resolve({ live_model: 'test' });
        await ready;
        expect(socket.sent).toEqual([]);
    });

    it('serializes independent tools through their final durable checkpoint', async () => {
        const { socket, ready } = connect(); await ready;
        const hold = deferred(); mocks.persist.mockReturnValueOnce(hold.promise);
        const first = socket.message(tool('one'));
        const second = socket.message(tool('two'));
        await vi.advanceTimersByTimeAsync(0);
        expect(mocks.execute).toHaveBeenCalledTimes(1);
        expect(socket.sent.filter(msg => msg.type === 'tool_result')).toEqual([]);
        hold.resolve({}); await Promise.all([first, second]);
        expect(socket.sent.filter(msg => msg.type === 'tool_result').map(msg => msg.request_id)).toEqual(['one', 'two']);
    });

    it('lets another session proceed independently', async () => {
        const old = connect(); await old.ready;
        const hold = deferred(); mocks.execute.mockReturnValueOnce(hold.promise);
        const pending = old.socket.message(tool('slow'));
        await vi.advanceTimersByTimeAsync(0);
        const other = connect('sess_other'); await other.ready;
        await other.socket.message(tool('other'));
        expect(other.socket.sent.some(msg => msg.type === 'tool_result')).toBe(true);
        hold.resolve(result()); await pending;
    });
});

describe('WebSocket authorization before session replacement', () => {
    it.each([[401, 'unauthorized'], [403, 'session_not_owned'], [503, 'session_unavailable']])('denies upgrade with %s without disconnecting the owner', async (statusCode, code) => {
        const owner = connect(); await owner.ready;
        mocks.prepare.mockClear(); mocks.execute.mockClear();
        requireSessionAccess.mockRejectedValueOnce(Object.assign(new Error(code), { statusCode, code }));
        const req = { url: '/?session_id=sess_lifecycle', headers: { 'sec-websocket-protocol': 'freeflow, bearer.test-token' } };
        const result = await new Promise(resolve => server.options.verifyClient({ req }, (...args) => resolve(args)));
        expect(result).toEqual([false, statusCode, 'Live access denied']);
        expect(owner.socket.readyState).toBe(1);
        expect(mocks.prepare).not.toHaveBeenCalled();
        expect(mocks.execute).not.toHaveBeenCalled();
    });
    it('authenticates the credential subprotocol and never reflects it back', async () => {
        const req = { url: '/?session_id=sess_auth', headers: { 'sec-websocket-protocol': 'freeflow, bearer.test-token' } };
        await new Promise(resolve => server.options.verifyClient({ req }, resolve));
        expect(requireSessionAccess).toHaveBeenLastCalledWith({ headers: { authorization: 'Bearer test-token' } }, 'sess_auth');
        expect(server.options.handleProtocols(new Set(['freeflow', 'bearer.test-token']))).toBe('freeflow');
    });
});
