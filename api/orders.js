import { createHash } from 'node:crypto';
import { priceOrder, cents, paymentError, canonicalJson } from './orders/orderPricing.js';
/**
 * api/orders.js
 * â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
 * @DEPRECATED dla Voice/Brain V2 flow
 * 
 * Zamówienia głosowe są teraz zapisywane w:
 *   api/brain/domains/food/confirmHandler.js â†’ persistOrderToDB()
 * 
 * Ten plik pozostaje TYLKO dla:
 *   - Manual UI checkout (CartContext.jsx)
 *   - Legacy voice commands (starszy flow)
 *   - GET/PATCH operacje na zamówieniach
 * 
 * NIE używaj tych endpointów dla nowych integracji Voice.
 * â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
 */

import { supabase } from "./_supabase.js";
import { applyCORS } from "./_cors.js";
import { normalizeTxt, levenshtein } from "./brain/helpers.js";
import { isAdminRequest, requireAdmin, requireOwner } from "./_auth.js";
import { requireSessionAccess, sessionAccessError } from './brain/session/sessionAccess.js';

/**
 * @DEPRECATED - Używaj ConfirmOrderHandler dla Voice flow
 */
export async function createOrderEndpoint(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ ok: false, error: "Method not allowed" });

  try {
    let { restaurant_id, items, sessionId } = req.body;

    // Bezpieczny fallback dla items (string vs array)
    if (typeof items === "string") {
      try {
        items = JSON.parse(items);
      } catch {
        items = [];
      }
    }

    if (!restaurant_id || !items?.length)
      return res.status(400).json({ ok: false, error: "Incomplete order data" });

    // Calculate total from items
    const total = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    const { data, error } = await supabase
      .from("orders")
      .insert([
        {
          restaurant_id: restaurant_id,
          user_id: null, // Guest order
          items: items,
          total_price: total,
          status: "pending",
          created_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (error) throw error;

    return res.status(200).json({ ok: true, id: data.id, items: data.items || [] });
  } catch (err) {
    console.error("âťŚ Order error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

// âś… Funkcje normalize i levenshtein zaimportowane z helpers.js (deduplikacja)

function findBestMatch(list, query, field = "name") {
  const safeString = (v) => {
    if (v == null) return "";
    if (typeof v === "string") return v;
    if (typeof v === "number") return String(v);
    if (typeof v === "object") {
      // Preferuj .name jeśli istnieje (np. restauracja)
      if (v.name) return String(v.name);
      try { return JSON.stringify(v); } catch { return String(v); }
    }
    return String(v);
  };

  const normQuery = normalizeTxt(safeString(query));
  if (!normQuery) {
    console.log("❌ Puste zapytanie — findBestMatch odrzucone");
    return null;
  }
  let best = null;
  let bestScore = Infinity;
  let exactMatch = null;

  console.log(`đź”Ť Szukam "${query}" (znormalizowane: "${normQuery}") w ${list.length} pozycjach`);

  for (const el of list) {
    const name = normalizeTxt(safeString(el[field]));

    // Sprawdź dokładne dopasowanie (includes)
    if (name.includes(normQuery)) {
      console.log(`âś… Dokładne dopasowanie: "${el[field]}" zawiera "${query}"`);
      exactMatch = el;
      break; // Priorytet dla dokładnych dopasowań
    }

    // Sprawdź podobieństwo Levenshtein
    const dist = levenshtein(name, normQuery);
    console.log(`đź“Š "${el[field]}" â†’ odległość: ${dist}`);

    if (dist < bestScore) {
      bestScore = dist;
      best = el;
    }
  }

  // Zwróć dokładne dopasowanie jeśli istnieje, w przeciwnym razie najlepsze podobieństwo
  const result = exactMatch || (bestScore <= 2 ? best : null);

  if (result) {
    console.log(`đźŽŻ WYBRANE: "${result[field]}" (typ: ${exactMatch ? 'dokładne' : 'podobieństwo'})`);
  } else {
    console.log(`âťŚ BRAK DOPASOWANIA: najlepsza odległość: ${bestScore}`);
  }

  return result;
}

/**
 * @DEPRECATED dla Voice/Brain V2 - używaj ConfirmOrderHandler â†’ persistOrderToDB()
 * Pozostawione dla legacy intent-router
 */
export async function createOrder(restaurantId, userId = "guest") {
  try {
    console.log(`đź›’ Tworzę zamówienie dla restauracji ${restaurantId}, użytkownik: ${userId}`);

    const orderData = {
      user_id: userId === "guest" ? null : userId,
      restaurant_id: restaurantId,
      status: "pending",
      created_at: new Date().toISOString(),
    };

    const { data: order, error } = await supabase
      .from("orders")
      .insert([orderData])
      .select()
      .single();

    if (error) {
      console.error("âťŚ Błąd tworzenia zamówienia:", error);
      throw error;
    }

    console.log("âś… Zamówienie utworzone:", order?.id);
    return order;

  } catch (err) {
    console.error("đź”Ą Błąd createOrder:", err);
    return null;
  }
}

// ===========================================================================
// T1 - kontrakt PATCH /api/orders/:id
// ===========================================================================

/**
 * Pola, ktore ogolny PATCH wolno zapisac.
 *
 * user_id jest CELOWO poza lista i nie moze do niej wrocic: pozwalalo
 * przepiac dowolne zamowienie na dowolnego uzytkownika bez jakiegokolwiek
 * dowodu wlasnosci. Powiazanie zamowienia z kontem po platnosci wymaga
 * osobnego, serwerowego kontraktu claim/finalize (dowod sesji albo tracking
 * token) - zaleznosc T5/T6, nie tego endpointu.
 */
const PATCH_ALLOWED_FIELDS = new Set(['status', 'notes']);

/**
 * allowed_status_values - DOWOD Z BAZY, nie z kodu.
 *
 * Zrodlo: constraint `orders_status_check` na public.orders, odczytany
 * 2026-08-08 z projektu ezemaacyyvbpjlagchds:
 *
 *   CHECK (status = ANY (ARRAY[
 *     'pending', 'preparing', 'completed', 'delivered', 'cancelled', 'accepted'
 *   ]))
 *
 * Pelny odczyt: docs/SUPABASE_LIVE_INVENTORY_2026-08-08.md
 *
 * Lista byla wczesniej wyprowadzona z kodu i miala siedem pozycji. Po odczycie
 * CHECK-a zostala ZAWEZONA do przeciecia z baza - usunieto 'confirmed'.
 *
 * UWAGA, ZNANY BLAD PRODUKCYJNY (poza zakresem T1, nie naprawiany tutaj):
 * wartosc 'confirmed' NIE jest dozwolona przez baze, a mimo to zapisuja ja
 *   - api/orders/finalizeOrder.js:44         (sciezka ZYWA, po platnosci Stripe)
 *   - api/brain/services/OrderPersistence.js:107 (sciezka wylaczona)
 *   - api/orders.js whitelist POST ponizej   (gdy klient poda status)
 * Kolumna orders.confirmed_at istnieje, wiec status byl zamierzony, ale nigdy
 * nie trafil do CHECK-a. Naprawa nalezy do T9 - wymaga decyzji, czy rozszerzyc
 * CHECK, czy zmienic kod na 'accepted'.
 *
 * Swiadomie NIEobecne: 'new' i 'ready' zyja wylacznie w UI KDS
 * (kdsApi.ts:306 mapuje pending->new przy renderze) i nigdy nie sa zapisywane.
 * Baza rowniez ich nie dopuszcza - zgodnie.
 *
 * CONTRACT_DECISION_REQUIRED: to jest domena WARTOSCI, nie graf PRZEJSC.
 * CHECK nie definiuje, ktory status wolno zmienic na ktory. Walidator przejsc
 * swiadomie nie jest tu zaimplementowany - wymaga osobnej decyzji kontraktowej.
 */
const ALLOWED_STATUS_VALUES = new Set([
  'pending',
  'preparing',
  'completed',
  'delivered',
  'cancelled',
  'accepted',
]);

/**
 * Wyciaga id zamowienia z zadania. Preferuje req.params.id (Express routuje
 * /api/orders/:id), a gdy go brak - ostatni segment sciezki z odcietym query
 * stringiem. Zwraca null dla /api/orders bez identyfikatora, zeby PATCH nie
 * celowal w zamowienie o id doslownie rownym "orders".
 */
function extractOrderId(req) {
  const fromParams = req?.params?.id;
  if (typeof fromParams === 'string' && fromParams.trim()) return fromParams.trim();

  const rawUrl = typeof req?.url === 'string' ? req.url : '';
  const path = rawUrl.split('?')[0].replace(/\/+$/, '');
  const last = path.split('/').pop() || '';
  if (!last || last === 'orders') return null;
  return last;
}

export default async function handler(req, res) {
  // Manual CORS check specifically for this endpoint to ensure Vercel doesn't block it
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  // T1: DELETE i PUT nie sa juz obslugiwane przez ten handler - nie ogloszaj ich.
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, X-Admin-Token, Idempotency-Key'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // GET - pobierz zamówienia
  if (req.method === 'GET') {
    try {
      const { user_id, restaurant_id } = req.query;
      const admin = isAdminRequest(req);
      const auth = admin ? null : await requireOwner(req, res);
      if (!admin && !auth) return;

      // Query parameters only narrow results; JWT identity grants customer access.
      if (!admin && user_id && user_id !== auth.userId) return res.status(404).json({ ok: false, error: 'not_found' });

      let query = supabase
        .from('orders')
        .select(`
          *,
          restaurants:restaurant_id (
            name,
            address
          )
        `)
        .order('created_at', { ascending: false });

      if (!admin) query = query.eq('user_id', auth.userId);
      const orderId = extractOrderId(req);
      if (orderId) query = query.eq('id', orderId);
      if (restaurant_id) {
        query = query.eq('restaurant_id', restaurant_id);
      } else if (user_id) {
        query = query.eq('user_id', user_id);
      }

      const { data: orders, error } = await query;

      if (error) {
        console.error('âťŚ Błąd pobierania zamówień:', error);
        return res.status(500).json({ error: error.message });
      }

      // restaurant_name nie jest kolumna orders w nowej bazie - dokladamy ja
      // do odpowiedzi z joina po restaurant_id, zeby konsumenci czytajacy
      // plaskie pole obiektu (ClientPanel.tsx, CustomerPanel.jsx) nie musieli sie zmieniac.
      const withRestaurantName = (orders || []).map(order => ({
        ...order,
        restaurant_name: order.restaurants?.name ?? order.restaurant_name ?? null,
      }));

      return res.json({ orders: withRestaurantName });

    } catch (err) {
      console.error('đź”Ą Błąd GET orders:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  // POST - utwórz zamówienie
  if (req.method === 'POST') {
    try {
      const auth = await requireOwner(req, res);
      if (!auth) return;
      const requestKey = req.headers['idempotency-key'];
      if (typeof requestKey !== 'string' || !/^[a-zA-Z0-9_-]{16,128}$/.test(requestKey)) throw paymentError('idempotency_key_required', 400);
      const idempotencyKey = createHash('sha256').update(`${auth.userId}:${requestKey}`).digest('hex');
      const sessionId = req.body?.session_id || req.headers['x-amber-session-id'] || null;
      if (sessionId) await requireSessionAccess(req, sessionId);
      // đź”Ą Check if this is a cart order (from frontend)
      if (req.body.restaurant_id && req.body.items && Array.isArray(req.body.items)) {


        const { restaurant_id, items, customer_name, customer_phone, delivery_address, notes } = req.body;

        let { total_price, total_cents } = req.body;

        if (!restaurant_id || !items?.length) {
          return res.status(400).json({ error: "Incomplete cart order data" });
        }

        // Validate UUID format for restaurant_id
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(restaurant_id)) {
          console.error('âťŚ Invalid restaurant_id format:', restaurant_id);
          return res.status(400).json({
            error: `Nieprawidłowy identyfikator restauracji. Proszę odświeżyć stronę i spróbować ponownie.`,
            code: 'INVALID_RESTAURANT_ID',
            received: restaurant_id
          });
        }

        const priced = await priceOrder(restaurant_id, items);
        if ((total_cents != null && (!Number.isSafeInteger(total_cents) || total_cents !== priced.totalCents))
            || (total_price != null && cents(total_price) !== priced.totalCents)) {
          throw paymentError('price_changed_review_required');
        }

        const orderData = {
          idempotency_key: idempotencyKey,
          user_id: auth.userId,
          session_id: sessionId,
          restaurant_id: restaurant_id,
          items: priced.items,
          total_price: priced.totalCents / 100,
          status: 'pending',
          customer_name: customer_name || null,
          customer_phone: customer_phone || null,
          delivery_address: delivery_address || null,
          notes: notes || null,
          created_at: new Date().toISOString(),
        };



        let { data: order, error: orderErr } = await supabase
          .from('orders')
          .insert([orderData])
          .select()
          .single();

        if (orderErr?.code === '23505') {
          const existing = await supabase.from('orders').select('*').eq('idempotency_key', idempotencyKey).eq('user_id', auth.userId).maybeSingle();
          if (existing.error || !existing.data) throw paymentError('order_unavailable', 503);
          order = existing.data;
          const same = ['restaurant_id', 'session_id', 'customer_name', 'customer_phone', 'delivery_address', 'notes'].every(key => order[key] === orderData[key])
            && Number(order.total_price) === orderData.total_price && canonicalJson(order.items) === canonicalJson(orderData.items);
          if (!same) throw paymentError('idempotency_conflict');
          // A retry must not clear a newer cart from this session.
          return res.json({ ok: true, id: order.id, order });
        }
        if (orderErr) throw paymentError('order_unavailable', 503);

        console.log('✅ Cart order created:', order.id);

        // Clear session cart after successful order placement (Voice Live flow)
        try {
          const { getSession, updateSession } = await import('./brain/session/sessionStore.js');
          const sessionId = req.body.session_id || req.headers['x-amber-session-id'] || null;
          if (sessionId) {
            const snap = getSession(sessionId);
            if (snap && snap.cart) {
              updateSession(sessionId, {
                cart: { items: [], total: 0 },
                lastOrderId: order.id,
                orderMode: 'completed',
                expectedContext: null,
                pendingOrder: null,
                currentRestaurant: null,
                lastRestaurant: null,
              });
              console.log('🧹 Session cart cleared after order:', order.id);
            }
          }
        } catch (clearErr) {
          console.error('⚠️ Failed to clear session cart:', clearErr.message);
        }

        return res.json({
          ok: true,
          id: order.id,
          order: order,
          message: 'Order created successfully'
        });
      }

      // đź”Ą Legacy order creation (voice commands)
      return res.status(400).json({ ok: false, error: 'structured_cart_required' });

    } catch (err) {
      const failure = sessionAccessError(err);
      if (failure) return res.status(failure.status).json(failure.body);
      if (err.code && err.statusCode) return res.status(err.statusCode).json({ ok: false, error: err.code });
      console.error("đź”Ą Błąd POST orders:", err);
      return res.status(500).json({ error: err.message });
    }
  }

  // PATCH - update order status
  if (req.method === 'PATCH') {
    // T1 (etap 1 z SS9): PATCH mutuje CUDZE zamowienia, wiec wymaga autoryzacji.
    // Przed zmiana dowolny anonimowy klient zmienial status, notatki i wlasciciela
    // dowolnego zamowienia, znajac wylacznie jego id.
    if (!requireAdmin(req, res)) return;

    try {
      const orderId = extractOrderId(req);
      if (!orderId) {
        return res.status(400).json({ ok: false, error: 'missing_order_id' });
      }

      const body =
        req.body && typeof req.body === 'object' && !Array.isArray(req.body)
          ? req.body
          : {};
      const providedKeys = Object.keys(body);

      if (providedKeys.length === 0) {
        return res.status(400).json({
          ok: false,
          error: 'empty_payload',
          allowed: [...PATCH_ALLOWED_FIELDS],
        });
      }

      // Allowlista pol. Cokolwiek spoza niej odrzuca CALE zadanie - payload
      // z dodatkowym polem nie moze zostac zastosowany czesciowo.
      const rejectedFields = providedKeys.filter((k) => !PATCH_ALLOWED_FIELDS.has(k));
      if (rejectedFields.length > 0) {
        return res.status(400).json({
          ok: false,
          error: 'field_not_allowed',
          fields: rejectedFields,
          allowed: [...PATCH_ALLOWED_FIELDS],
          detail: 'Zadanie odrzucone w calosci - zadne pole nie zostalo zapisane.',
        });
      }

      const updatePayload = {};

      if ('status' in body) {
        const status = typeof body.status === 'string' ? body.status.trim() : '';
        if (!status) {
          return res.status(400).json({ ok: false, error: 'invalid_status' });
        }
        if (!ALLOWED_STATUS_VALUES.has(status)) {
          return res.status(400).json({
            ok: false,
            error: 'status_not_allowed',
            allowed: [...ALLOWED_STATUS_VALUES],
          });
        }
        updatePayload.status = status;
      }

      if ('notes' in body) {
        if (typeof body.notes !== 'string') {
          return res.status(400).json({ ok: false, error: 'invalid_notes' });
        }
        updatePayload.notes = body.notes;
      }

      // Loguj wylacznie nazwy pol. Wartosci (notes) moga zawierac dane klienta.
      console.log('[ORDERS_PATCH]', { orderId, fields: Object.keys(updatePayload) });

      const { data, error } = await supabase
        .from('orders')
        .update(updatePayload)
        .eq('id', orderId)
        .select()
        .single();

      if (error) {
        console.error('[ORDERS_PATCH] blad aktualizacji:', error.message);
        return res.status(500).json({ error: error.message });
      }

      return res.json({ ok: true, order: data });
    } catch (err) {
      console.error('[ORDERS_PATCH] wyjatek:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  // Method not allowed
  return res.status(405).json({ error: 'Method not allowed' });
}


