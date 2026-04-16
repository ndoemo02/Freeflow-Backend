import Stripe from 'stripe';
import { supabase } from '../_supabase.js';

const STRIPE_API_VERSION = '2026-02-25.clover';

function getStripeClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, { apiVersion: STRIPE_API_VERSION });
}

function toLineItems(items = []) {
  return items
    .map((item) => {
      const qty = Number(item?.qty ?? item?.quantity ?? 1);
      const fallbackPriceCents = Math.round(Number(item?.price ?? item?.unit_price ?? 0) * 100);
      const unitPriceCents = Number(item?.unit_price_cents ?? item?.price_cents ?? fallbackPriceCents);
      const name = String(item?.name || '').trim();

      if (!name || !Number.isFinite(unitPriceCents) || unitPriceCents <= 0 || !Number.isFinite(qty) || qty <= 0) {
        return null;
      }

      return {
        quantity: Math.floor(qty),
        price_data: {
          currency: 'pln',
          unit_amount: Math.round(unitPriceCents),
          product_data: {
            name,
          },
        },
      };
    })
    .filter(Boolean);
}

function orderItemsToStripeItems(orderItems = []) {
  if (!Array.isArray(orderItems)) return [];
  return orderItems.map((item) => {
    const fallbackPriceCents = Math.round(Number(item?.price ?? item?.unit_price ?? 0) * 100);
    return {
      name: item?.name,
      qty: Number(item?.qty ?? item?.quantity ?? 1),
      unit_price_cents: Number(item?.unit_price_cents ?? item?.price_cents ?? fallbackPriceCents),
    };
  });
}

function sanitizeMetadata(input = {}) {
  const out = {};
  for (const [key, value] of Object.entries(input || {})) {
    if (value == null) continue;
    const safeKey = String(key).slice(0, 40);
    const safeValue = String(value).slice(0, 500);
    if (!safeKey) continue;
    out[safeKey] = safeValue;
  }
  return out;
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

    const {
      items = [],
      order_id,
      success_url,
      cancel_url,
      customer_email,
      metadata,
    } = req.body || {};

    let resolvedItems = items;
    let resolvedOrder = null;

    if (order_id) {
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .select('id, status, items, notes, restaurant_id, restaurant_name, user_id')
        .eq('id', String(order_id))
        .maybeSingle();

      if (orderError) {
        console.error('[STRIPE_ORDER_FETCH_ERROR]', orderError);
        return res.status(500).json({ ok: false, error: orderError.message || 'Failed to load order' });
      }

      if (!order?.id) {
        return res.status(404).json({ ok: false, error: 'Order not found' });
      }

      const currentStatus = String(order.status || '').toLowerCase();
      if (currentStatus === 'cancelled' || currentStatus === 'completed') {
        return res.status(409).json({ ok: false, error: `Order status "${currentStatus}" cannot be paid` });
      }

      const notes = String(order.notes || '');
      if (notes.includes('[stripe_test_paid:')) {
        return res.status(409).json({ ok: false, error: 'Order is already marked as paid in Stripe test mode' });
      }

      resolvedOrder = order;
      resolvedItems = orderItemsToStripeItems(order.items);
    }

    const line_items = toLineItems(resolvedItems);
    if (!line_items.length) {
      return res.status(400).json({ ok: false, error: 'No valid line items' });
    }

    const origin = req.headers.origin || 'http://localhost:5173';
    const safeOrderId = String(order_id || '').trim();
    const defaultSuccess = safeOrderId
      ? `${origin}/panel/client?section=orders&stripe=success&order_id=${encodeURIComponent(safeOrderId)}&session_id={CHECKOUT_SESSION_ID}`
      : `${origin}/panel/client?section=orders&stripe=success&session_id={CHECKOUT_SESSION_ID}`;
    const defaultCancel = safeOrderId
      ? `${origin}/panel/client?section=orders&stripe=cancel&order_id=${encodeURIComponent(safeOrderId)}`
      : `${origin}/panel/client?section=orders&stripe=cancel`;

    const successUrl = String(success_url || defaultSuccess);
    const cancelUrl = String(cancel_url || defaultCancel);
    const safeMetadata = sanitizeMetadata({
      ...(metadata || {}),
      order_id: safeOrderId || metadata?.order_id || '',
      restaurant_id: resolvedOrder?.restaurant_id || metadata?.restaurant_id || '',
      restaurant_name: resolvedOrder?.restaurant_name || metadata?.restaurant_name || '',
      user_id: resolvedOrder?.user_id || metadata?.user_id || '',
    });

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items,
      success_url: successUrl,
      cancel_url: cancelUrl,
      locale: 'pl',
      customer_email: customer_email ? String(customer_email) : undefined,
      client_reference_id: safeOrderId || undefined,
      metadata: safeMetadata,
      payment_intent_data: {
        metadata: safeMetadata,
      },
    });

    return res.status(200).json({
      ok: true,
      id: session.id,
      url: session.url,
    });
  } catch (error) {
    console.error('[STRIPE_CHECKOUT_SESSION_ERROR]', error);
    return res.status(500).json({
      ok: false,
      error: error?.message || 'Failed to create checkout session',
    });
  }
}
