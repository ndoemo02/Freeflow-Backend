// Serverless handler for Vercel — POST /api/live/perf
// Accepts timing instrumentation from both frontend (browser) and backend (server)
// Stores in Supabase live_perf_logs table
import { applyCORS } from '../../_cors.js';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = (supabaseUrl && supabaseKey)
  ? createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } })
  : null;

// Allow both frontend origins and internal server calls
const ALLOWED_PERF_ORIGINS = new Set([
  'https://freeflow-frontend-seven.vercel.app',
  'https://freeflow-frontend.vercel.app',
  'https://freeflow-final.vercel.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
]);

function isValidPerfOrigin(origin) {
  if (!origin) return false;
  // Internal server calls have no origin or special origin
  if (origin === 'server' || origin === 'backend') return true;
  return ALLOWED_PERF_ORIGINS.has(origin);
}

export default async function handler(req, res) {
  if (applyCORS(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const body = req.body || {};
  
  // Support both single entry and batch array
  const entries = Array.isArray(body.entries) ? body.entries : [body];
  
  if (entries.length === 0 || !entries[0].session_id || !entries[0].stage) {
    return res.status(400).json({
      ok: false,
      error: 'missing_fields',
      detail: 'Each entry requires: session_id, stage, ms',
    });
  }

  if (!supabase) {
    console.log('[PERF] Supabase not configured — logging only');
    // Log to console so Vercel logs capture it
    for (const e of entries) {
      console.log(`[PERF] ${e.stage.padEnd(22)} ${String(e.ms).padStart(5)}ms  session=${e.session_id?.slice(0,8) || '?'}`);
    }
    return res.status(200).json({ ok: true, stored: false, reason: 'no_supabase' });
  }

  const rows = entries.map(e => ({
    session_id: String(e.session_id || 'unknown').slice(0, 128),
    model: String(e.model || '').slice(0, 64) || null,
    stage: String(e.stage || 'unknown').slice(0, 32),
    ms: Math.max(0, Math.min(60000, Number(e.ms) || 0)),
    metadata: e.metadata && typeof e.metadata === 'object' ? e.metadata : {},
  }));

  try {
    const { error } = await supabase.from('live_perf_logs').insert(rows);
    
    if (error) {
      console.error('[PERF] Supabase insert error:', error.message);
      // Still log to console
      for (const e of entries) {
        console.log(`[PERF] ${e.stage?.padEnd(22) || '?'} ${String(e.ms).padStart(5)}ms  session=${e.session_id?.slice(0,8) || '?'}`);
      }
      return res.status(200).json({ ok: true, stored: false, reason: 'db_error', detail: error.message });
    }

    return res.status(200).json({ ok: true, stored: true, count: rows.length });
  } catch (err) {
    console.error('[PERF] Handler error:', err.message);
    return res.status(500).json({ ok: false, error: 'internal_error', detail: err.message });
  }
}
