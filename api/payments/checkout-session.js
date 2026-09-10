import { requireOwner } from '../_auth.js';
import { createCheckout, verifyPayment, paymentFailure } from './paymentService.js';
export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
    try {
        const auth = await requireOwner(req, res); if (!auth) return;
        return res.json(await createCheckout(req.body?.order_id, auth.userId));
    } catch (error) { return paymentFailure(res, error); }
}
