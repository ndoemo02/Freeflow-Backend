import { createClient } from '@supabase/supabase-js';

const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2h

const memoryStore = new Map();
let supabaseClient = null;

function nowIso() {
    return new Date().toISOString();
}

function ensureSessionId(sessionId) {
    if (typeof sessionId !== 'string' || !sessionId.trim()) {
        const err = new Error('missing_session_id');
        err.statusCode = 400;
        throw err;
    }

    return sessionId.trim();
}

function parseTimestamp(value) {
    const parsed = Date.parse(value || '');
    return Number.isFinite(parsed) ? parsed : Date.now();
}

function isExpired(updatedAt) {
    return Date.now() - parseTimestamp(updatedAt) > SESSION_TTL_MS;
}

function hasSupabaseConfig() {
    return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function getSupabase() {
    if (!hasSupabaseConfig()) return null;

    if (!supabaseClient) {
        supabaseClient = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY,
            { auth: { persistSession: false } }
        );
    }

    return supabaseClient;
}

export async function loadSession(sessionId) {
    const normalizedSessionId = ensureSessionId(sessionId);
    const supabase = getSupabase();

    if (!supabase) {
        const entry = memoryStore.get(normalizedSessionId);
        if (!entry) return null;

        if (isExpired(entry.updated_at)) {
            memoryStore.delete(normalizedSessionId);
            return null;
        }

        return {
            id: normalizedSessionId,
            data: entry.data,
            updated_at: entry.updated_at,
        };
    }

    const { data, error } = await supabase
        .from('brain_sessions')
        .select('data, updated_at')
        .eq('id', normalizedSessionId)
        .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    if (isExpired(data.updated_at)) {
        try {
            await supabase.from('brain_sessions').delete().eq('id', normalizedSessionId);
        } catch {
            // Best effort ttl cleanup.
        }
        return null;
    }

    return {
        id: normalizedSessionId,
        data: data.data,
        updated_at: data.updated_at,
    };
}

export async function saveSession(session) {
    const normalizedSessionId = ensureSessionId(session?.id);
    const data = (session?.data && typeof session.data === 'object') ? session.data : {};
    const updatedAt = nowIso();
    const supabase = getSupabase();

    if (!supabase) {
        memoryStore.set(normalizedSessionId, {
            data,
            updated_at: updatedAt,
        });

        return {
            id: normalizedSessionId,
            data,
            updated_at: updatedAt,
        };
    }

    const { error } = await supabase
        .from('brain_sessions')
        .upsert(
            {
                id: normalizedSessionId,
                data,
                updated_at: updatedAt,
            },
            { onConflict: 'id' }
        );

    if (error) throw error;

    return {
        id: normalizedSessionId,
        data,
        updated_at: updatedAt,
    };
}

export async function touchSession(sessionId) {
    const normalizedSessionId = ensureSessionId(sessionId);
    const supabase = getSupabase();
    const updatedAt = nowIso();

    if (!supabase) {
        const entry = memoryStore.get(normalizedSessionId);
        if (!entry) return null;

        memoryStore.set(normalizedSessionId, {
            data: entry.data,
            updated_at: updatedAt,
        });

        return {
            id: normalizedSessionId,
            data: entry.data,
            updated_at: updatedAt,
        };
    }

    const { data, error } = await supabase
        .from('brain_sessions')
        .update({ updated_at: updatedAt })
        .eq('id', normalizedSessionId)
        .select('data, updated_at')
        .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return {
        id: normalizedSessionId,
        data: data.data,
        updated_at: data.updated_at,
    };
}
