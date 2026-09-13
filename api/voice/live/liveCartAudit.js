// Opt-in diagnostics for ONE session. Never changes execution or stores audio/JWT.
export function auditCartSnapshot(cart) {
  return {
    items: (Array.isArray(cart?.items) ? cart.items : []).map(i => ({
      id: i.id || i.menu_item_id || null, name: i.name || null,
      qty: i.qty ?? i.quantity ?? null, price: i.price_pln ?? i.price ?? null,
      restaurant_id: i.restaurant_id || null,
    })),
    total: cart?.total ?? null,
  };
}

export function recordLiveCartAudit(sessionId, stage, data) {
  try {
    if (!sessionId || process.env.LIVE_CART_AUDIT_SESSION_ID !== sessionId) return;
    console.info('[LIVE_CART_AUDIT]', JSON.stringify({
      schema: 'live_cart_audit.v1', session_id: sessionId, stage, timestamp: Date.now(), ...data,
    }, (key, value) => /token|authorization|cookie|secret|password|base64|pcm/i.test(key) ? '[redacted]' : value));
  } catch { /* diagnostics must never change behavior */ }
}
