vi.mock('../../api/payments/webhook.js', () => ({ default: (req, res) => res.json({ raw: Buffer.isBuffer(req.body), value: req.body.toString() }) }));
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
vi.mock('dotenv', () => ({ config() {} }));
vi.mock('../../api/voice/live/index.js', () => ({ registerLiveRoutes() {}, attachLiveGateway() {} }));
vi.mock('../../api/_supabase.js', () => ({ privateServerClient: {}, assertPrivateServerConfig() {}, describePrivateServerConfig: () => ({}) }));
vi.mock('../../api/_supabaseCatalog.js', () => ({ publicCatalogClient: {}, assertPublicCatalogConfig() {}, describePublicCatalogConfig: () => ({}) }));
vi.mock('../../api/orders.js', () => ({ default: (req, res) => res.status(200).json({ route: 'orders', id: req.params.id || null }) }));
vi.mock('../../api/orders/finalizeOrder.js', () => ({ default: (req, res) => res.status(409).json({ route: 'finalize', error: 'payment_not_verified' }) }));
let app;
beforeAll(async () => { vi.stubEnv('NODE_ENV', 'production'); app = (await import('../../api/server-vercel.js')).default; });
afterAll(() => vi.unstubAllEnvs());
describe('registered customer routes', () => {
    it('dispatches finalize before generic order ID and keeps the ID route registered', async () => {
        const finalize = await request(app).post('/api/orders/finalize').send({ order_id: 'order-a' });
        expect(finalize.status).toBe(409); expect(finalize.body.route).toBe('finalize');
        const order = await request(app).get('/api/orders/order-a');
        expect(order.status).toBe(200); expect(order.body).toEqual({ route: 'orders', id: 'order-a' });
    });
});

it('preserves raw webhook bytes before JSON middleware and permits the order retry header', async () => {
    const raw = '{ "id" : "evt_offline" }';
    const webhook = await request(app).post('/api/payments/webhook').set('Content-Type', 'application/json').send(raw);
    expect(webhook.body).toEqual({ raw: true, value: raw });
    const preflight = await request(app).options('/api/orders').set('Origin', 'https://freeflow-frontend-seven.vercel.app').set('Access-Control-Request-Method', 'POST').set('Access-Control-Request-Headers', 'authorization,content-type,idempotency-key');
    expect(preflight.status).toBe(204); expect(preflight.headers['access-control-allow-headers'].toLowerCase()).toContain('idempotency-key');
});
