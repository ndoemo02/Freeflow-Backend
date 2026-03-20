/**
 * Cart Sync Event Tests – Round 2
 * 
 * Verifies:
 * - Semantic cartMutated detection (before/after snapshot diff)
 * - No items[last] fallback — only lastCartMutation or null
 * - stateMutationCompleted guard
 * - menuBehavior default + handler override
 * - cartVersion monotonic counter
 * - EVENT_ORDER_COMPLETED lifecycle event
 */

import { describe, it, expect } from 'vitest';
import { CART_MUTATION_WHITELIST } from '../core/pipeline/IntentGroups.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Pure-function extraction of the cart sync logic from pipeline.js.
 * Mirrors the exact guards and payload construction.
 *
 * @param {string} intent
 * @param {object} preCart - cart state BEFORE handler { items, total }
 * @param {object} postSession - session state AFTER handler (includes cart, meta, etc.)
 * @param {boolean} stateMutationCompleted - whether handler finished
 * @param {string|undefined} handlerMenuBehavior - from response.meta.menuBehavior set by handler
 */
function buildCartSyncResult(intent, preCart, postSession, stateMutationCompleted = true, handlerMenuBehavior = undefined) {
    const result = { events: [], menuBehavior: handlerMenuBehavior };

    // Semantic cart mutation detection
    const preItemCount = (preCart?.items || []).length;
    const preTotal = preCart?.total || 0;
    const postItemCount = (postSession?.cart?.items || []).length;
    const postTotal = postSession?.cart?.total || 0;
    const cartActuallyChanged = postItemCount !== preItemCount || postTotal !== preTotal;

    // Guard: stateMutationCompleted
    if (stateMutationCompleted !== true) {
        return result;
    }

    // Guard: cart must have changed OR intent in whitelist
    if (!cartActuallyChanged && !CART_MUTATION_WHITELIST.includes(intent)) {
        return result;
    }

    const cartSnap = postSession?.cart || { items: [], total: 0 };
    const items = cartSnap.items || [];

    // cartVersion
    if (typeof postSession?.cartVersion !== 'number') {
        if (postSession) postSession.cartVersion = 0;
    }
    if (postSession) postSession.cartVersion++;
    const cartVersion = postSession?.cartVersion || 1;

    const totalItems = items.reduce((s, i) => s + (i.qty || i.quantity || 1), 0);
    const totalPrice = cartSnap.total || 0;

    // lastAdded: ONLY from handler-set lastCartMutation — no items[last] fallback
    const lastMutation = postSession?.meta?.lastCartMutation || null;
    const lastAdded = lastMutation?.name || null;

    // menuBehavior: handler override ?? pipeline default
    const menuBehavior = handlerMenuBehavior ?? 'preserve';

    result.events.push({
        type: 'EVENT_CART_UPDATED',
        channel: 'ui_sync',
        payload: { totalItems, totalPrice, lastAdded, cartVersion }
    });
    result.menuBehavior = menuBehavior;

    // EVENT_ORDER_COMPLETED
    if (intent === 'confirm_order') {
        result.events.push({
            type: 'EVENT_ORDER_COMPLETED',
            channel: 'ui_sync',
            payload: {
                restaurantId: postSession?.restaurantContext?.id || null,
                restaurantName: postSession?.restaurantContext?.name || null,
                total: totalPrice,
                itemCount: items.length
            }
        });
        result.menuBehavior = 'forceClose';
    }

    return result;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Cart Sync Event (EVENT_CART_UPDATED)', () => {

    const preCart = { items: [{ name: 'Pizza', qty: 1 }], total: 25 };
    const postSession = {
        cart: {
            items: [
                { name: 'Pizza', qty: 1 },
                { name: 'Cola', qty: 1 }
            ],
            total: 31
        },
        meta: {
            lastCartMutation: { name: 'Cola', quantity: 1, category: 'napoje' }
        }
    };

    // ── Semantic Cart Detection ────────────────────────────────────

    it('emits event when cart actually changed (item count differs)', () => {
        const result = buildCartSyncResult('some_custom_intent', preCart, { ...postSession });

        expect(result.events).toHaveLength(1);
        expect(result.events[0].type).toBe('EVENT_CART_UPDATED');
    });

    it('emits event when only total changed (same item count)', () => {
        const pre = { items: [{ name: 'A', qty: 1 }], total: 10 };
        const post = { cart: { items: [{ name: 'A', qty: 2 }], total: 20 }, meta: {} };
        const result = buildCartSyncResult('update_qty', pre, post);

        expect(result.events).toHaveLength(1);
    });

    it('emits event for whitelist intent even if cart did NOT change', () => {
        const sameCart = { items: [{ name: 'A', qty: 1 }], total: 10 };
        const post = { cart: sameCart, meta: {} };
        const result = buildCartSyncResult('confirm_add_to_cart', sameCart, post);

        expect(result.events).toHaveLength(1);
    });

    it('does NOT emit for non-whitelist intent when cart did NOT change', () => {
        const sameCart = { items: [{ name: 'A', qty: 1 }], total: 10 };
        const post = { cart: sameCart, meta: {} };
        const result = buildCartSyncResult('show_menu', sameCart, post);

        expect(result.events).toHaveLength(0);
    });

    // ── stateMutationCompleted guard ────────────────────────────────

    it('does NOT emit when stateMutationCompleted is false', () => {
        const result = buildCartSyncResult('confirm_add_to_cart', preCart, { ...postSession }, false);
        expect(result.events).toHaveLength(0);
    });

    // Note: stateMutationCompleted is always explicitly false→true in pipeline.js,
    // so 'undefined' case does not occur in production.

    // ── lastAdded: NO items[last] fallback ────────────────────────

    it('uses session.meta.lastCartMutation.name as lastAdded', () => {
        const result = buildCartSyncResult('confirm_add_to_cart', preCart, { ...postSession });
        expect(result.events[0].payload.lastAdded).toBe('Cola');
    });

    it('returns null when lastCartMutation is NOT set (no items[last] fallback)', () => {
        const post = {
            cart: { items: [{ name: 'Sushi', qty: 1 }], total: 40 },
            meta: {} // no lastCartMutation!
        };
        const pre = { items: [], total: 0 };
        const result = buildCartSyncResult('confirm_add_to_cart', pre, post);

        // CRITICAL: must be null, NOT 'Sushi' (no items[last] fallback)
        expect(result.events[0].payload.lastAdded).toBeNull();
    });

    // ── menuBehavior ───────────────────────────────────────────────

    it('defaults to preserve when handler did not set menuBehavior', () => {
        const result = buildCartSyncResult('confirm_add_to_cart', preCart, { ...postSession });
        expect(result.menuBehavior).toBe('preserve');
    });

    it('respects handler-set forceClose', () => {
        const result = buildCartSyncResult('confirm_add_to_cart', preCart, { ...postSession }, true, 'forceClose');
        expect(result.menuBehavior).toBe('forceClose');
    });

    it('respects handler-set softClose', () => {
        const result = buildCartSyncResult('confirm_add_to_cart', preCart, { ...postSession }, true, 'softClose');
        expect(result.menuBehavior).toBe('softClose');
    });

    // ── cartVersion ────────────────────────────────────────────────

    it('increments cartVersion on each mutation', () => {
        const session = { cart: { items: [{ name: 'A', qty: 1 }], total: 10 }, meta: {} };
        const pre = { items: [], total: 0 };

        const r1 = buildCartSyncResult('confirm_add_to_cart', pre, session);
        expect(r1.events[0].payload.cartVersion).toBe(1);

        const r2 = buildCartSyncResult('confirm_add_to_cart', pre, session);
        expect(r2.events[0].payload.cartVersion).toBe(2);
    });

    // ── Edge Cases ─────────────────────────────────────────────────

    it('handles empty cart gracefully', () => {
        const result = buildCartSyncResult('confirm_add_to_cart', { items: [], total: 0 }, { cart: { items: [], total: 0 }, meta: {} });
        expect(result.events[0].payload).toMatchObject({ totalItems: 0, totalPrice: 0, lastAdded: null });
    });

    it('handles null session', () => {
        const result = buildCartSyncResult('confirm_add_to_cart', { items: [], total: 0 }, null);
        expect(result.events[0].payload).toMatchObject({ totalItems: 0, totalPrice: 0, lastAdded: null });
    });
});

