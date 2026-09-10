import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ tables: {}, create: vi.fn(), retrieve: vi.fn(), sessions: new Map(), keys: new Map(), fail: null, writes: 0, beforeUpdate: null }));
vi.mock('../../_supabase.js', () => ({ supabase: state.client = {
    auth: { getUser: async token => ({ data: { user: ['A', 'B', 'staff'].includes(token) ? { id: token } : null }, error: null }) },
    from(table) {
        const filters = []; let operation = 'read', payload;
        const q = {
            select: () => q, order: () => q, limit: () => q,
            eq(key, value) { filters.push(row => typeof row[key] === 'object' && row[key] !== null ? JSON.stringify(row[key]) === value : row[key] === value); return q; },
            is(key, value) { filters.push(row => (row[key] ?? null) === value); return q; },
            in(key, values) { filters.push(row => values.includes(row[key])); return q; },
            insert(value) { operation = 'insert'; payload = value; return q; },
            update(value) { operation = 'update'; payload = value; return q; },
            single() { return q.maybeSingle(); },
            maybeSingle() { return q.then(result => ({ ...result, data: result.data?.[0] || null })); },
            then(resolve, reject) {
                if (state.fail?.table === table && state.fail?.operation === operation) return Promise.resolve({ data: null, error: { code: '42501' } }).then(resolve, reject);
                if (operation === 'update' && table === 'orders') { const hook = state.beforeUpdate; state.beforeUpdate = null; hook?.(); }
                const rows = state.tables[table] ||= [];
                let found = rows.filter(row => filters.every(test => test(row)));
                if (operation === 'insert') {
                    const incoming = (Array.isArray(payload) ? payload : [payload]).map(row => ({ id: `order-${rows.length + 1}`, ...structuredClone(row) }));
                    if (incoming.some(row => rows.some(old => old.id === row.id || (row.idempotency_key && old.idempotency_key === row.idempotency_key)))) return Promise.resolve({ data: null, error: { code: '23505' } }).then(resolve, reject);
                    rows.push(...incoming); found = incoming;
                }
                if (operation === 'update') { found.forEach(row => Object.assign(row, structuredClone(payload))); if (table === 'orders') state.writes += found.length; }
                return Promise.resolve({ data: structuredClone(found), error: null }).then(resolve, reject);
            },
        }; return q;
    },
} }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => state.client }));
vi.mock('stripe', async importOriginal => {
    const { default: Stripe } = await importOriginal();
    const signing = new Stripe('sk_test_offline').webhooks;
    return { default: class { checkout = { sessions: { create: state.create, retrieve: state.retrieve } }; webhooks = signing; } };
});
vi.mock('../../_cors.js', () => ({ applyCORS() {} }));
vi.mock('../../brain/session/sessionStore.js', () => ({ getSession: () => null, updateSession: vi.fn() }));
import orders from '../../orders.js';
import ownerOrders from '../../owner/orders.js';
import checkout from '../../payments/checkout-session.js';
import verify from '../../payments/verify-session.js';
import finalize from '../../orders/finalizeOrder.js';
import webhook from '../../payments/webhook.js';
import { requireSessionAccess } from '../../brain/session/sessionAccess.js';
import { orderSnapshot } from '../../orders/orderPricing.js';
const venue = '11111111-1111-4111-8111-111111111111';
const req = (body = {}, token = 'A') => ({ method: 'POST', url: '/api/orders', query: {}, headers: token ? { authorization: `Bearer ${token}`, 'idempotency-key': 'offline-request-key-1' } : {}, body });
async function call(handler, request) { const res = { statusCode: 200, setHeader() {}, end() {}, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } }; await handler(request, res); return res; }
async function createOrder(extra = {}) {
    return call(orders, req({ restaurant_id: venue, items: [{ menu_item_id: 'dish', qty: 2, name: 'FAKE', unit_price_cents: 1 }], total_cents: 2400, ...extra }));
}
async function start() { const created = await createOrder(); expect(created.statusCode).toBe(200); const orderId = created.body.id; const started = await call(checkout, req({ order_id: orderId })); expect(started.statusCode).toBe(200); return { orderId, checkoutId: started.body.id }; }
function markPaid(id) { Object.assign(state.sessions.get(id), { status: 'complete', payment_status: 'paid' }); }
function finalizeReq(ids, token = 'A') { return req({ order_id: ids.orderId, checkout_session_id: ids.checkoutId }, token); }
beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co'); vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'offline');
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_offline'); vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_offline'); vi.stubEnv('PAYMENT_RETURN_ORIGIN', 'https://demo.example');
    state.tables = { restaurants: [{ id: venue, is_active: true, publication_status: 'demo_fictional' }], menu_items_v2: [{ id: 'dish', restaurant_id: venue, name: 'Pierogi', price_pln: '12.00', available: true }], orders: [], brain_sessions: [] };
    state.fail = null; state.writes = 0; state.beforeUpdate = null; state.sessions.clear(); state.keys.clear();
    state.create.mockReset().mockImplementation(async (params, options) => {
        if (!state.keys.has(options.idempotencyKey)) {
            const id = `cs_test_${state.sessions.size + 1}`;
            const session = { id, livemode: false, mode: params.mode, status: 'open', payment_status: 'unpaid', currency: 'pln',
                amount_total: params.line_items.reduce((sum, item) => sum + item.quantity * item.price_data.unit_amount, 0),
                metadata: params.metadata, client_reference_id: params.client_reference_id, url: `https://checkout.stripe.com/${id}` };
            state.sessions.set(id, session); state.keys.set(options.idempotencyKey, id);
        }
        return structuredClone(state.sessions.get(state.keys.get(options.idempotencyKey)));
    });
    state.retrieve.mockReset().mockImplementation(async id => structuredClone(state.sessions.get(id)));
});
afterEach(() => vi.unstubAllEnvs());
describe('manual order -> authenticated Stripe test -> confirmation', () => {
    it('uses catalog price/name and server identity, then confirms once and preserves kitchen progress', async () => {
        const ids = await start();
        expect(state.tables.orders[0]).toMatchObject({ user_id: 'A', status: 'pending', total_price: 24 });
        expect(state.tables.orders[0].items[0]).toMatchObject({ name: 'Pierogi', unit_price_cents: 1200, pricing_version: 1 });
        const params = state.create.mock.calls[0][0]; expect(params.line_items[0].price_data.unit_amount).toBe(1200); expect(params.success_url).toContain('https://demo.example/');
        markPaid(ids.checkoutId);
        const results = await Promise.all([call(finalize, finalizeReq(ids)), call(finalize, finalizeReq(ids))]);
        expect(results.map(result => result.statusCode)).toEqual([200, 200]); expect(state.writes).toBe(1);
        const timestamp = state.tables.orders[0].confirmed_at;
        state.tables.orders[0].status = 'preparing';
        const retried = await call(finalize, finalizeReq(ids));
        expect(retried.body).toMatchObject({ status: 'preparing', confirmed_at: timestamp });
        expect(retried.body).not.toHaveProperty('newSessionId'); expect(state.writes).toBe(1);
    });
    it.each([null, 'bad', 'B'])('denies unauthorized/foreign payment requests (%s) before Stripe', async token => {
        const ids = await start(); state.retrieve.mockClear(); state.create.mockClear();
        for (const [handler, body] of [[checkout, { order_id: ids.orderId }], [verify, { order_id: ids.orderId, session_id: ids.checkoutId }], [finalize, { order_id: ids.orderId, checkout_session_id: ids.checkoutId }]]) {
            expect((await call(handler, req(body, token))).statusCode).toBe(token === 'B' ? 404 : 401);
        }
        expect(state.retrieve).not.toHaveBeenCalled(); expect(state.create).not.toHaveBeenCalled();
    });
    it.each([0, -1, 1.5, '2', 100])('rejects invalid quantity %s without an order', async qty => {
        expect((await createOrder({ items: [{ menu_item_id: 'dish', qty }] })).statusCode).toBe(400); expect(state.tables.orders).toHaveLength(0);
    });
    it('rejects changed reviewed prices, foreign/unavailable items and private restaurants', async () => {
        expect((await createOrder({ total_cents: 1 })).statusCode).toBe(409);
        expect((await createOrder({ items: [{ menu_item_id: 'foreign', qty: 2 }] })).statusCode).toBe(409);
        state.tables.menu_items_v2[0].available = false; expect((await createOrder()).statusCode).toBe(409);
        state.tables.restaurants[0].publication_status = 'private'; expect((await createOrder()).statusCode).toBe(403);
        expect(state.tables.orders).toHaveLength(0);
    });
    it('reuses a persisted Checkout and ignores caller URLs/items/metadata', async () => {
        const created = await createOrder(); const body = { order_id: created.body.id, success_url: 'https://evil.example', items: [{ name: 'fake', price: 1 }], metadata: { user_id: 'B' } };
        const results = await Promise.all([call(checkout, req(body)), call(checkout, req(body))]);
        expect(results.map(result => result.statusCode)).toEqual([200, 200]); expect(results[0].body.id).toBe(results[1].body.id); expect(state.sessions.size).toBe(1);
        expect(state.create.mock.calls.every(([params]) => params.metadata.user_id === 'A' && params.success_url.startsWith('https://demo.example/'))).toBe(true);
        expect((await call(checkout, req(body))).statusCode).toBe(200); expect(state.sessions.size).toBe(1);
    });
    it.each([{ id: 'cs_test_other' }, { amount_total: 1 }, { currency: 'eur' }, { livemode: true }, { mode: 'subscription' }, { client_reference_id: 'other' }, { metadata: { order_id: 'other' } }])('rejects mismatched Stripe proof %j', async override => {
        const ids = await start(); markPaid(ids.checkoutId); Object.assign(state.sessions.get(ids.checkoutId), override);
        expect((await call(finalize, finalizeReq(ids))).statusCode).toBe(409); expect(state.writes).toBe(0);
    });
    it.each([{ status: 'complete', payment_status: 'unpaid' }, { status: 'open', payment_status: 'paid' }, { status: 'complete', payment_status: 'no_payment_required' }])('does not confirm incomplete payment %j', async override => {
        const ids = await start(); Object.assign(state.sessions.get(ids.checkoutId), override);
        expect((await call(verify, req({ order_id: ids.orderId, session_id: ids.checkoutId }))).body.paid).toBe(false);
        expect((await call(finalize, finalizeReq(ids))).statusCode).toBe(409); expect(state.writes).toBe(0);
    });
    it('denies an unrelated Checkout ID without retrieving it', async () => {
        const ids = await start(); state.retrieve.mockClear();
        expect((await call(finalize, req({ order_id: ids.orderId, checkout_session_id: 'cs_test_other' }))).statusCode).toBe(404); expect(state.retrieve).not.toHaveBeenCalled();
    });
    it('does not revive cancelled orders or accept an edited order snapshot', async () => {
        const ids = await start(); markPaid(ids.checkoutId); state.tables.orders[0].status = 'cancelled';
        expect((await call(finalize, finalizeReq(ids))).statusCode).toBe(409);
        state.tables.orders[0].status = 'pending'; state.tables.orders[0].items[0].name = 'changed';
        expect((await call(finalize, finalizeReq(ids))).statusCode).toBe(409); expect(state.writes).toBe(0);
    });
    it('fails closed on storage failure, then recovers the same Stripe session after binding failure', async () => {
        const created = await createOrder(); const body = { order_id: created.body.id };
        state.fail = { table: 'brain_sessions', operation: 'insert' };
        expect((await call(checkout, req(body))).statusCode).toBe(503); expect(state.create).not.toHaveBeenCalled();
        state.fail = { table: 'brain_sessions', operation: 'update' };
        expect((await call(checkout, req(body))).statusCode).toBe(503); expect(state.sessions.size).toBe(1);
        state.fail = null; expect((await call(checkout, req(body))).statusCode).toBe(200); expect(state.sessions.size).toBe(1);
    });
    it('rejects live Stripe keys before provider calls', async () => {
        const created = await createOrder(); vi.stubEnv('STRIPE_SECRET_KEY', 'sk_live_forbidden');
        expect((await call(checkout, req({ order_id: created.body.id }))).statusCode).toBe(503); expect(state.create).not.toHaveBeenCalled();
    });
    it('does not recreate an expired unbound attempt', async () => {
        const ids = await start(); const record = state.tables.brain_sessions[0].data; record.checkoutId = null; record.expiresAt = 1; state.create.mockClear();
        expect((await call(checkout, req({ order_id: ids.orderId }))).statusCode).toBe(409); expect(state.create).not.toHaveBeenCalled();
    });
    it('reserves payment storage from conversation tools', async () => {
        const ids = await start(); expect(orderSnapshot(state.tables.orders[0]).totalCents).toBe(2400);
        await expect(requireSessionAccess(req(), state.tables.brain_sessions[0].id)).rejects.toMatchObject({ statusCode: 403 });
    });
});
async function signedRequest(event) {
    const { default: Stripe } = await vi.importActual('stripe');
    const payload = JSON.stringify(event);
    const signature = new Stripe('sk_test_offline').webhooks.generateTestHeaderString({ payload, secret: 'whsec_offline' });
    return { method: 'POST', headers: { 'stripe-signature': signature }, body: Buffer.from(payload) };
}
describe('signed webhook', () => {
    it('fulfills without a browser return, tolerates replay and recovers an unbound checkout', async () => {
        const ids = await start(); markPaid(ids.checkoutId); state.tables.brain_sessions[0].data.checkoutId = null;
        const request = await signedRequest({ id: 'evt_test', type: 'checkout.session.completed', livemode: false, data: { object: state.sessions.get(ids.checkoutId) } });
        expect((await call(webhook, request)).statusCode).toBe(200); expect((await call(webhook, request)).statusCode).toBe(200); expect(state.writes).toBe(1);
    });
    it('rejects forged signature and parsed body before provider or database changes', async () => {
        const request = await signedRequest({ id: 'evt_test', type: 'checkout.session.completed', livemode: false, data: { object: {} } });
        request.body = Buffer.from('{}'); expect((await call(webhook, request)).statusCode).toBe(400);
        request.body = {}; expect((await call(webhook, request)).statusCode).toBe(400); expect(state.retrieve).not.toHaveBeenCalled(); expect(state.writes).toBe(0);
    });
});

