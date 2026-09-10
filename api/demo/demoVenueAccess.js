import { supabase } from '../_supabase.js';

const fail = (code, statusCode) => Object.assign(new Error(code), { code, statusCode });

export async function requireDemoVenues(ids) {
    const wanted = [...new Set(ids.filter(Boolean).map(String))];
    if (!wanted.length) return;
    let result;
    try {
        result = await supabase.from('restaurants').select('id').in('id', wanted)
            .eq('is_active', true).eq('publication_status', 'demo_fictional');
    } catch { throw fail('catalog_unavailable', 503); }
    if (result.error) throw fail('catalog_unavailable', 503);
    const allowed = new Set((result.data || []).map(row => String(row.id)));
    if (wanted.some(id => !allowed.has(id))) throw fail('venue_not_available', 403);
}

// Recheck references in durable session data, including cached menu/list/cart
// entries. This does not grant access based on a remembered name or static ID.
export async function requireDemoSessionVenues(session) {
    const ids = [];
    const seen = new WeakSet();
    function visit(value, parentKey = '') {
        if (!value || typeof value !== 'object' || seen.has(value)) return;
        seen.add(value);
        if (Array.isArray(value)) { value.forEach(entry => visit(entry, parentKey)); return; }
        if (/restaurant/i.test(parentKey) && value.id) ids.push(value.id);
        for (const [key, entry] of Object.entries(value)) {
            if (/restaurant.*id$|^restaurant_id$/i.test(key) && typeof entry === 'string') ids.push(entry);
            else visit(entry, key);
        }
    }
    visit(session);
    await requireDemoVenues(ids);
}
