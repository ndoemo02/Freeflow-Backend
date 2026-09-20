import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), insert: vi.fn(), selectResult: vi.fn() }));
vi.mock('../../../_auth.js', () => ({ authenticateOwner: mocks.auth }));
vi.mock('../../../_supabase.js', () => ({
  supabase: {
    from: () => ({
      insert: mocks.insert,
      select: () => ({
        eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: mocks.selectResult }) }) }),
      }),
    }),
  },
}));

import { createQaTraceRun, resolveQaTraceContext, QA_TRACE_RUN_DURATION_MS } from '../tracelabQa.js';

const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
beforeEach(() => {
  vi.stubEnv('FREEFLOW_TRACELAB_QA_ENABLED', '1');
  vi.stubEnv('FREEFLOW_TRACELAB_TEST_USER_IDS', userId);
  mocks.auth.mockReset().mockResolvedValue({ ok: true, userId });
  mocks.insert.mockReset().mockResolvedValue({ error: null });
  mocks.selectResult.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

it('creates one server-generated 20-minute run for the allowlisted authenticated account', async () => {
  const now = Date.parse('2026-09-20T10:00:00.000Z');
  const result = await createQaTraceRun({ headers: { authorization: 'Bearer redacted' } }, 'sess_actual', now);
  expect(result.ok).toBe(true);
  expect(result.runId).toMatch(/^qa_\d{14}_[a-f0-9]{32}$/);
  expect(Date.parse(result.captureExpiresAt) - now).toBe(QA_TRACE_RUN_DURATION_MS);
  expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
    session_id: 'sess_actual', test_user_id: userId, capture_enabled: true,
  }));
});

it('fails closed when QA is off or the authenticated account is not allowlisted', async () => {
  vi.stubEnv('FREEFLOW_TRACELAB_QA_ENABLED', '');
  expect(await createQaTraceRun({}, 'sess_actual')).toMatchObject({ ok: false, status: 404 });
  vi.stubEnv('FREEFLOW_TRACELAB_QA_ENABLED', '1');
  vi.stubEnv('FREEFLOW_TRACELAB_TEST_USER_IDS', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  expect(await createQaTraceRun({}, 'sess_actual')).toMatchObject({ ok: false, status: 403 });
  expect(mocks.insert).not.toHaveBeenCalled();
});

it('binds backend capture only to the active run, session and authenticated user', async () => {
  const now = Date.now();
  mocks.selectResult.mockResolvedValue({ data: {
    run_id: 'qa_20260920100000_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', session_id: 'sess_actual', test_user_id: userId,
    capture_enabled: true, starts_at: new Date(now - 1000).toISOString(),
    capture_expires_at: new Date(now + 60000).toISOString(), expires_at: new Date(now + 3600000).toISOString(),
  }, error: null });
  const result = await resolveQaTraceContext({}, 'sess_actual', 'qa_20260920100000_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  expect(result).toMatchObject({ ok: true, context: { mode: 'qa', sessionId: 'sess_actual' } });
  mocks.selectResult.mockResolvedValueOnce({ data: null, error: null });
  expect(await resolveQaTraceContext({}, 'sess_other', 'qa_20260920100000_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'))
    .toMatchObject({ ok: false, status: 403 });
});
