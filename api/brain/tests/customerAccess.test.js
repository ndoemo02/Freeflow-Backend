import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ tables: {}, calls: [], user: vi.fn() }));
vi.mock('../../_supabase.js', () => ({ supabase: {
    auth: { getUser: db.user },
    from(table) {
        const predicates = [];
        let operation = 'select', payload;
        const query = {
            select() { return query; }, order() { return query; }, limit() { return query; },
            eq(key, value) { predicates.push(row => row[key] === value); db.calls.push([table, key, value]); return query; },
            in(key, values) { predicates.push(row => values.includes(row[key])); return query; },
            insert(value) { operation = 'insert'; payload = value; return query; },
            update(value) { operation = 'update'; payload = value; return query; },
            maybeSingle() { return query.then(result => ({ ...result, data: result.data?.[0] || null })); },
            single() { return query.maybeSingle(); },
            then(resolve, reject) {
                try {
                    const rows = db.tables[table] ||= [];
                    let matches = rows.filter(row => predicates.every(test => test(row)));
                    if (operation === 'insert') {
                        const incoming = (Array.isArray(payload) ? payload : [payload]).map(row => ({ id: 'new-order', ...structuredClone(row) }));
                        if (incoming.some(row => rows.some(existing => existing.id === row.id))) return Promise.resolve({ error: { code: '23505' } }).then(resolve, reject);
                        rows.push(...incoming); matches = incoming;
                    }
                    if (operation === 'update') matches.forEach(row => Object.assign(row, payload));
                    return Promise.resolve({ data: structuredClone(matches), error: null }).then(resolve, reject);
                } catch (error) { return Promise.reject(error).then(resolve, reject); }
            },
        };
        return query;
    },
} }));
vi.mock('../../_cors.js', () => ({ applyCORS() {} }));
const closure = vi.hoisted(() => vi.fn(() => ({ newSessionId: 'sess_new' })));
vi.mock('../session/sessionStore.js', () => ({ closeConversation: closure, generateNewSessionId: () => 'sess_new', getSession: () => ({}), updateSession: vi.fn() }));

import { requireSessionAccess } from '../session/sessionAccess.js';
import orders from '../../orders.js';
import finalize from '../../orders/finalizeOrder.js';

const restaurantA = '11111111-1111-4111-8111-111111111111';
const request = (token = 'A', extra = {}) => ({ method: 'GET', url: '/api/orders', query: {}, body: {}, headers: token ? { authorization: `Bearer ${token}`, 'idempotency-key': 'offline-request-key-1' } : {}, ...extra });
function response() { return { statusCode: 200, setHeader() {}, end() {}, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } }; }
async function call(handler, req) { const res = response(); await handler(req, res); return res; }
beforeEach(() => {
    db.calls = []; closure.mockClear();
    db.user.mockReset().mockImplementation(async token => ({ data: { user: ['A', 'B'].includes(token) ? { id: token } : null }, error: null }));
    db.tables = {
        brain_sessions: [{ id: 'sess_a', data: { ownerUserId: 'A', cart: { secret: 'A' } } }, { id: 'sess_legacy', data: { cart: { secret: 'legacy' } } }],
        orders: [{ id: 'order-a', user_id: 'A', restaurant_id: restaurantA, session_id: 'sess_a', status: 'pending' }, { id: 'order-b', user_id: 'B', restaurant_id: 'venue-b', status: 'pending' }],
        restaurants: [{ id: restaurantA, is_active: true, publication_status: 'demo_fictional' }],
        menu_items_v2: [{ id: 'dish', name: 'Demo', price_pln: 12, restaurant_id: restaurantA, available: true }],
    };
});

