import { testStripe, fulfillWebhookSession, paymentFailure } from './paymentService.js';
export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ ok: false });
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) return res.status(503).json({ ok: false, error: 'webhook_unconfigured' });
    let event;
    try {
        if (!Buffer.isBuffer(req.body)) throw new Error('raw_body_required');
        event = testStripe().webhooks.constructEvent(req.body, req.headers['stripe-signature'], secret);
    } catch { return res.status(400).json({ ok: false, error: 'invalid_webhook' }); }
    if (event.livemode !== false) return res.status(400).json({ ok: false, error: 'test_mode_required' });
    if (!['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) return res.json({ ok: true, ignored: true });
    if (!event.data.object.metadata?.order_id || !event.data.object.metadata?.digest) return res.json({ ok: true, ignored: true });
    if (event.data.object.payment_status !== 'paid') return res.json({ ok: true, pending: true });
    try {
        await fulfillWebhookSession(event.data.object.id, event.data.object.metadata?.order_id);
        return res.json({ ok: true });
    } catch (error) { return paymentFailure(res, error); }
}
