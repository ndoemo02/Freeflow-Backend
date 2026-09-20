// Opt-in diagnostics for ONE session. Never changes execution or stores audio/JWT.
import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { persistTraceEvent } from './tracelabPersistence.js';
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

let buffer = { run_id: null, events: [], truncated: false, sequence: 0, collector_id: randomUUID() };
const qaCaptureContext = new AsyncLocalStorage();

export function runWithLiveCartAuditContext(context, operation) {
  if (!context) return operation();
  return qaCaptureContext.run(context, operation);
}
const enabled = (recording = true) => {
  if (process.env.FREEFLOW_TRACELAB_DEBUG !== '1') return false;
  if (process.env.NODE_ENV !== 'production' && process.env.VERCEL_ENV !== 'production') return true;
  const start = Date.parse(process.env.LIVE_CART_AUDIT_START_AT || '');
  const end = Date.parse(process.env.LIVE_CART_AUDIT_EXPIRES_AT || '');
  return process.env.FREEFLOW_TRACELAB_PRODUCTION_CAPTURE === '1'
    && !!process.env.LIVE_CART_AUDIT_RUN_ID && !!process.env.LIVE_CART_AUDIT_SESSION_ID
    && Number.isFinite(start) && Number.isFinite(end) && end > start && end - start <= 30 * 60 * 1000
    && (!recording || (Date.now() >= start && Date.now() < end));
};
function activeCapture(sessionId, recording = true) {
  const qa = qaCaptureContext.getStore();
  if (qa?.mode === 'qa' && qa.runId && qa.sessionId === sessionId) {
    const expiresAt = Date.parse(qa.expiresAt || '');
    if (!recording || (Number.isFinite(expiresAt) && Date.now() < expiresAt)) {
      return { runId: qa.runId, persist: true };
    }
  }
  if (!enabled(recording) || process.env.LIVE_CART_AUDIT_SESSION_ID !== sessionId) return null;
  return { runId: process.env.LIVE_CART_AUDIT_RUN_ID, persist: process.env.FREEFLOW_TRACELAB_PERSIST === '1' };
}
const redact = (key, value) => /token|authorization|cookie|secret|password|api.?key|access.?key|private.?key|credential|base64|pcm|audio|inlineData/i.test(key) ? '[redacted]'
  : typeof value === 'string' ? value.replace(/Bearer\s+[^\s"']+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[redacted]') : value;

export function recordLiveCartAudit(sessionId, stage, data = {}) {
  try {
    if (!sessionId) return;
    const capture = activeCapture(sessionId);
    const runId = capture?.runId;
    if (!runId) return;
    if (buffer.run_id !== runId) buffer = { run_id: runId, events: [], truncated: false, sequence: 0, collector_id: randomUUID() };
    const { turn_id = null, request_id = null, ...payload } = data;
    const event = JSON.parse(JSON.stringify({
      run_id: runId, session_id: sessionId, turn_id, request_id,
      source: 'backend', event: stage, timestamp: Date.now(),
      payload: { ...payload, collector_id: buffer.collector_id, sequence: ++buffer.sequence },
    }, redact));
    buffer.events.push(event);
    if (buffer.events.length > 300) { buffer.events.shift(); buffer.truncated = true; }
    console.info('[LIVE_CART_AUDIT]', JSON.stringify(event));
    if (capture.persist) void persistTraceEvent(event);
  } catch { /* diagnostics must never change behavior */ }
}

export function exportLiveCartAuditRun(runId) {
  if (!enabled(false) || !runId || runId !== process.env.LIVE_CART_AUDIT_RUN_ID || runId !== buffer.run_id) return null;
  return JSON.stringify({ schema: 'freeflow.tracelab.v1', run_id: runId, truncated: buffer.truncated, events: buffer.events }, null, 2);
}