it('deduplicates manual order submission with a durable unique key and rejects changed reuse', async () => {
    const results = await Promise.all([createOrder(), createOrder()]);
    expect(results.map(result => result.statusCode)).toEqual([200, 200]);
    expect(results[0].body.id).toBe(results[1].body.id); expect(state.tables.orders).toHaveLength(1);
    expect((await createOrder({ notes: 'different instructions' })).statusCode).toBe(409);
    expect(state.tables.orders).toHaveLength(1);
});

it('keeps the same order and payment proof after JSONB reorders object keys', async () => {
    const ids = await start(); const order = state.tables.orders[0];
    const digest = orderSnapshot(order).digest;
    order.items = order.items.map(item => Object.fromEntries(Object.entries(item).reverse()));
    expect(orderSnapshot(order).digest).toBe(digest);
    expect((await createOrder()).body.id).toBe(ids.orderId);
    markPaid(ids.checkoutId);
    expect((await call(finalize, finalizeReq(ids))).statusCode).toBe(200);
    expect(state.tables.orders).toHaveLength(1);
});
it('returns no success on confirmation storage failure and recovers on retry', async () => {
    const ids = await start(); markPaid(ids.checkoutId);
    state.fail = { table: 'orders', operation: 'update' };
    expect((await call(finalize, finalizeReq(ids))).statusCode).toBe(503);
    expect(state.tables.orders[0].status).toBe('pending'); expect(state.writes).toBe(0);
    state.fail = null;
    expect((await call(finalize, finalizeReq(ids))).statusCode).toBe(200); expect(state.writes).toBe(1);
});
it.each([{ status: 'cancelled' }, { restaurant_id: 'changed-venue' }])('does not overwrite a concurrent order change %j', async change => {
    const ids = await start(); markPaid(ids.checkoutId);
    state.beforeUpdate = () => Object.assign(state.tables.orders[0], change);
    expect((await call(finalize, finalizeReq(ids))).statusCode).toBe(409);
    expect(state.tables.orders[0]).toMatchObject(change); expect(state.writes).toBe(0);
});
it('confirms once when the signed webhook and browser return race', async () => {
    const ids = await start(); markPaid(ids.checkoutId);
    const request = await signedRequest({ id: 'evt_race', type: 'checkout.session.completed', livemode: false, data: { object: state.sessions.get(ids.checkoutId) } });
    const results = await Promise.all([call(webhook, request), call(finalize, finalizeReq(ids))]);
    expect(results.map(result => result.statusCode)).toEqual([200, 200]); expect(state.writes).toBe(1);
});

