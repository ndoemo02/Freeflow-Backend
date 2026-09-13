import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({ write: vi.fn() }));
vi.mock('../../../_supabase.js', () => ({ supabase: { from: () => ({ upsert: (event) => ({ abortSignal: (signal) => db.write(event, signal) }) }) } }));
import { recordLiveCartAudit, exportLiveCartAuditRun } from '../liveCartAudit.js';
beforeEach(() => {
  vi.stubEnv('FREEFLOW_TRACELAB_DEBUG', '1'); vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('FREEFLOW_TRACELAB_PRODUCTION_CAPTURE', '1');
  vi.stubEnv('FREEFLOW_TRACELAB_PERSIST', '1');
  vi.stubEnv('LIVE_CART_AUDIT_RUN_ID', 'persist'); vi.stubEnv('LIVE_CART_AUDIT_SESSION_ID', 'test');
  vi.stubEnv('LIVE_CART_AUDIT_START_AT', new Date(Date.now() - 1000).toISOString());
  vi.stubEnv('LIVE_CART_AUDIT_EXPIRES_AT', new Date(Date.now() + 60000).toISOString());
  vi.spyOn(console, 'info').mockImplementation(() => {}); db.write.mockReset().mockResolvedValue({ error: null });
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
it('persists the unchanged redacted event; denial/rejection cannot break recording/export', async () => {
  db.write.mockRejectedValue(new Error('database unavailable'));
  expect(recordLiveCartAudit('test', 'mutation_result', { request_id: 'r', token: 'secret', audio: 'PCM' })).toBeUndefined();
  await vi.waitFor(() => expect(db.write).toHaveBeenCalledTimes(1));
  const event = db.write.mock.calls[0][0];
  expect(event.payload).toMatchObject({ token: '[redacted]', audio: '[redacted]' });
  expect(JSON.parse(exportLiveCartAuditRun('persist')).events.at(-1)).toEqual(event);
});
it('does not write when persistence/debug is off, session differs or window expires', async () => {
  vi.stubEnv('FREEFLOW_TRACELAB_PERSIST', ''); recordLiveCartAudit('test', 'x', {});
  vi.stubEnv('FREEFLOW_TRACELAB_PERSIST', '1'); recordLiveCartAudit('other', 'x', {});
  vi.stubEnv('FREEFLOW_TRACELAB_DEBUG', ''); recordLiveCartAudit('test', 'x', {});
  vi.stubEnv('FREEFLOW_TRACELAB_DEBUG', '1');
  vi.stubEnv('LIVE_CART_AUDIT_EXPIRES_AT', new Date(Date.now() - 1).toISOString());
  recordLiveCartAudit('test', 'x', {});
  await new Promise(resolve => setTimeout(resolve, 10)); expect(db.write).not.toHaveBeenCalled();
});
it('bounds hanging writes and aborts them without waiting on Live', async () => {
  db.write.mockImplementation((_event, signal) => new Promise(resolve => signal.addEventListener('abort', () => resolve({ error: 'timeout' }))));
  for (let i = 0; i < 20; i++) recordLiveCartAudit('test', 'x', {});
  await vi.waitFor(() => expect(db.write).toHaveBeenCalledTimes(8));
  await vi.waitFor(() => expect(db.write.mock.calls.every(([, signal]) => signal.aborted)).toBe(true), { timeout: 3000 });
});
