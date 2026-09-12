import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ verify: vi.fn(), confirm: vi.fn() }));
vi.mock('../../_auth.js', () => ({ requireOwner: async () => ({ userId: 'A' }) }));
vi.mock('../../payments/paymentService.js', () => ({ verifyPayment: state.verify, confirmVerifiedPayment: state.confirm,
    paymentFailure: (res, error) => res.status(error.statusCode || 503).json({ ok: false, error: error.code }) }));
import finalizeOrder from '../../orders/finalizeOrder.js';
async function call(extra = {}, method = 'POST') {
    const res = { statusCode: 200, headers: {}, setHeader(name, value) { this.headers[name] = value; },
        end: vi.fn(), status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await finalizeOrder({ method, headers: { origin: 'https://freeflow-final.vercel.app' }, body: { order_id: 'order-a', checkout_session_id: 'cs_test_a', ...extra } }, res);
    return res;
}
beforeEach(() => { state.verify.mockReset().mockResolvedValue({ order: { id: 'order-a', session_id: 'sess_a' }, paid: true }); state.confirm.mockReset().mockResolvedValue({ id: 'order-a', status: 'confirmed', confirmed_at: '2026-09-06T00:00:00Z' }); });
describe('finalization requires verified Stripe proof', () => {
    it('runs the real CORS helper on a production-origin POST without throwing', async () => {
        const res = await call();
        expect(res.statusCode).toBe(200);
        expect(res.headers['Access-Control-Allow-Origin']).toBe('https://freeflow-final.vercel.app');
        expect(res.body).toMatchObject({ ok: true, order_id: 'order-a' });
    });
    it('ends OPTIONS after CORS without payment verification or a second response', async () => {
        const res = await call({}, 'OPTIONS');
        expect(res.statusCode).toBe(200);
        expect(res.end).toHaveBeenCalledTimes(1);
        expect(res.body).toBeUndefined();
        expect(state.verify).not.toHaveBeenCalled();
        expect(state.confirm).not.toHaveBeenCalled();
    });
    it('passes both IDs and authenticated identity to verification', async () => {
        expect((await call()).statusCode).toBe(200);
        expect(state.verify).toHaveBeenCalledWith('order-a', 'A', 'cs_test_a'); expect(state.confirm).toHaveBeenCalledTimes(1);
    });
    it('does not confirm after verification fails', async () => {
        state.verify.mockRejectedValue(Object.assign(new Error('mismatch'), { statusCode: 409, code: 'checkout_mismatch' }));
        expect((await call()).statusCode).toBe(409); expect(state.confirm).not.toHaveBeenCalled();
    });
    it('does not confirm when supplied conversation ID belongs to another order', async () => {
        expect((await call({ session_id: 'sess_other' })).statusCode).toBe(404); expect(state.confirm).not.toHaveBeenCalled();
    });
    it('does not request clearing or replacing the current shopping session', async () => {
        expect((await call()).body).not.toHaveProperty('newSessionId');
    });
});
