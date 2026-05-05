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

export default async function handler(req, res) {
  // Manual CORS check specifically for this endpoint to ensure Vercel doesn't block it
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, X-Admin-Token'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // GET - pobierz zamówienia
  if (req.method === 'GET') {
    try {
      const { user_email, user_id, restaurant_id } = req.query;

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

      // Filtruj według parametrów
      if (restaurant_id) {
        query = query.eq('restaurant_id', restaurant_id);
      } else if (user_id) {
        query = query.eq('user_id', user_id);
      } else if (user_email) {
        // Dla kompatybilności - jeśli nie ma user_id, pobierz wszystkie zamówienia
        console.log('âš ď¸Ź user_email nie jest obsługiwane, pobieram wszystkie zamówienia');
      }

      const { data: orders, error } = await query;

      if (error) {
        console.error('âťŚ Błąd pobierania zamówień:', error);
        return res.status(500).json({ error: error.message });
      }

      return res.json({ orders: orders || [] });

    } catch (err) {
      console.error('đź”Ą Błąd GET orders:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  // POST - utwórz zamówienie
  if (req.method === 'POST') {
    try {
      // đź”Ą Check if this is a cart order (from frontend)
      if (req.body.restaurant_id && req.body.items && Array.isArray(req.body.items)) {
        console.log('đź›’ Cart order detected:', req.body);

        const { restaurant_id, items, user_id, restaurant_name, customer_name, customer_phone, delivery_address, notes } = req.body;

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

        // --- Currency Normalization Strategy ---
        // 1. If explicit total_cents is provided (New Frontend), use it as ground truth.
        // 2. If valid total_price (PLN) is provided, derive cents from it.
        // 3. Fallback: calculate from items.

        let finalCents = 0;
        let finalPLN = 0;

        if (total_cents !== undefined && total_cents !== null && !isNaN(Number(total_cents))) {
          finalCents = Number(total_cents);
          finalPLN = finalCents / 100;
        } else if (total_price !== undefined && total_price !== null && !isNaN(Number(total_price))) {
          // Heuristic: If total_price seems huge (legacy cents), treat as cents.
          // Note: Frontend update fixed this to send explicit floats for PLN.
          // But to be safe for mixed versions:
          // If we assume new frontend sends floats like 50.00, treat as PLN
          finalPLN = Number(total_price);
          finalCents = Math.round(finalPLN * 100);
        } else {
          // Calculate from items
          finalCents = items.reduce((sum, item) => sum + ((item.unit_price_cents || 0) * (item.qty || item.quantity || 1)), 0);
          finalPLN = finalCents / 100;
        }

        const requestedStatus = String(req.body?.status || '').trim().toLowerCase();
        const allowedStatuses = new Set(['pending', 'cancelled', 'confirmed']);
        const safeStatus = allowedStatuses.has(requestedStatus) ? requestedStatus : 'pending';

        const orderData = {
          user_id: user_id || null,
          restaurant_id: restaurant_id,
          restaurant_name: restaurant_name || 'Unknown Restaurant',
          items: items,
          total_price: finalPLN,   // PLN (float)
          // total_cents: finalCents, // Cents (integer) - Commented out to prevent "column does not exist" error
          status: safeStatus,
          customer_name: customer_name || null,
          customer_phone: customer_phone || null,
          delivery_address: delivery_address || null,
          notes: notes || null,
          created_at: new Date().toISOString(),
        };

        console.log('đź“ť Cart order data:', orderData);

        const { data: order, error: orderErr } = await supabase
          .from('orders')
          .insert([orderData])
          .select()
          .single();

        if (orderErr) {
          console.error('âťŚ Cart order error:', orderErr);
          return res.status(500).json({ error: orderErr.message });
        }

        console.log('âś… Cart order created:', order.id);
        return res.json({
          ok: true,
          id: order.id,
          order: order,
          message: 'Order created successfully'
        });
      }

      // đź”Ą Legacy order creation (voice commands)
      let { message, restaurant_name, user_email } = req.body;

      // Bezpieczny fallback dla undefined values
      const safeString = (v) => {
        if (v == null) return "";
        if (typeof v === "string") return v;
        if (typeof v === "number") return String(v);
        if (typeof v === "object") {
          if (v.name) return String(v.name);
          try { return JSON.stringify(v); } catch { return String(v); }
        }
        return String(v);
      };

      message = safeString(message);
      restaurant_name = safeString(restaurant_name);
      user_email = user_email || "";

      console.log("đźźˇ INPUT:", { message, restaurant_name, user_email });

      // Get user_id from Supabase Auth if available
      let user_id = null;
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
          const token = authHeader.substring(7);
          const { data: { user }, error } = await supabase.auth.getUser(token);
          if (user && !error) {
            user_id = user.id;
            console.log("âś… User authenticated:", user.email, "ID:", user_id);
          }
        } catch (authError) {
          console.log("âš ď¸Ź Auth error:", authError.message);
        }
      }

      // Pobierz restauracje
      console.log("đźŹŞ Pobieram listę restauracji...");
      const { data: restaurants, error: restErr } = await supabase.from("restaurants").select("*");
      if (restErr) throw restErr;
      console.log(`đź“‹ Znaleziono ${restaurants?.length || 0} restauracji`);

      const restMatch = findBestMatch(restaurants, restaurant_name, "name");
      if (!restMatch) {
        console.warn("âťŚ Nie znaleziono restauracji:", restaurant_name);
        return res.json({ reply: `Nie mogę znaleźć restauracji "${restaurant_name}".` });
      }

      console.log("âś… Restauracja dopasowana:", restMatch.name, "(ID:", restMatch.id, ")");

      // Pobierz menu restauracji
      console.log("đźŤ˝ď¸Ź Pobieram menu dla restauracji:", restMatch.id);
      const { data: menu, error: menuErr } = await supabase
        .from("menu_items")
        .select("*")
        .eq("restaurant_id", restMatch.id);

      if (menuErr || !menu?.length) {
        console.warn("âťŚ Brak menu dla:", restMatch.name, "Błąd:", menuErr);
        return res.json({ reply: `Nie znalazłem menu dla "${restMatch.name}".` });
      }

      console.log(`đź“‹ Znaleziono ${menu.length} pozycji w menu:`);
      menu.forEach((item, i) => {
        console.log(`  ${i + 1}. "${item.name}" - ${item.price} zł`);
      });

      // Parsuj ilość
      let quantity = 1;
      let cleaned = message;
      const match = message.match(/(\d+)\s*x\s*(.+)/i);
      if (match) {
        quantity = parseInt(match[1]);
        cleaned = match[2];
        console.log(`đź”˘ Parsowanie ilości: "${message}" â†’ ${quantity}x "${cleaned}"`);
      } else {
        console.log(`đź”˘ Brak ilości w komendzie, domyślnie: 1x "${cleaned}"`);
      }

      // Szukaj pozycji
      console.log("đź”Ť Szukam pozycji w menu...");
      const item = findBestMatch(menu, cleaned);
      if (!item) {
        console.warn("âťŚ Brak pozycji:", cleaned);
        return res.json({ reply: `Nie znalazłem "${cleaned}" w menu. Spróbuj powiedzieć np. "pizza" lub "burger".` });
      }

      console.log("âś… Pozycja dopasowana:", item.name, "-", item.price, "zł");

      // Dodaj zamówienie
      console.log("đź’ľ Tworzę zamówienie w bazie danych...");
      const orderData = {
        user_id: user_id || null,
        restaurant_id: restMatch.id,
        restaurant_name: restMatch.name,
        dish_name: item.name,
        total_price: item.price * quantity,
        items: [{
          name: item.name,
          price: item.price,
          quantity: quantity
        }],
        status: "pending",
      };

      console.log("đź“ť Dane zamówienia:", orderData);

      const { data: order, error: orderErr } = await supabase.from("orders").insert([orderData]).select();

      if (orderErr) {
        console.error("âťŚ Błąd tworzenia zamówienia:", orderErr);
        throw orderErr;
      }

      console.log("âś… Zamówienie utworzone:", order[0]?.id);

      const response = {
        reply: `Zamówiłem ${quantity}x ${item.name} w ${restMatch.name} za ${item.price * quantity} zł.`,
        order_id: order[0]?.id,
      };

      console.log("đź“¤ Odpowiedź:", response);
      return res.json(response);

    } catch (err) {
      console.error("đź”Ą Błąd POST orders:", err);
      return res.status(500).json({ error: err.message });
    }
  }

  // DELETE - usuń wszystkie zamówienia (dla testów)
  if (req.method === 'DELETE') {
    try {
      console.log('đź—‘ď¸Ź Usuwam wszystkie zamówienia...');

      const { error } = await supabase.from('orders').delete().neq('id', '00000000-0000-0000-0000-000000000000');

      if (error) {
        console.error('âťŚ Błąd usuwania zamówień:', error);
        return res.status(500).json({ error: error.message });
      }

      console.log('âś… Wszystkie zamówienia usunięte');
      return res.json({ message: 'All orders deleted successfully' });

    } catch (err) {
      console.error('đź”Ą Błąd DELETE orders:', err);
      return res.status(500).json({ error: err.message });
    }
  }
  // PATCH - update order status
  if (req.method === 'PATCH') {
    try {
      const orderId = req.url.split('/').pop();
      const { status, notes, user_id } = req.body || {};

      if (!orderId) {
        return res.status(400).json({ error: 'Missing order ID' });
      }

      const updatePayload = {};
      if (typeof status === 'string' && status.trim()) {
        updatePayload.status = status.trim();
      }
      if (typeof notes === 'string') {
        updatePayload.notes = notes;
      }
      if (typeof user_id === 'string' && user_id.trim()) {
        updatePayload.user_id = user_id.trim();
      }

      if (Object.keys(updatePayload).length === 0) {
        return res.status(400).json({ error: 'Missing update payload (status or notes or user_id)' });
      }

      console.log('[ORDERS_PATCH]', { orderId, updatePayload });

      const { data, error } = await supabase
        .from('orders')
        .update(updatePayload)
        .eq('id', orderId)
        .select()
        .single();

      if (error) {
        console.error('Error updating order:', error);
        return res.status(500).json({ error: error.message });
      }

      console.log('Order updated successfully:', data);
      return res.json({ ok: true, order: data });
    } catch (err) {
      console.error('PATCH orders error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  // Method not allowed
  return res.status(405).json({ error: 'Method not allowed' });
}


