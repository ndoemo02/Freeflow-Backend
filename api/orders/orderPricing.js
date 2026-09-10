import { createHash } from 'node:crypto';
import { supabase } from '../_supabase.js';
import { requireDemoVenues } from '../demo/demoVenueAccess.js';
export const paymentError = (code, statusCode = 409) => Object.assign(new Error(code), { code, statusCode });
export function cents(value) {
    if (!/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(String(value))) throw paymentError('invalid_price', 400);
    const amount = Math.round(Number(value) * 100);
    if (!Number.isSafeInteger(amount) || amount <= 0) throw paymentError('invalid_price', 400);
    return amount;
}
export async function priceOrder(restaurantId, requested) {
    await requireDemoVenues([restaurantId]);
    if (!Array.isArray(requested) || !requested.length || requested.length > 100) throw paymentError('invalid_items', 400);
    const lines = requested.map(item => {
        const ids = [item?.menu_item_id, item?.menuItemId, item?.id].filter(Boolean).map(String);
        if (!ids.length || new Set(ids).size !== 1) throw paymentError('invalid_menu_item', 400);
        const qty = item.qty ?? item.quantity;
        if (!Number.isSafeInteger(qty) || qty < 1 || qty > 99 || (item.quantity != null && item.qty != null && item.quantity !== item.qty)) throw paymentError('invalid_quantity', 400);
        return { id: ids[0], qty, instructions: typeof item.special_instructions === 'string' ? item.special_instructions.slice(0, 1000) : null };
    });
    const ids = [...new Set(lines.map(line => line.id))];
    const { data, error } = await supabase.from('menu_items_v2').select('id,name,price_pln,restaurant_id,available')
        .eq('restaurant_id', restaurantId).eq('available', true).in('id', ids);
    if (error) throw paymentError('catalog_unavailable', 503);
    const byId = new Map((data || []).map(item => [String(item.id), item]));
    const quantities = new Map();
    const items = lines.map(line => {
        const menu = byId.get(line.id);
        if (!menu) throw paymentError('menu_item_unavailable');
        quantities.set(line.id, (quantities.get(line.id) || 0) + line.qty);
        if (quantities.get(line.id) > 99) throw paymentError('invalid_quantity', 400);
        const unit = cents(menu.price_pln);
        return { menu_item_id: line.id, name: menu.name, qty: line.qty, quantity: line.qty,
            unit_price_cents: unit, price_pln: unit / 100, special_instructions: line.instructions, pricing_version: 1 };
    });
    const totalCents = items.reduce((sum, item) => sum + item.unit_price_cents * item.qty, 0);
    if (!Number.isSafeInteger(totalCents)) throw paymentError('invalid_total', 400);
    return { items, totalCents };
}
export function canonicalJson(value) {
    const normalize = item => Array.isArray(item) ? item.map(normalize)
        : item && typeof item === 'object' ? Object.fromEntries(Object.keys(item).sort().map(key => [key, normalize(item[key])])) : item;
    return JSON.stringify(normalize(value));
}
export function orderSnapshot(order) {
    if (!Array.isArray(order.items) || !order.items.length || order.items.some(item => item.pricing_version !== 1
        || !Number.isSafeInteger(item.qty) || item.qty < 1 || item.qty > 99
        || !Number.isSafeInteger(item.unit_price_cents) || item.unit_price_cents <= 0 || !item.menu_item_id)) throw paymentError('order_requires_review');
    const totalCents = order.items.reduce((sum, item) => sum + item.qty * item.unit_price_cents, 0);
    if (!Number.isSafeInteger(totalCents) || totalCents !== cents(order.total_price)) throw paymentError('order_amount_mismatch');
    const digest = createHash('sha256').update(canonicalJson({ restaurantId: order.restaurant_id, items: order.items, totalCents })).digest('hex');
    return { totalCents, digest };
}
