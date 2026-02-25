/**
 * ENGINE MODE — Global Runtime Configuration
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Controls the verbosity, strictness, and debug surface of the entire pipeline.
 * 
 * MODES:
 *   dev    — verbose logs, debug snapshots, FSM transitions, invariant warnings
 *   stable — clean responses only, no debug meta, no classic warnings
 *   strict — QA mode: throws on state inconsistency, blocks invalid sessions
 * 
 * USAGE:
 *   import { getEngineMode, isDev, isStable, isStrict, devLog, devWarn } from './engineMode.js';
 * 
 * SET VIA:
 *   process.env.ENGINE_MODE = 'dev' | 'stable' | 'strict'
 *   (defaults to 'dev' if not set or invalid)
 * ═══════════════════════════════════════════════════════════════════════════
 */

const VALID_MODES = ['dev', 'stable', 'strict'];
const DEFAULT_MODE = 'dev';

/**
 * Read ENGINE_MODE from env. Called on every access to allow hot-reload in tests.
 * @returns {'dev'|'stable'|'strict'}
 */
export function getEngineMode() {
    const raw = (process.env.ENGINE_MODE || '').toLowerCase().trim();
    return VALID_MODES.includes(raw) ? raw : DEFAULT_MODE;
}

// ═══════════════════════════════════════════
// BOOLEAN HELPERS (hot: re-read env each call)
// ═══════════════════════════════════════════

/** True when ENGINE_MODE === 'dev' (or unset/invalid → defaults to dev) */
export function isDev() { return getEngineMode() === 'dev'; }

/** True when ENGINE_MODE === 'stable' */
export function isStable() { return getEngineMode() === 'stable'; }

/** True when ENGINE_MODE === 'strict' */
export function isStrict() { return getEngineMode() === 'strict'; }

// ═══════════════════════════════════════════
// CONDITIONAL LOGGING
// Only emit logs in dev mode. In stable/strict — silent.
// ═══════════════════════════════════════════

/**
 * console.log that only fires in dev mode.
 * Drop-in replacement for `console.log(...)` scattered across pipeline.
 */
export function devLog(...args) {
    if (isDev()) console.log(...args);
}

/**
 * console.warn that only fires in dev mode.
 */
export function devWarn(...args) {
    if (isDev()) console.warn(...args);
}

/**
 * console.error that fires in dev AND strict (never silent in strict).
 */
export function devError(...args) {
    if (isDev() || isStrict()) console.error(...args);
}

// ═══════════════════════════════════════════
// STRICT MODE GUARDS
// Throw hard errors if state invariants are broken.
// In dev/stable these are logged warnings at most.
// ═══════════════════════════════════════════

/**
 * Assert a condition. In strict mode, throws. In dev, warns. In stable, silent.
 * @param {boolean} condition 
 * @param {string} message 
 */
export function strictAssert(condition, message) {
    if (condition) return; // OK

    const mode = getEngineMode();

    if (mode === 'strict') {
        throw new Error(`[STRICT_MODE] ${message}`);
    }
    if (mode === 'dev') {
        console.warn(`⚠️ [DEV_ASSERT] ${message}`);
    }
    // stable → silent
}

/**
 * Validate that a session exists and is non-null. 
 * Strict: throws. Dev: warns. Stable: returns false.
 * @param {object|null|undefined} session 
 * @param {string} sessionId 
 * @returns {boolean} true if session is valid
 */
export function strictRequireSession(session, sessionId) {
    if (session && typeof session === 'object') return true;

    const msg = `Session "${sessionId}" is null/undefined — request cannot proceed`;
    strictAssert(false, msg);
    return false;
}

/**
 * Validate that pendingOrder exists before confirm_order.
 * Strict: throws. Dev: warns. Stable: returns false.
 * @param {object|null|undefined} pendingOrder 
 * @returns {boolean}
 */
export function strictRequirePendingOrder(pendingOrder) {
    const valid = pendingOrder && Array.isArray(pendingOrder.items) && pendingOrder.items.length > 0;
    if (valid) return true;

    const msg = 'confirm_order called but pendingOrder is empty or missing';
    strictAssert(false, msg);
    return false;
}

// ═══════════════════════════════════════════
// RESPONSE SANITIZER
// In stable mode, strip debug meta from API responses.
// ═══════════════════════════════════════════

/**
 * Clean response object before sending to client.
 * dev    → full response with debug meta
 * stable → strip debug fields (source, latency internals, context dump)
 * strict → same as stable (clean output) but errors throw earlier
 * @param {object} response 
 * @returns {object}
 */
export function sanitizeResponse(response) {
    if (isDev()) return response; // full debug

    // stable / strict → clean output
    const clean = { ...response };

    // Remove raw session dump
    delete clean.context;

    // Slim down meta — keep only essentials
    if (clean.meta) {
        const { latency_total_ms, source, ...debugMeta } = clean.meta;
        clean.meta = { latency_total_ms }; // keep only latency for monitoring
    }

    // Remove internal turn tracking
    delete clean.turn_id;

    return clean;
}
