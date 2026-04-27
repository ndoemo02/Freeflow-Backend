const DEFAULT_LIVE_ALLOWED_ORIGINS = Object.freeze([
    'https://freeflow-frontend-seven.vercel.app',
    'https://freeflow-frontend.vercel.app',
    'https://freeflow-final.vercel.app',
    'http://localhost:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5173',
]);

function normalizeOrigin(origin) {
    return String(origin || '').trim().toLowerCase();
}

function isProductionEnv() {
    return String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production';
}

function parseBoolean(value, fallback) {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return fallback;
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
    if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
    return fallback;
}

function safeUrl(input) {
    try {
        return new URL(String(input || '').trim());
    } catch {
        return null;
    }
}

function isLoopbackHost(hostname) {
    const host = String(hostname || '').trim().toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

function isPrivateIpv4(hostname) {
    const match = String(hostname || '').trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (!match) return false;
    const octets = [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4])];
    if (octets.some((value) => !Number.isFinite(value) || value < 0 || value > 255)) return false;
    const [a, b] = octets;
    if (a === 10) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    return false;
}

function isPrivateNetworkOrigin(origin) {
    const parsed = safeUrl(origin);
    if (!parsed) return false;
    const protocol = String(parsed.protocol || '').toLowerCase();
    if (protocol !== 'http:' && protocol !== 'https:') return false;
    const host = String(parsed.hostname || '').toLowerCase();
    return isLoopbackHost(host) || isPrivateIpv4(host) || host.endsWith('.local');
}

function isPrivateNetworkOriginAllowed() {
    return parseBoolean(process.env.LIVE_ALLOW_PRIVATE_NETWORK_ORIGINS, !isProductionEnv());
}

function parseAllowedOriginsFromEnv() {
    const raw = String(process.env.LIVE_ALLOWED_ORIGINS || '').trim();
    const envOrigins = raw
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
    const dynamicCandidates = [
        process.env.FRONTEND_URL,
        process.env.APP_URL,
        process.env.WEB_URL,
        process.env.VITE_FRONTEND_URL,
        process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '',
    ]
        .map((value) => String(value || '').trim())
        .filter(Boolean)
        .filter((value) => safeUrl(value));

    const baseOrigins = envOrigins.length > 0 ? envOrigins : DEFAULT_LIVE_ALLOWED_ORIGINS;
    const merged = new Set([...baseOrigins, ...dynamicCandidates]);
    return Array.from(merged);
}

function isTunnelOrigin(origin) {
    return origin.includes('trycloudflare.com');
}

export function isLiveStrictOriginEnabled() {
    const raw = String(process.env.LIVE_STRICT_ORIGIN || '').trim();
    if (!raw) return isProductionEnv();
    return parseBoolean(raw, true);
}

export function isLiveOriginAllowed(origin) {
    const normalized = normalizeOrigin(origin);
    if (!normalized) return false;
    if (isTunnelOrigin(normalized)) return true;

    const allowedOrigins = parseAllowedOriginsFromEnv();
    if (allowedOrigins.some((allowed) => normalized === normalizeOrigin(allowed))) {
        return true;
    }

    if (isPrivateNetworkOriginAllowed() && isPrivateNetworkOrigin(normalized)) {
        return true;
    }

    return false;
}

export function validateLiveOrigin(origin) {
    if (!isLiveStrictOriginEnabled()) {
        return { ok: true, reason: 'origin_check_disabled' };
    }
    if (!origin) {
        return { ok: false, reason: 'missing_origin' };
    }
    if (!isLiveOriginAllowed(origin)) {
        return { ok: false, reason: 'origin_not_allowed' };
    }
    return { ok: true, reason: 'origin_allowed' };
}

export function validateLiveInternalKey(headers = {}) {
    const expected = String(process.env.LIVE_INTERNAL_KEY || '').trim();
    if (!expected) {
        return { ok: true, reason: 'internal_key_disabled' };
    }
    const provided = String(headers['x-live-internal-key'] || '').trim();
    if (!provided) {
        return { ok: false, reason: 'missing_internal_key' };
    }
    if (provided !== expected) {
        return { ok: false, reason: 'invalid_internal_key' };
    }
    return { ok: true, reason: 'internal_key_ok' };
}

export function summarizeLiveToolResult(result, toolName) {
    const response = result?.response || {};
    const meta = response?.meta || {};
    const liveToolMeta = meta?.liveTool || {};
    const matchMeta = meta?.match || {};
    const topMatchRaw = matchMeta?.topMatch || response?.topMatch || null;
    const topMatch =
        (typeof topMatchRaw === 'string' && topMatchRaw.trim())
        || topMatchRaw?.name
        || topMatchRaw?.dish
        || null;
    const topScoreRaw = matchMeta?.score ?? topMatchRaw?.score ?? null;
    const topScore = Number.isFinite(Number(topScoreRaw)) ? Number(topScoreRaw) : null;
    const candidateCountRaw =
        matchMeta?.candidateCount
        ?? response?.candidateCount
        ?? (Array.isArray(response?.restaurants) ? response.restaurants.length : null);
    const candidateCount = Number.isFinite(Number(candidateCountRaw)) ? Number(candidateCountRaw) : null;
    const intent = response?.intent || liveToolMeta?.runtimeIntent || toolName || 'unknown';
    const restaurantLocked = Boolean(
        response?.restaurantLocked
        ?? meta?.restaurantLocked
        ?? liveToolMeta?.restaurantLocked
        ?? response?.context?.restaurantLocked,
    );

    return {
        intent,
        restaurantLocked,
        candidateCount,
        topMatch,
        score: topScore,
    };
}
