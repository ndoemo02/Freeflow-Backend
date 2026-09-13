// Called only after the existing collector's capture gate and redaction.
// No retries, no ordering await, bounded in-flight writes. Missing writes remain missing evidence.
import { supabase } from '../../_supabase.js';
let pending = 0;
export async function persistTraceEvent(event) {
  if (pending >= 8) return;
  pending++;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);
  try {
    await supabase.from('tracelab_events').upsert(event, {
      onConflict: 'run_id,source,collector_id,sequence', ignoreDuplicates: true,
    }).abortSignal(controller.signal);
  } catch { /* best effort diagnostics; no raw errors/credentials in logs */ }
  finally { clearTimeout(timeout); pending--; }
}
