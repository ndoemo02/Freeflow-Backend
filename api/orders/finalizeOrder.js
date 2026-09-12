import { requireOwner } from '../_auth.js';
import { applyCORS } from '../_cors.js';
import { verifyPayment, confirmVerifiedPayment, paymentFailure } from '../payments/paymentService.js';

// A payment return confirms only the recorded order. Cart/session cleanup belongs
// to manual order submission; a late payment return must not erase a newer cart.
export default async function finalizeOrder(req, res) {
    if (applyCORS(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
    try {
        const auth = await requireOwner(req, res); if (!auth) return;
        const verified = await verifyPayment(req.body?.order_id, auth.userId, req.body?.checkout_session_id);
        if (req.body?.session_id && req.body.session_id !== verified.order.session_id) return res.status(404).json({ ok: false, error: 'not_found' });
        const confirmed = await confirmVerifiedPayment(verified);
        return res.json({ ok: true, order_id: confirmed.id, status: confirmed.status, confirmed_at: confirmed.confirmed_at });
    } catch (error) { return paymentFailure(res, error); }
}
