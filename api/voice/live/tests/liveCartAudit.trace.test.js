import { afterEach, expect, it, vi } from 'vitest';
import { recordLiveCartAudit, exportLiveCartAuditRun } from '../liveCartAudit.js';
import { validateEvent } from '../../../../tools/tracelab/analyze.js';
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
function enable(run = 'trace-test') {
  vi.stubEnv('FREEFLOW_TRACELAB_DEBUG', '1'); vi.stubEnv('NODE_ENV', 'test'); vi.stubEnv('VERCEL_ENV', '');
  vi.stubEnv('LIVE_CART_AUDIT_RUN_ID', run); vi.stubEnv('LIVE_CART_AUDIT_SESSION_ID', 'session');
}
it('requires debug, exact session and run; production requires a separate override', () => {
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  enable(); vi.stubEnv('FREEFLOW_TRACELAB_DEBUG', '');
  recordLiveCartAudit('session', 'tool_selected', {});
  expect(exportLiveCartAuditRun('trace-test')).toBeNull();
  enable(); recordLiveCartAudit('wrong', 'tool_selected', {});
  vi.stubEnv('NODE_ENV', 'production'); recordLiveCartAudit('session', 'tool_selected', {});
  expect(log).not.toHaveBeenCalled();
});
it('reuses the log event, exports only selected run, bounds and redacts the buffer', () => {
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  enable('buffer');
  for (let i = 0; i < 301; i++) recordLiveCartAudit('session', 'tool_selected', { request_id: `r${i}`, turn_id: 'turn', token: 'secret-value' });
  const run = JSON.parse(exportLiveCartAuditRun('buffer'));
  expect(run.events).toHaveLength(300); expect(run.truncated).toBe(true);
  expect(run.events.every(validateEvent)).toBe(true);
  expect(run.events[0].payload.token).toBe('[redacted]');
  expect(JSON.parse(log.mock.calls.at(-1)[1])).toEqual(run.events.at(-1));
  expect(exportLiveCartAuditRun('other')).toBeNull();
  enable('next'); recordLiveCartAudit('session', 'tool_selected', {});
  expect(JSON.parse(exportLiveCartAuditRun('next')).events).toHaveLength(1);
});
it('production capture needs explicit override, exact session and bounded active window; export survives expiry', () => {
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  enable('production-test'); vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('FREEFLOW_TRACELAB_PRODUCTION_CAPTURE', '1');
  vi.stubEnv('LIVE_CART_AUDIT_START_AT', new Date(Date.now() - 1000).toISOString());
  vi.stubEnv('LIVE_CART_AUDIT_EXPIRES_AT', new Date(Date.now() + 10000).toISOString());
  recordLiveCartAudit('wrong-session', 'tool_selected', {});
  recordLiveCartAudit('session', 'tool_selected', { turn_id: 'turn', request_id: 'req',
    inlineData: { data: 'audio-bytes' }, pcm: 'pcm-bytes', note: 'Bearer credential-value' });
  expect(log).toHaveBeenCalledTimes(1);
  const run = exportLiveCartAuditRun('production-test');
  expect(run).not.toContain('audio-bytes'); expect(run).not.toContain('credential-value');
  vi.stubEnv('LIVE_CART_AUDIT_EXPIRES_AT', new Date(Date.now() - 100).toISOString());
  recordLiveCartAudit('session', 'tool_selected', {});
  expect(log).toHaveBeenCalledTimes(1);
  expect(exportLiveCartAuditRun('production-test')).not.toBeNull();
  vi.stubEnv('LIVE_CART_AUDIT_EXPIRES_AT', new Date(Date.now() + 60 * 60 * 1000).toISOString());
  recordLiveCartAudit('session', 'tool_selected', {});
  expect(log).toHaveBeenCalledTimes(1);
});
