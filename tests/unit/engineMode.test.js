import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { vi } from 'vitest';
import {
    getEngineMode, isDev, isStable, isStrict,
    devLog, devWarn, devError,
    strictAssert, strictRequireSession, strictRequirePendingOrder,
    sanitizeResponse
} from '../../api/brain/core/engineMode.js';

describe('ENGINE_MODE System', () => {
    const originalMode = process.env.ENGINE_MODE;

    afterEach(() => {
        // Restore after each test
        if (originalMode !== undefined) {
            process.env.ENGINE_MODE = originalMode;
        } else {
            delete process.env.ENGINE_MODE;
        }
    });

    // ═══════════════════════════════════════════
    // 1. Mode detection
    // ═══════════════════════════════════════════

    describe('getEngineMode()', () => {
        it('defaults to "dev" when ENGINE_MODE is not set', () => {
            delete process.env.ENGINE_MODE;
            expect(getEngineMode()).toBe('dev');
        });

        it('returns "dev" for ENGINE_MODE=dev', () => {
            process.env.ENGINE_MODE = 'dev';
            expect(getEngineMode()).toBe('dev');
        });

        it('returns "stable" for ENGINE_MODE=stable', () => {
            process.env.ENGINE_MODE = 'stable';
            expect(getEngineMode()).toBe('stable');
        });

        it('returns "strict" for ENGINE_MODE=strict', () => {
            process.env.ENGINE_MODE = 'strict';
            expect(getEngineMode()).toBe('strict');
        });

        it('defaults to "dev" for invalid values', () => {
            process.env.ENGINE_MODE = 'turbo';
            expect(getEngineMode()).toBe('dev');
        });

        it('is case-insensitive', () => {
            process.env.ENGINE_MODE = 'STABLE';
            expect(getEngineMode()).toBe('stable');
        });
    });

    // ═══════════════════════════════════════════
    // 2. Boolean helpers
    // ═══════════════════════════════════════════

    describe('isDev() / isStable() / isStrict()', () => {
        it('isDev=true when mode is dev', () => {
            process.env.ENGINE_MODE = 'dev';
            expect(isDev()).toBe(true);
            expect(isStable()).toBe(false);
            expect(isStrict()).toBe(false);
        });

        it('isStable=true when mode is stable', () => {
            process.env.ENGINE_MODE = 'stable';
            expect(isDev()).toBe(false);
            expect(isStable()).toBe(true);
            expect(isStrict()).toBe(false);
        });

        it('isStrict=true when mode is strict', () => {
            process.env.ENGINE_MODE = 'strict';
            expect(isDev()).toBe(false);
            expect(isStable()).toBe(false);
            expect(isStrict()).toBe(true);
        });
    });

    // ═══════════════════════════════════════════
    // 3. Conditional logging
    // ═══════════════════════════════════════════

    describe('devLog / devWarn / devError', () => {
        it('devLog emits in dev mode', () => {
            process.env.ENGINE_MODE = 'dev';
            const spy = vi.spyOn(console, 'log').mockImplementation(() => { });
            devLog('hello');
            expect(spy).toHaveBeenCalledWith('hello');
            spy.mockRestore();
        });

        it('devLog is silent in stable mode', () => {
            process.env.ENGINE_MODE = 'stable';
            const spy = vi.spyOn(console, 'log').mockImplementation(() => { });
            devLog('hello');
            expect(spy).not.toHaveBeenCalled();
            spy.mockRestore();
        });

        it('devLog is silent in strict mode', () => {
            process.env.ENGINE_MODE = 'strict';
            const spy = vi.spyOn(console, 'log').mockImplementation(() => { });
            devLog('hello');
            expect(spy).not.toHaveBeenCalled();
            spy.mockRestore();
        });

        it('devWarn emits in dev mode', () => {
            process.env.ENGINE_MODE = 'dev';
            const spy = vi.spyOn(console, 'warn').mockImplementation(() => { });
            devWarn('warning');
            expect(spy).toHaveBeenCalledWith('warning');
            spy.mockRestore();
        });

        it('devError emits in dev AND strict', () => {
            process.env.ENGINE_MODE = 'strict';
            const spy = vi.spyOn(console, 'error').mockImplementation(() => { });
            devError('critical');
            expect(spy).toHaveBeenCalledWith('critical');
            spy.mockRestore();
        });

        it('devError is silent in stable mode', () => {
            process.env.ENGINE_MODE = 'stable';
            const spy = vi.spyOn(console, 'error').mockImplementation(() => { });
            devError('critical');
            expect(spy).not.toHaveBeenCalled();
            spy.mockRestore();
        });
    });

    // ═══════════════════════════════════════════
    // 4. Strict mode guards
    // ═══════════════════════════════════════════

    describe('strictAssert()', () => {
        it('does nothing when condition is true (any mode)', () => {
            process.env.ENGINE_MODE = 'strict';
            expect(() => strictAssert(true, 'should not throw')).not.toThrow();
        });

        it('throws in strict mode when condition is false', () => {
            process.env.ENGINE_MODE = 'strict';
            expect(() => strictAssert(false, 'broken invariant')).toThrow('[STRICT_MODE] broken invariant');
        });

        it('warns in dev mode when condition is false (does not throw)', () => {
            process.env.ENGINE_MODE = 'dev';
            const spy = vi.spyOn(console, 'warn').mockImplementation(() => { });
            expect(() => strictAssert(false, 'dev warning')).not.toThrow();
            expect(spy).toHaveBeenCalled();
            spy.mockRestore();
        });

        it('is completely silent in stable mode', () => {
            process.env.ENGINE_MODE = 'stable';
            const spy = vi.spyOn(console, 'warn').mockImplementation(() => { });
            expect(() => strictAssert(false, 'stable silent')).not.toThrow();
            expect(spy).not.toHaveBeenCalled();
            spy.mockRestore();
        });
    });

    describe('strictRequireSession()', () => {
        it('returns true for valid session', () => {
            process.env.ENGINE_MODE = 'strict';
            expect(strictRequireSession({ id: 1 }, 'abc')).toBe(true);
        });

        it('throws in strict mode for null session', () => {
            process.env.ENGINE_MODE = 'strict';
            expect(() => strictRequireSession(null, 'abc')).toThrow('[STRICT_MODE]');
        });

        it('returns false in stable mode for null session', () => {
            process.env.ENGINE_MODE = 'stable';
            expect(strictRequireSession(null, 'abc')).toBe(false);
        });
    });

    describe('strictRequirePendingOrder()', () => {
        it('returns true for valid pendingOrder', () => {
            process.env.ENGINE_MODE = 'strict';
            expect(strictRequirePendingOrder({ items: [{ name: 'Pizza' }] })).toBe(true);
        });

        it('throws in strict mode for empty pendingOrder', () => {
            process.env.ENGINE_MODE = 'strict';
            expect(() => strictRequirePendingOrder(null)).toThrow('[STRICT_MODE]');
            expect(() => strictRequirePendingOrder({ items: [] })).toThrow('[STRICT_MODE]');
        });
    });

    // ═══════════════════════════════════════════
    // 5. Response sanitizer
    // ═══════════════════════════════════════════

    describe('sanitizeResponse()', () => {
        const fullResponse = {
            ok: true,
            reply: 'Cześć!',
            intent: 'greeting',
            session_id: 'abc-123',
            context: { conversationPhase: 'idle', lastIntent: 'greeting' },
            turn_id: 'turn_123_abc',
            meta: {
                latency_total_ms: 42,
                source: 'pipeline_greeting_handler',
                styling_ms: 5,
                tts_ms: 100
            }
        };

        it('dev mode: returns full response unchanged', () => {
            process.env.ENGINE_MODE = 'dev';
            const result = sanitizeResponse(fullResponse);
            expect(result.context).toBeDefined();
            expect(result.turn_id).toBeDefined();
            expect(result.meta.source).toBeDefined();
        });

        it('stable mode: strips context, turn_id, debug meta', () => {
            process.env.ENGINE_MODE = 'stable';
            const result = sanitizeResponse(fullResponse);

            // Core fields preserved
            expect(result.ok).toBe(true);
            expect(result.reply).toBe('Cześć!');
            expect(result.intent).toBe('greeting');
            expect(result.session_id).toBe('abc-123');

            // Debug fields stripped
            expect(result.context).toBeUndefined();
            expect(result.turn_id).toBeUndefined();

            // Meta slimmed down — only latency
            expect(result.meta.latency_total_ms).toBe(42);
            expect(result.meta.source).toBeUndefined();
            expect(result.meta.styling_ms).toBeUndefined();
        });

        it('strict mode: same sanitization as stable', () => {
            process.env.ENGINE_MODE = 'strict';
            const result = sanitizeResponse(fullResponse);
            expect(result.context).toBeUndefined();
            expect(result.turn_id).toBeUndefined();
        });
    });
});
