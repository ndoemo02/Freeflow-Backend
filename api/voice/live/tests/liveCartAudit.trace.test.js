import { afterEach, expect, it, vi } from 'vitest';
import { recordLiveCartAudit, exportLiveCartAuditRun } from '../liveCartAudit.js';
import { validateEvent } from '../../../../tools/tracelab/analyze.js';
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
function enable(run = 'trace-test') {
  vi.stubEnv('FREEFLOW_TRACELAB_DEBUG', '1'); vi.stubEnv('NODE_ENV', 'test'); vi.stubEnv('VERCEL_ENV', '');
  vi.stubEnv('LIVE_CART_AUDIT_RUN_ID', run); vi.stubEnv('LIVE_CART_AUDIT_SESSION_ID', 'session');
}
it('requires debug, exact session and run; production cannot enable it', () => {
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
