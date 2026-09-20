import { randomUUID } from 'node:crypto';
import { authenticateOwner } from '../../_auth.js';
import { supabase } from '../../_supabase.js';

const RUN_DURATION_MS = 20 * 60 * 1000;
const RETENTION_MS = 24 * 60 * 60 * 1000;

function allowedUsers() {
  return new Set(String(process.env.FREEFLOW_TRACELAB_TEST_USER_IDS || '')
    .split(',').map(value => value.trim().toLowerCase()).filter(Boolean));
}

async function authenticateQaUser(req) {
  if (process.env.FREEFLOW_TRACELAB_QA_ENABLED !== '1') {
    return { ok: false, status: 404, error: 'not_found' };
  }
  const auth = await authenticateOwner(req);
  if (!auth.ok) return auth;
  if (!allowedUsers().has(auth.userId.toLowerCase())) {
    return { ok: false, status: 403, error: 'tracelab_test_account_required' };
  }
  return auth;
}

export async function createQaTraceRun(req, sessionId, now = Date.now()) {
  const auth = await authenticateQaUser(req);
  if (!auth.ok) return auth;
  const runId = `qa_${new Date(now).toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}_${randomUUID().replace(/-/g, '')}`;
  const startsAt = new Date(now - 1000).toISOString();
  const captureExpiresAt = new Date(now + RUN_DURATION_MS).toISOString();
  const expiresAt = new Date(now + RETENTION_MS).toISOString();
  const { error } = await supabase.from('tracelab_runs').insert({
    run_id: runId, session_id: sessionId, test_user_id: auth.userId, capture_enabled: true,
    starts_at: startsAt, capture_expires_at: captureExpiresAt, expires_at: expiresAt,
  });
  if (error) return { ok: false, status: 503, error: 'tracelab_run_unavailable' };
  return { ok: true, userId: auth.userId, runId, sessionId, startsAt, captureExpiresAt, expiresAt };
}

export async function resolveQaTraceContext(req, sessionId, requestedRunId) {
  if (!requestedRunId) return { ok: true, context: null };
  const auth = await authenticateQaUser(req);
  if (!auth.ok) return auth;
  const runId = String(requestedRunId).trim();
  if (!/^qa_[a-zA-Z0-9_]{10,150}$/.test(runId)) {
    return { ok: false, status: 400, error: 'invalid_tracelab_run_id' };
  }
  const { data, error } = await supabase.from('tracelab_runs')
    .select('run_id,session_id,test_user_id,capture_enabled,starts_at,capture_expires_at,expires_at')
    .eq('run_id', runId).eq('session_id', sessionId).eq('test_user_id', auth.userId).maybeSingle();
  const now = Date.now();
  const startsAt = Date.parse(data?.starts_at || '');
  const captureExpiresAt = Date.parse(data?.capture_expires_at || '');
  const expiresAt = Date.parse(data?.expires_at || '');
  if (error || !data || !data.capture_enabled || !Number.isFinite(startsAt) || !Number.isFinite(captureExpiresAt)
    || !Number.isFinite(expiresAt) || now < startsAt || now >= captureExpiresAt || now >= expiresAt) {
    return { ok: false, status: 403, error: 'tracelab_run_not_active' };
  }
  return { ok: true, context: { mode: 'qa', runId, sessionId, expiresAt: data.capture_expires_at } };
}

export const QA_TRACE_RUN_DURATION_MS = RUN_DURATION_MS;
