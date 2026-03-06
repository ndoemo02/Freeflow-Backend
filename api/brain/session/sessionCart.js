import crypto from "node:crypto";

export function ensureSessionCart(session) {
  if (!session.cart) session.cart = { items: [], total: 0 };
  if (!Array.isArray(session.cart.items)) session.cart.items = [];
  if (typeof session.cart.total !== 'number') session.cart.total = 0;
}

export function sum(items) {
  return (items || []).reduce((acc, it) => acc + (Number(it.price_pln || it.price || 0) * (Number(it.qty || 1))), 0);
}

export function commitPendingOrder(session) {
  if (!session?.pendingOrder?.items?.length) return { committed: false, cart: session?.cart || { items: [], total: 0 } };
  ensureSessionCart(session);
  // Guarantee the cart level restaurantId is preserved
  session.cart.restaurantId = session.pendingOrder.restaurant_id;

  const toAdd = session.pendingOrder.items.map(it => ({
    id: it.id || crypto.randomUUID?.() || String(Date.now()),
    name: it.name || it.item_name || 'pozycja',
    price_pln: Number(it.price_pln ?? it.price ?? 0),
    qty: Number(it.quantity || it.qty || 1),
    restaurant_id: session.pendingOrder.restaurant_id,
    restaurant_name: session.pendingOrder.restaurant,
  }));

  // Cart Deduplication: merge same-name items from same restaurant
  for (const newItem of toAdd) {
    const existing = session.cart.items.find(
      i => i.name === newItem.name && i.restaurant_id === newItem.restaurant_id
    );
    if (existing) {
      existing.qty = (existing.qty || 1) + (newItem.qty || 1);
    } else {
      session.cart.items.push(newItem);
    }
  }
  session.cart.total = Number(sum(session.cart.items).toFixed(2));
  session.lastOrder = { ...session.pendingOrder };
  delete session.pendingOrder;
  if (session.expectedContext === 'confirm_order') delete session.expectedContext;
  return { committed: true, cart: session.cart };
}
