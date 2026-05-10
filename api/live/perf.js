// Serverless handler for Vercel — POST /api/live/perf
// Accepts timing instrumentation from frontend (browser)
// Logs to Vercel console + simple JSON response
import { applyCORS } from '../_cors.js';

export default async function handler(req, res) {
  if (applyCORS(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const body = req.body || {};
  const entries = Array.isArray(body.entries) ? body.entries : [body];
  
  if (entries.length === 0 || !entries[0].session_id || !entries[0].stage) {
    return res.status(400).json({
      ok: false,
      error: 'missing_fields',
      detail: 'Each entry requires: session_id, stage, ms',
    });
  }

  // Log to Vercel console (viewable in Vercel dashboard → Logs)
  for (const e of entries) {
    const sid = String(e.session_id || '?').slice(0, 10);
    const stage = String(e.stage || '?').padEnd(22);
    const ms = String(e.ms || 0).padStart(5);
    const model = String(e.model || '').slice(0, 20);
    console.log(`[PERF] ${stage} ${ms}ms  model=${model}  session=${sid}`);
  }

  // Try Supabase insert if available (non-critical — don't crash if fails)
  try {
    const { createClient } = await import('@supabase/supabase-js');
    if (createClient && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { persistSession: false } }
      );
      const rows = entries.map(e => ({
        session_id: String(e.session_id || 'unknown').slice(0, 128),
        model: String(e.model || '').slice(0, 64) || null,
        stage: String(e.stage || 'unknown').slice(0, 32),
        ms: Math.max(0, Math.min(60000, Number(e.ms) || 0)),
        metadata: e.metadata && typeof e.metadata === 'object' ? e.metadata : {},
      }));
      await supabase.from('live_perf_logs').insert(rows);
      return res.status(200).json({ ok: true, stored: true, count: rows.length });
    }
  } catch (dbErr) {
    console.log('[PERF] Supabase unavailable:', dbErr.message);
  }

  return res.status(200).json({ ok: true, stored: false, reason: 'no_supabase' });
}
