import Stripe from 'stripe';
import { createHash } from 'node:crypto';
import { supabase } from '../_supabase.js';
import { orderSnapshot, paymentError, priceOrder } from '../orders/orderPricing.js';
const KIND = 'order_payment_v1';
const FINAL = new Set(['confirmed', 'accepted', 'preparing', 'completed', 'delivered']);
const recordId = orderId => `sess_payment_${createHash('sha256').update(String(orderId)).digest('hex')}`;
export function testStripe() {
    const key = process.env.STRIPE_SECRET_KEY || '';
    if (!key.startsWith('sk_test_')) throw paymentError('stripe_test_mode_required', 503);
    return new Stripe(key, { apiVersion: '2026-02-25.clover' });
}
function returnOrigin() {
    const configured = process.env.PAYMENT_RETURN_ORIGIN || process.env.FRONTEND_URL || (process.env.NODE_ENV !== 'production' ? 'http://localhost:5173' : '');
    try {
        const url = new URL(configured);
        if (url.username || url.password || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) throw new Error();
        return url.origin;
    } catch { throw paymentError('payment_return_origin_required', 503); }
}
export async function ownedOrder(orderId, userId) {
    if (!orderId) throw paymentError('missing_order_id', 400);
    const { data, error } = await supabase.from('orders').select('id,user_id,restaurant_id,items,total_price,status,confirmed_at,session_id')
        .eq('id', String(orderId)).eq('user_id', userId).maybeSingle();
    if (error) throw paymentError('order_unavailable', 503);
    if (!data) throw paymentError('order_not_found', 404);
    return data;
}
async function readRecord(orderId) {
    const { data, error } = await supabase.from('brain_sessions').select('data').eq('id', recordId(orderId)).maybeSingle();
    if (error) throw paymentError('payment_storage_unavailable', 503);
    return data?.data || null;
}
function checkRecord(record, order) {
    const snapshot = orderSnapshot(order);
    if (!record || record.kind !== KIND || record.orderId !== order.id || record.userId !== order.user_id
        || record.digest !== snapshot.digest || record.amountCents !== snapshot.totalCents || record.currency !== 'pln') throw paymentError('payment_order_mismatch');
}
async function prepareRecord(order) {
    let record = await readRecord(order.id);
    if (!record) {
        const { totalCents, digest } = orderSnapshot(order);
        const candidate = { kind: KIND, orderId: order.id, userId: order.user_id, digest,
            amountCents: totalCents, currency: 'pln', checkoutId: null, origin: returnOrigin(), expiresAt: Math.floor(Date.now() / 1000) + 7200 };
        const { error } = await supabase.from('brain_sessions').insert({ id: recordId(order.id), data: candidate, updated_at: new Date().toISOString() });
        if (error && error.code !== '23505') throw paymentError('payment_storage_unavailable', 503);
        record = await readRecord(order.id);
    }
    checkRecord(record, order);
    return record;
}
async function bindCheckout(record, checkoutId) {
    if (record.checkoutId && record.checkoutId !== checkoutId) throw paymentError('checkout_mismatch');
    if (!record.checkoutId) {
        const { error } = await supabase.from('brain_sessions').update({ data: { ...record, checkoutId }, updated_at: new Date().toISOString() })
            .eq('id', recordId(record.orderId)).eq('data', JSON.stringify(record));
        if (error) throw paymentError('payment_storage_unavailable', 503);
        const saved = await readRecord(record.orderId);
        if (saved?.checkoutId !== checkoutId) throw paymentError('checkout_mismatch');
        return saved;
    }
    return record;
}
function validateStripeSession(session, record) {
    if (!session || session.livemode !== false || session.mode !== 'payment' || !String(session.id || '').startsWith('cs_test_')
        || (record.checkoutId && session.id !== record.checkoutId)
        || session.client_reference_id !== record.orderId || session.metadata?.order_id !== record.orderId
        || session.metadata?.user_id !== record.userId || session.metadata?.digest !== record.digest
        || session.currency !== record.currency || session.amount_total !== record.amountCents) throw paymentError('stripe_payment_mismatch');
}
export async function createCheckout(orderId, userId) {
    const order = await ownedOrder(orderId, userId);
    if (order.status !== 'pending' || order.confirmed_at) throw paymentError('order_not_payable');
    const snapshot = orderSnapshot(order);
    const priced = await priceOrder(order.restaurant_id, order.items);
    if (priced.totalCents !== snapshot.totalCents || priced.items.some((item, i) => item.unit_price_cents !== order.items[i].unit_price_cents)) throw paymentError('price_changed_review_required');
    const stripe = testStripe();
    let record = await prepareRecord(order);
    let session;
    if (record.checkoutId) {
        session = await stripe.checkout.sessions.retrieve(record.checkoutId);
    } else {
        // Fixed parameters and durable key survive retries and multiple workers.
        // Never recreate an expired attempt after Stripe prunes its idempotency key.
        if (record.expiresAt < Math.floor(Date.now() / 1000) + 1800) throw paymentError('checkout_expired');
        const suffix = `/panel/client?section=orders&order_id=${encodeURIComponent(order.id)}`;
        session = await stripe.checkout.sessions.create({ mode: 'payment', payment_method_types: ['card'],
            line_items: order.items.map(item => ({ quantity: item.qty, price_data: { currency: 'pln', unit_amount: item.unit_price_cents, product_data: { name: item.name } } })),
            success_url: `${record.origin}${suffix}&stripe=success&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${record.origin}${suffix}&stripe=cancel`, expires_at: record.expiresAt,
            client_reference_id: order.id, metadata: { order_id: order.id, user_id: userId, digest: record.digest },
        }, { idempotencyKey: recordId(order.id) });
        validateStripeSession(session, record);
        record = await bindCheckout(record, session.id);
    }
    validateStripeSession(session, record);
    if (session.status !== 'open' || session.payment_status === 'paid' || !session.url) throw paymentError('checkout_not_open');
    return { ok: true, id: session.id, url: session.url };
}
export async function verifyPayment(orderId, userId, checkoutId) {
    const order = await ownedOrder(orderId, userId);
    const record = await readRecord(order.id);
    checkRecord(record, order);
    if (!checkoutId || record.checkoutId !== checkoutId) throw paymentError('checkout_mismatch', 404);
    const session = await testStripe().checkout.sessions.retrieve(checkoutId);
    validateStripeSession(session, record);
    return { order, record, session, paid: session.payment_status === 'paid' && session.status === 'complete' };
}
export async function confirmVerifiedPayment(verified) {
    const { order } = verified;
    if (!verified.paid) throw paymentError('payment_not_verified');
    if (order.status === 'pending' && !order.confirmed_at) {
        const { data, error } = await supabase.from('orders').update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
            .eq('id', order.id).eq('user_id', order.user_id).eq('status', 'pending').is('confirmed_at', null)
            .eq('restaurant_id', order.restaurant_id).eq('items', JSON.stringify(order.items)).eq('total_price', order.total_price).select('id,status,confirmed_at').maybeSingle();
        if (error) throw paymentError('confirmation_unavailable', 503);
        if (data) return data;
    }
    const latest = await ownedOrder(order.id, order.user_id);
    if (!FINAL.has(latest.status) || !latest.confirmed_at || orderSnapshot(latest).digest !== verified.record.digest) throw paymentError('order_not_confirmable');
    return { id: latest.id, status: latest.status, confirmed_at: latest.confirmed_at };
}
// Signed webhooks can recover the gap between Stripe creation and local binding.
export async function fulfillWebhookSession(checkoutId, orderId) {
    const record = await readRecord(orderId);
    if (!record || record.kind !== KIND) throw paymentError('payment_record_missing', 503);
    const order = await ownedOrder(orderId, record.userId);
    checkRecord(record, order);
    const session = await testStripe().checkout.sessions.retrieve(checkoutId);
    validateStripeSession(session, record);
    const bound = await bindCheckout(record, checkoutId);
    return confirmVerifiedPayment({ order, record: bound, session, paid: session.payment_status === 'paid' && session.status === 'complete' });
}
export function paymentFailure(res, error) {
    return res.status(error.statusCode || 503).json({ ok: false, error: error.code && error.statusCode ? error.code : 'payment_unavailable' });
}