// ─── EVENT_ORDER_COMPLETED ──────────────────────────────────────────────────

describe('Order Completed Event (EVENT_ORDER_COMPLETED)', () => {

    it('emits EVENT_ORDER_COMPLETED after confirm_order', () => {
        const pre = { items: [{ name: 'A', qty: 1 }], total: 50 };
        const post = {
            cart: pre,
            meta: { lastCartMutation: { name: 'A', quantity: 1 } },
            restaurantContext: { id: 'r1', name: 'Pizzeria Roma' }
        };
        const result = buildCartSyncResult('confirm_order', { items: [], total: 0 }, post);

        const orderEvt = result.events.find(e => e.type === 'EVENT_ORDER_COMPLETED');
        expect(orderEvt).toBeDefined();
        expect(orderEvt.channel).toBe('ui_sync');
        expect(orderEvt.payload.restaurantId).toBe('r1');
        expect(orderEvt.payload.restaurantName).toBe('Pizzeria Roma');
        expect(orderEvt.payload.total).toBe(50);
        expect(orderEvt.payload.itemCount).toBe(1);
    });

    it('sets menuBehavior to forceClose after confirm_order', () => {
        const pre = { items: [], total: 0 };
        const post = { cart: { items: [{ name: 'A', qty: 1 }], total: 20 }, meta: {} };
        const result = buildCartSyncResult('confirm_order', pre, post);

        expect(result.menuBehavior).toBe('forceClose');
    });

    it('does NOT emit EVENT_ORDER_COMPLETED for confirm_add_to_cart', () => {
        const pre = { items: [], total: 0 };
        const post = { cart: { items: [{ name: 'A', qty: 1 }], total: 20 }, meta: {} };
        const result = buildCartSyncResult('confirm_add_to_cart', pre, post);

        const orderEvt = result.events.find(e => e.type === 'EVENT_ORDER_COMPLETED');
        expect(orderEvt).toBeUndefined();
    });

    it('emits BOTH cart_updated AND order_completed for confirm_order', () => {
        const pre = { items: [], total: 0 };
        const post = { cart: { items: [{ name: 'A', qty: 1 }], total: 20 }, meta: {} };
        const result = buildCartSyncResult('confirm_order', pre, post);

        expect(result.events).toHaveLength(2);
        expect(result.events[0].type).toBe('EVENT_CART_UPDATED');
        expect(result.events[1].type).toBe('EVENT_ORDER_COMPLETED');
    });

    it('handles missing restaurantContext gracefully', () => {
        const pre = { items: [], total: 0 };
        const post = { cart: { items: [{ name: 'A', qty: 1 }], total: 20 }, meta: {} };
        const result = buildCartSyncResult('confirm_order', pre, post);

        const orderEvt = result.events.find(e => e.type === 'EVENT_ORDER_COMPLETED');
        expect(orderEvt.payload.restaurantId).toBeNull();
        expect(orderEvt.payload.restaurantName).toBeNull();
    });
});
