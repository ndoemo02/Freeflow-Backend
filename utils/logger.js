/* backend/utils/logger.js */

/**
 * Standardized Logger for Brain Debugging
 * ═══════════════════════════════════════════════════════════════════
 * Respects ENGINE_MODE:
 *   dev    → all logs enabled (via global.BRAIN_DEBUG OR isDev())
 *   stable → silent (no debug output)
 *   strict → only errors and assertion failures
 * ═══════════════════════════════════════════════════════════════════
 * Usage:
 *   import { BrainLogger } from "./utils/logger.js";
 *   BrainLogger.nlu("Matched intent:", "food.find");
 */

const LOG_TAGS = {
    NLU: '[NLU]',
    PIPELINE: '[PIPELINE]',
    SESSION: '[SESSION]',
    HANDLER: (name) => `[HANDLER:${name}]`
};

function shouldLog() {
    // Legacy: global.BRAIN_DEBUG still works
    if (global.BRAIN_DEBUG) return true;

    // ENGINE_MODE integration
    const mode = (process.env.ENGINE_MODE || '').toLowerCase().trim();
    return mode === 'dev' || mode === '';
}

export const BrainLogger = {
    /**
     * Internal safe log — gated by ENGINE_MODE or global.BRAIN_DEBUG
     */
    _log: (tag, ...args) => {
        if (shouldLog()) {
            console.log(tag, ...args);
        }
    },

    /**
     * Log NLU events (Intent detection, entities, scoring)
     */
    nlu: (...args) => BrainLogger._log(LOG_TAGS.NLU, ...args),

    /**
     * Log Pipeline events (Orchestration, flow control)
     */
    pipeline: (...args) => BrainLogger._log(LOG_TAGS.PIPELINE, ...args),

    /**
     * Log Session events (State changes, context updates)
     */
    session: (...args) => BrainLogger._log(LOG_TAGS.SESSION, ...args),

    /**
     * Log Handler specific events
     * @param {string} handlerName - Name of the handler e.g. 'food.find'
     * @param {...any} args - Log messages
     */
    handler: (handlerName, ...args) => BrainLogger._log(LOG_TAGS.HANDLER(handlerName), ...args),

    /**
     * Raw log for general brain debug
     */
    debug: (...args) => {
        if (shouldLog()) {
            console.log('[BRAIN]', ...args);
        }
    },

    /**
     * Always logs — for strict mode violations and critical errors
     */
    critical: (...args) => {
        console.error('[BRAIN:CRITICAL]', ...args);
    }
};
