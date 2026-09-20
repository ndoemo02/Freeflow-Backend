import { applyCORS } from '../../_cors.js';
import { validateSessionId } from '../../brain/session/sessionIdContract.js';
import { createQaTraceRun } from './tracelabQa.js';

export default async function handler(req, res) {
  if (applyCORS(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  const verdict = validateSessionId(req.body?.session_id);
  if (!verdict.ok) return res.status(400).json({ ok: false, error: verdict.error });
  const result = await createQaTraceRun(req, verdict.sessionId);
  if (!result.ok) return res.status(result.status).json({ ok: false, error: result.error });
  res.setHeader?.('Cache-Control', 'no-store');
  return res.status(201).json({ ok: true, run_id: result.runId, session_id: result.sessionId,
    starts_at: result.startsAt, capture_expires_at: result.captureExpiresAt, expires_at: result.expiresAt });
}
