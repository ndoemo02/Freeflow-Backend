/**
 * Unit test: stylizeWithGPT4o fallback chain + circuit breaker (429).
 *
 * Covers:
 *  1. OpenAI 429 → Gemini fallback → STYLIZE_PROVIDER_TRACE emitted
 *  2. Circuit breaker suppresses OpenAI for 5 min after first 429
 *  3. Gemini unavailable + OpenAI 429 → deterministic fallback (rawText returned)
 *  4. Happy path: OpenAI succeeds → no fallback
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Shared mock — all tests control this single `create` function so the
// cached `openaiClient` singleton always delegates to the same reference.
const mockCreate = vi.fn();

vi.mock('../../config/configService.js', () => ({
    getConfig: vi.fn().mockResolvedValue({}),
}));
vi.mock('../utils/googleAuth.js', () => ({
    getVertexAccessToken: vi.fn().mockResolvedValue('fake-token'),
}));
vi.mock('@google-cloud/vertexai', () => ({
    VertexAI: vi.fn().mockImplementation(() => ({
        getGenerativeModel: vi.fn().mockReturnValue({}),
    })),
}));
vi.mock('openai', () => ({
    default: vi.fn().mockImplementation(() => ({
        chat: { completions: { create: mockCreate } },
    })),
}));

const { stylizeWithGPT4o, _stylize429CB, clearTtsCaches } =
    await import('../tts/ttsClient.js');

// Helper: capture console.log JSON events
function captureLogEvents(fn) {
    const events = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((line) => {
        try { events.push(JSON.parse(line)); } catch { /* non-JSON skipped */ }
    });
    return { events, spy };
}

describe('stylizeWithGPT4o fallback chain', () => {
    beforeEach(() => {
        _stylize429CB.suppressedUntil = 0;
        _stylize429CB.count = 0;
        clearTtsCaches();
        mockCreate.mockReset();
        process.env.OPENAI_MODEL = 'gpt-4o-mini';
        process.env.OPENAI_API_KEY = 'sk-test';
        process.env.GEMINI_API_KEY = 'gemini-test-key';
        process.env.NODE_ENV = 'not-test';
        process.env.OPENAI_STREAM = 'false';
    });

    afterEach(() => {
        vi.restoreAllMocks();
        process.env.NODE_ENV = 'test';
        delete process.env.GEMINI_API_KEY;
    });

    it('429 from OpenAI → falls back to Gemini, emits STYLIZE_PROVIDER_TRACE fallbackUsed=true', async () => {
        mockCreate.mockRejectedValue(
            Object.assign(new Error('429 Too Many Requests'), { status: 429 })
        );

        const geminiReply = 'Gotowe zamówienie czeka na Ciebie!';
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                candidates: [{ content: { parts: [{ text: geminiReply }] } }],
            }),
        }));

        const { events, spy } = captureLogEvents();
        const result = await stylizeWithGPT4o('Zamówienie zostało złożone.', 'confirm_order');
        spy.mockRestore();

        expect(result).toBe(geminiReply);
        const trace = events.find(e => e.event === 'STYLIZE_PROVIDER_TRACE');
        expect(trace).toBeDefined();
        expect(trace.provider).toBe('gemini');
        expect(trace.fallbackUsed).toBe(true);
    });

    it('429 activates circuit breaker — second call skips OpenAI entirely', async () => {
        // Pre-set the circuit breaker as if 429 already fired
        _stylize429CB.suppressedUntil = Date.now() + 5 * 60 * 1000;
        _stylize429CB.count = 1;

        const geminiReply = 'Podajemy zaraz!';
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                candidates: [{ content: { parts: [{ text: geminiReply }] } }],
            }),
        }));

        const result = await stylizeWithGPT4o('Podajemy Twoje danie.', 'create_order');

        expect(mockCreate).not.toHaveBeenCalled();
        expect(result).toBe(geminiReply);
    });

    it('OpenAI 429 + Gemini unavailable → returns rawText (deterministic fallback)', async () => {
        mockCreate.mockRejectedValue(
            Object.assign(new Error('429'), { status: 429 })
        );
        delete process.env.GEMINI_API_KEY;

        const rawText = 'Twoje zamówienie jest gotowe.';
        const result = await stylizeWithGPT4o(rawText, 'confirm_order');

        expect(result).toBe(rawText);
    });

    it('OpenAI succeeds → returns styled text, STYLIZE_PROVIDER_TRACE provider=openai fallbackUsed=false', async () => {
        const styledReply = 'Twoje zamówienie leci do kuchni!';
        mockCreate.mockResolvedValue({
            choices: [{ message: { content: styledReply } }],
        });

        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        const { events, spy } = captureLogEvents();
        const result = await stylizeWithGPT4o('Zamówienie przyjęte.', 'create_order');
        spy.mockRestore();

        expect(result).toBe(styledReply);
        expect(fetchMock).not.toHaveBeenCalled();
        const trace = events.find(e => e.event === 'STYLIZE_PROVIDER_TRACE');
        expect(trace).toBeDefined();
        expect(trace.provider).toBe('openai');
        expect(trace.fallbackUsed).toBe(false);
    });
});
