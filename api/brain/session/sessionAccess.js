import { getDefault } from '../ai/contextState.js';
import { requireDemoSessionVenues } from '../../demo/demoVenueAccess.js';
import { authenticateOwner } from '../../_auth.js';
import { validateSessionId } from './sessionIdContract.js';

const failure = (code, statusCode) => Object.assign(new Error(code), { code, statusCode });

// Ownership lives in the existing private session JSON. Never claim an existing
// unowned row: it may contain another customer's conversation or cart.
export async function requireSessionAccess(req, sessionId) {
    const auth = await authenticateOwner(req);
    if (!auth.ok) throw failure('unauthorized', 401);
    const verdict = validateSessionId(sessionId);
    if (!verdict.ok) throw failure(verdict.error, 400);
    if (verdict.sessionId.startsWith('sess_payment_')) throw failure('session_not_owned', 403);
    const { supabase } = await import('../../_supabase.js');
    const read = () => supabase.from('brain_sessions').select('data').eq('id', verdict.sessionId).maybeSingle();
    let { data: row, error } = await read();
    if (error) throw failure('session_unavailable', 503);
    if (!row) {
        // INSERT, never UPSERT: two different users racing for the same ID
        // cannot overwrite the winner's ownership or session contents.
        const created = await supabase.from('brain_sessions').insert({
            id: verdict.sessionId, data: { ...getDefault(), ownerUserId: auth.userId }, updated_at: new Date().toISOString(),
        });
        if (created.error && created.error.code !== '23505') throw failure('session_unavailable', 503);
        ({ data: row, error } = await read());
        if (error || !row) throw failure('session_unavailable', 503);
    }
    if (row.data?.ownerUserId !== auth.userId) throw failure('session_not_owned', 403);
    await requireDemoSessionVenues(row.data);
    return auth;
}

export function sessionAccessError(error) {
    if (!['unauthorized', 'session_not_owned', 'session_unavailable', 'invalid_session_id', 'missing_session_id', 'venue_not_available', 'catalog_unavailable'].includes(error?.code)) return null;
    return { status: error.statusCode, body: { ok: false, error: error.code } };
}