function kitchenReq(status, orderId = 'kitchen-order', token = 'staff') {
    return { ...req({ status, restaurant_id: venue, confirmed_at: 'FORGED' }, token), method: 'PATCH', params: { id: orderId }, url: `/api/owner/orders/${orderId}` };
}
function kitchenScope() {
    state.tables.restaurants[0].business_account_id = 'business-a';
    state.tables.business_members = [{ user_id: 'staff', business_account_id: 'business-a', business_roles: { capabilities: ['orders.read', 'orders.update_status'] }, business_accounts: { status: 'active' } }];
}
function kitchenOrder(status, confirmedAt = '2026-09-10T12:00:00Z') {
    kitchenScope();
    state.tables.orders = [{ id: 'kitchen-order', user_id: 'A', restaurant_id: venue, status, confirmed_at: confirmedAt, updated_at: 'original', items: [], total_price: 24 }];
}
describe('kitchen transition boundary', () => {
    const allowed = {
        pending: ['cancelled'], confirmed: ['accepted', 'preparing', 'cancelled'],
        accepted: ['preparing', 'cancelled'], preparing: ['completed', 'cancelled'],
        completed: ['delivered'], delivered: [], cancelled: [],
    };
    for (const source of Object.keys(allowed)) {
        it.each(['accepted', 'preparing', 'completed', 'delivered', 'cancelled'])(`${source} -> %s respects order progression`, async target => {
            kitchenOrder(source, source === 'pending' ? null : '2026-09-10T12:00:00Z');
            const res = await call(ownerOrders, kitchenReq(target));
            const valid = target === source || allowed[source].includes(target);
            expect(res.statusCode).toBe(valid ? 200 : 409);
            expect(state.tables.orders[0].status).toBe(valid ? target : source);
            expect(state.writes).toBe(valid && target !== source ? 1 : 0);
            expect(state.tables.orders[0].confirmed_at).toBe(source === 'pending' ? null : '2026-09-10T12:00:00Z');
        });
    }
    it.each(['confirmed', 'accepted', 'preparing', 'completed'])('rejects operational status %s without a server payment timestamp', async source => {
        kitchenOrder(source, null);
        const target = source === 'completed' ? 'delivered' : 'preparing';
        expect((await call(ownerOrders, kitchenReq(target))).statusCode).toBe(409);
        expect(state.writes).toBe(0);
    });
    it('keeps foreign and missing orders indistinguishable and does not trust restaurant_id', async () => {
        kitchenOrder('confirmed'); state.tables.orders[0].restaurant_id = 'foreign';
        expect((await call(ownerOrders, kitchenReq('preparing'))).statusCode).toBe(404);
        expect((await call(ownerOrders, kitchenReq('preparing', 'missing'))).statusCode).toBe(404);
        expect(state.writes).toBe(0);
    });
    it('writes once for concurrent identical actions and keeps retry timestamps stable', async () => {
        kitchenOrder('confirmed');
        const results = await Promise.all([call(ownerOrders, kitchenReq('preparing')), call(ownerOrders, kitchenReq('preparing'))]);
        expect(results.map(res => res.statusCode)).toEqual([200, 200]); expect(state.writes).toBe(1);
        const timestamp = state.tables.orders[0].updated_at;
        expect((await call(ownerOrders, kitchenReq('preparing'))).statusCode).toBe(200);
        expect(state.tables.orders[0].updated_at).toBe(timestamp); expect(state.writes).toBe(1);
    });
    it('resolves competing cancellation and completion without overwriting the winner', async () => {
        kitchenOrder('preparing');
        const results = await Promise.all([call(ownerOrders, kitchenReq('cancelled')), call(ownerOrders, kitchenReq('completed'))]);
        expect(results.map(res => res.statusCode).sort()).toEqual([200, 409]); expect(state.writes).toBe(1);
    });
    it('does not apply an old unpaid cancellation after payment confirms concurrently', async () => {
        kitchenOrder('pending', null);
        state.beforeUpdate = () => Object.assign(state.tables.orders[0], { status: 'confirmed', confirmed_at: '2026-09-10T12:00:00Z' });
        expect((await call(ownerOrders, kitchenReq('cancelled'))).statusCode).toBe(409);
        expect(state.tables.orders[0].status).toBe('confirmed'); expect(state.writes).toBe(0);
    });
    it.each([{ restaurant_id: 'foreign' }, { confirmed_at: null }])('rejects a concurrent change of the scoped payment marker %j', async change => {
        kitchenOrder('confirmed'); state.beforeUpdate = () => Object.assign(state.tables.orders[0], change);
        expect([404, 409]).toContain((await call(ownerOrders, kitchenReq('preparing'))).statusCode);
        expect(state.writes).toBe(0);
    });
    it.each(['read', 'update'])('fails closed on an orders %s error', async operation => {
        kitchenOrder('confirmed'); state.fail = { table: 'orders', operation };
        expect((await call(ownerOrders, kitchenReq('preparing'))).statusCode).toBeGreaterThanOrEqual(500); expect(state.writes).toBe(0);
    });
    it('runs the actual manual order/payment/owner handlers through delivery and tolerates payment replay', async () => {
        const ids = await start(); kitchenScope();
        expect((await call(ownerOrders, kitchenReq('preparing', ids.orderId))).statusCode).toBe(409);
        markPaid(ids.checkoutId); expect((await call(finalize, finalizeReq(ids))).statusCode).toBe(200);
        const timestamp = state.tables.orders[0].confirmed_at;
        for (const status of ['preparing', 'completed', 'delivered']) {
            expect((await call(ownerOrders, kitchenReq(status, ids.orderId))).statusCode).toBe(200);
            expect((await call(finalize, finalizeReq(ids))).body.status).toBe(status);
        }
        expect(state.tables.orders[0]).toMatchObject({ status: 'delivered', confirmed_at: timestamp, total_price: 24 });
        expect(state.writes).toBe(4);
    });
});

it.each(['', 'FORGED', null])('does not accept an invalid stored confirmation marker %j or a caller replacement', async marker => {
    kitchenOrder('confirmed', marker);
    expect((await call(ownerOrders, kitchenReq('preparing'))).statusCode).toBe(409);
    expect(state.writes).toBe(0);
});
