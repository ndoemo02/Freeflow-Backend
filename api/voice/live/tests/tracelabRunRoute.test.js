import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('../../../_cors.js', () => ({ applyCORS: () => false }));
vi.mock('../tracelabQa.js', () => ({ createQaTraceRun: mocks.create }));
import handler from '../tracelab-run.js';

const response = () => ({
  statusCode: 200, body: null, headers: {},
  setHeader(name, value) { this.headers[name] = value; },
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

beforeEach(() => mocks.create.mockReset().mockResolvedValue({ ok: true, runId: 'qa_generated', sessionId: 'sess_actual',
  startsAt: '2026-09-20T10:00:00Z', captureExpiresAt: '2026-09-20T10:20:00Z', expiresAt: '2026-09-21T10:00:00Z' }));

it('accepts only a canonical actual session and never accepts a caller-provided run id', async () => {
  const res = response();
  const req = { method: 'POST', headers: { authorization: 'Bearer redacted' }, body: { session_id: 'sess_actual', run_id: 'caller_value' } };
  await handler(req, res);
  expect(res.statusCode).toBe(201);
  expect(res.body).toMatchObject({ run_id: 'qa_generated', session_id: 'sess_actual' });
  expect(mocks.create).toHaveBeenCalledWith(req, 'sess_actual');
});

it('rejects a noncanonical session before provisioning', async () => {
  const res = response();
  await handler({ method: 'POST', body: { session_id: 'sess-with-dashes' } }, res);
  expect(res.statusCode).toBe(400);
  expect(mocks.create).not.toHaveBeenCalled();
});
