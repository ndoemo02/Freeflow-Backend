// Opt-in diagnostics for ONE session. Never changes execution or stores audio/JWT.
export function auditCartSnapshot(cart, menu = []) {
  return {
    items: (Array.isArray(cart?.items) ? cart.items : []).map(i => ({
      id: i.id || i.menu_item_id || null, name: i.name || null,
      variant: (Array.isArray(menu) ? menu : []).find(item => item.id === (i.id || i.menu_item_id))?.size_or_variant ?? i.size_or_variant ?? i.variant ?? null,
      qty: i.qty ?? i.quantity ?? null, price: i.price_pln ?? i.price ?? null,
      restaurant_id: i.restaurant_id || null,
    })),
    total: cart?.total ?? null,
  };
}

let buffer = { run_id: null, events: [], truncated: false };
const enabled = () => process.env.FREEFLOW_TRACELAB_DEBUG === '1'
  && process.env.NODE_ENV !== 'production' && process.env.VERCEL_ENV !== 'production';

export function recordLiveCartAudit(sessionId, stage, data = {}) {
  try {
    const runId = process.env.LIVE_CART_AUDIT_RUN_ID;
    if (!enabled() || !runId || !sessionId || process.env.LIVE_CART_AUDIT_SESSION_ID !== sessionId) return;
    if (buffer.run_id !== runId) buffer = { run_id: runId, events: [], truncated: false };
    const { turn_id = null, request_id = null, ...payload } = data;
    const event = JSON.parse(JSON.stringify({
      run_id: runId, session_id: sessionId, turn_id, request_id,
      source: 'backend', event: stage, timestamp: Date.now(), payload,
    }, (key, value) => /token|authorization|cookie|secret|password|base64|pcm/i.test(key) ? '[redacted]' : value));
    buffer.events.push(event);
    if (buffer.events.length > 300) { buffer.events.shift(); buffer.truncated = true; }
    console.info('[LIVE_CART_AUDIT]', JSON.stringify(event));
  } catch { /* diagnostics must never change behavior */ }
}

export function exportLiveCartAuditRun(runId) {
  if (!enabled() || !runId || runId !== process.env.LIVE_CART_AUDIT_RUN_ID || runId !== buffer.run_id) return null;
  return JSON.stringify({ schema: 'freeflow.tracelab.v1', run_id: runId, truncated: buffer.truncated, events: buffer.events }, null, 2);
}
