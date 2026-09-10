import { requireOwner } from '../_auth.js';
import { createCheckout, verifyPayment, paymentFailure } from './paymentService.js';
export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
    try {
        const auth = await requireOwner(req, res); if (!auth) return;
        const checked = await verifyPayment(req.body?.order_id, auth.userId, req.body?.session_id);
        return res.json({ ok: true, paid: checked.paid, order_id: checked.order.id });
    } catch (error) { return paymentFailure(res, error); }
}
