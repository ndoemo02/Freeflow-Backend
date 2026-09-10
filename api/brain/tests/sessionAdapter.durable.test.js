import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const failure = { code: '42501', message: 'permission denied for table brain_sessions' };
const mocks = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({
    createClient: () => ({ from: () => {
        const chain = { select: () => chain, eq: () => chain, maybeSingle: mocks.read, upsert: mocks.write };
        return chain;
    } }),
}));
beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-only');
    mocks.read.mockReset().mockResolvedValue({ data: null, error: failure });
    mocks.write.mockReset().mockResolvedValue({ error: failure });
});
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe('opt-in durable session adapter', () => {
    it.each(['loadSession', 'saveSession'])('propagates permission errors from %s instead of accepting memory fallback', async (method) => {
        const adapter = await import('../session/sessionAdapter.js');
        const input = method === 'loadSession' ? 'sess_durable' : { id: 'sess_durable', data: { marker: true } };
        await expect(adapter[method](input, { requireDurable: true })).rejects.toMatchObject(failure);
    });

    it('rejects missing configuration, including after a legacy memory-only write', async () => {
        vi.stubEnv('SUPABASE_URL', '');
        const adapter = await import('../session/sessionAdapter.js');
        await adapter.saveSession({ id: 'sess_durable', data: { marker: true } });
        await expect(adapter.loadSession('sess_durable', { requireDurable: true })).rejects.toThrow();
        await expect(adapter.saveSession({ id: 'sess_durable', data: {} }, { requireDurable: true })).rejects.toThrow();
    });

    it('does not reuse a legacy fallback after persistence was disabled', async () => {
        const adapter = await import('../session/sessionAdapter.js');
        await adapter.loadSession('sess_durable');
        await expect(adapter.loadSession('sess_durable', { requireDurable: true })).rejects.toThrow();
    });

    it.each(['loadSession', 'saveSession'])('propagates both exhausted schema variants for %s', async (method) => {
        const schemaError = { message: 'column data does not exist' };
        mocks.read.mockResolvedValue({ data: null, error: schemaError });
        mocks.write.mockResolvedValue({ error: schemaError });
        const adapter = await import('../session/sessionAdapter.js');
        const input = method === 'loadSession' ? 'sess_durable' : { id: 'sess_durable', data: {} };
        await expect(adapter[method](input, { requireDurable: true })).rejects.toThrow();
        expect(method === 'loadSession' ? mocks.read : mocks.write).toHaveBeenCalledTimes(2);
    });

    it('supports the legacy payload schema when persistence really succeeds', async () => {
        mocks.read.mockResolvedValueOnce({ error: { message: 'column data does not exist' } })
            .mockResolvedValueOnce({ data: { payload: { marker: true }, updated_at: new Date().toISOString() }, error: null });
        mocks.write.mockResolvedValue({ error: null });
        const adapter = await import('../session/sessionAdapter.js');
        expect(await adapter.loadSession('sess_durable', { requireDurable: true })).toMatchObject({ data: { marker: true } });
        await adapter.saveSession({ id: 'sess_durable', data: { marker: true } }, { requireDurable: true });
        expect(mocks.write).toHaveBeenCalledWith(expect.objectContaining({ session_id: 'sess_durable', payload: { marker: true } }), { onConflict: 'session_id' });
    });

    it('does not substitute an old memory snapshot for a missing durable row', async () => {
        mocks.write.mockResolvedValue({ error: null });
        mocks.read.mockResolvedValue({ data: null, error: null });
        const adapter = await import('../session/sessionAdapter.js');
        await adapter.saveSession({ id: 'sess_durable', data: { marker: true } });
        expect(await adapter.loadSession('sess_durable', { requireDurable: true })).toBeNull();
    });

    it.each(['loadSession', 'saveSession'])('propagates missing-table errors for %s', async (method) => {
        const missing = { message: 'relation brain_sessions does not exist' };
        mocks.read.mockResolvedValue({ data: null, error: missing });
        mocks.write.mockResolvedValue({ error: missing });
        const adapter = await import('../session/sessionAdapter.js');
        const input = method === 'loadSession' ? 'sess_durable' : { id: 'sess_durable', data: {} };
        await expect(adapter[method](input, { requireDurable: true })).rejects.toMatchObject(missing);
    });
});

it.each([true, false])('preserves ownership when expired conversation data is discarded (durable=%s)', async requireDurable => {
    mocks.read.mockResolvedValue({ data: { data: { ownerUserId: 'A', cart: { items: ['old'] } }, updated_at: '2020-01-01T00:00:00.000Z' }, error: null });
    const adapter = await import('../session/sessionAdapter.js');
    const row = await adapter.loadSession('sess_expired', { requireDurable });
    expect(row.data).toMatchObject({ ownerUserId: 'A', status: 'active' });
    expect(row.data.cart).toBeUndefined();
});