describe('customer ownership boundary', () => {
    it('rejects absent/invalid credentials before session data access', async () => {
        for (const token of [null, 'bad']) await expect(requireSessionAccess(request(token), 'sess_a')).rejects.toMatchObject({ statusCode: 401 });
        expect(db.calls).toEqual([]);
    });
    it('permits only the existing owner and never claims legacy sessions', async () => {
        expect(await requireSessionAccess(request(), 'sess_a')).toMatchObject({ userId: 'A' });
        for (const id of ['sess_a', 'sess_legacy']) await expect(requireSessionAccess(request('B'), id)).rejects.toMatchObject({ statusCode: 403 });
        expect(db.tables.brain_sessions[1].data).not.toHaveProperty('ownerUserId');
    });
    it('creates one owner atomically when two users race for an unused ID', async () => {
        const results = await Promise.allSettled([requireSessionAccess(request('A'), 'sess_race'), requireSessionAccess(request('B'), 'sess_race')]);
        expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
        expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
        expect(db.tables.brain_sessions.filter(row => row.id === 'sess_race')).toHaveLength(1);
    });
    it('requires login for orders and constrains list, ID and restaurant queries to the authenticated user', async () => {
        expect((await call(orders, request(null, { query: { user_id: 'A' } }))).statusCode).toBe(401);
        expect((await call(orders, request('B', { query: { user_id: 'A' } }))).statusCode).toBe(404);
        expect((await call(orders, request('B', { query: { restaurant_id: restaurantA } }))).body.orders).toEqual([]);
        expect((await call(orders, request('B', { url: '/api/orders/order-a' }))).body.orders).toEqual([]);
        expect((await call(orders, request('A'))).body.orders.map(row => row.id)).toEqual(['order-a']);
    });
    it('derives order identity and pending status from the server, ignoring supplied user/status', async () => {
        const res = await call(orders, request('A', { method: 'POST', body: { restaurant_id: restaurantA, items: [{ menu_item_id: 'dish', name: 'demo', qty: 1 }], user_id: 'B', status: 'confirmed', total_price: 12, session_id: 'sess_a' } }));
        expect(res.statusCode).toBe(200);
        expect(db.tables.orders.at(-1)).toMatchObject({ user_id: 'A', status: 'pending', session_id: 'sess_a' });
    });
    it('rejects a private venue and a foreign session before inserting an order', async () => {
        const body = { restaurant_id: restaurantA, items: [{}], session_id: 'sess_a' };
        expect((await call(orders, request('B', { method: 'POST', body }))).statusCode).toBe(403);
        db.tables.restaurants[0].publication_status = 'private';
        expect((await call(orders, request('A', { method: 'POST', body }))).statusCode).toBe(403);
        expect(db.tables.orders).toHaveLength(2);
    });
    it('does not finalize foreign/unpaid orders or close a supplied foreign session', async () => {
        expect((await call(finalize, request(null, { method: 'POST', body: { order_id: 'order-a' } }))).statusCode).toBe(401);
        expect((await call(finalize, request('B', { method: 'POST', body: { order_id: 'order-a' } }))).statusCode).toBe(404);
        expect((await call(finalize, request('A', { method: 'POST', body: { order_id: 'order-a' } }))).statusCode).toBe(409);
        db.tables.orders[0].confirmed_at = '2026-09-06T00:00:00.000Z';
        db.tables.orders[0].status = 'preparing';
        expect((await call(finalize, request('A', { method: 'POST', body: { order_id: 'order-a', session_id: 'sess_foreign' } }))).statusCode).toBe(409);
        expect(closure).not.toHaveBeenCalled();
        expect((await call(finalize, request('A', { method: 'POST', body: { order_id: 'order-a' } }))).statusCode).toBe(409);
        expect(closure).not.toHaveBeenCalled();
        expect(db.tables.orders[0].status).toBe('preparing');
    });
});

it('denies anonymous Supabase users even when a JWT resolves', async () => {
    db.user.mockResolvedValue({ data: { user: { id: 'A', is_anonymous: true } }, error: null });
    await expect(requireSessionAccess(request(), 'sess_a')).rejects.toMatchObject({ statusCode: 401 });
    expect(db.calls).toEqual([]);
});
it('revalidates publication of owned durable menu/cart references', async () => {
    db.tables.brain_sessions[0].data.currentRestaurant = { id: restaurantA };
    await requireSessionAccess(request(), 'sess_a');
    db.tables.restaurants[0].publication_status = 'private';
    await expect(requireSessionAccess(request(), 'sess_a')).rejects.toMatchObject({ code: 'venue_not_available', statusCode: 403 });
});
