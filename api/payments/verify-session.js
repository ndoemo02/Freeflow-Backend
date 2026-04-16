import Stripe from 'stripe';

const STRIPE_API_VERSION = '2026-02-25.clover';

function getStripeClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, { apiVersion: STRIPE_API_VERSION });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const stripe = getStripeClient();
    if (!stripe) {
      return res.status(500).json({ ok: false, error: 'Missing STRIPE_SECRET_KEY' });
    }

    const sessionId = String(req.body?.session_id || '').trim();
    if (!sessionId) {
      return res.status(400).json({ ok: false, error: 'Missing session_id' });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const paid = session.payment_status === 'paid' || session.status === 'complete';

    return res.status(200).json({
      ok: true,
      paid,
      session: {
        id: session.id,
        status: session.status,
        payment_status: session.payment_status,
        amount_total: session.amount_total,
        currency: session.currency,
        customer_email: session.customer_details?.email || session.customer_email || null,
        metadata: session.metadata || {},
      },
    });
  } catch (error) {
    console.error('[STRIPE_VERIFY_SESSION_ERROR]', error);
    return res.status(500).json({
      ok: false,
      error: error?.message || 'Failed to verify checkout session',
    });
  }
}

