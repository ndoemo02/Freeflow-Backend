import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    applyHandlerDecision,
    applyRouterDecision,
    attachTurnTraceToLiveToolMeta,
    createTurnTrace,
    finalizeTurnTrace,
} from '../liveTurnLedger.js';

describe('liveTurnLedger', () => {
    const originalDebugFlag = process.env.DEBUG_LIVE_FLOW;
    let logSpy;

    beforeEach(() => {
        logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        if (originalDebugFlag == null) {
            delete process.env.DEBUG_LIVE_FLOW;
        } else {
            process.env.DEBUG_LIVE_FLOW = originalDebugFlag;
        }
        vi.restoreAllMocks();
    });

    it('returns no-op values and does not log when DEBUG_LIVE_FLOW is false', () => {
        process.env.DEBUG_LIVE_FLOW = 'false';

        const trace = createTurnTrace({
            sessionId: 's1',
            turnId: 't1',
            toolName: 'add_item_to_cart',
            rawArgs: { dish: 'pierogi' },
        });

        expect(trace).toBeNull();
        expect(finalizeTurnTrace(trace)).toBeNull();
        expect(logSpy).not.toHaveBeenCalled();
    });

    it('truncates long text values before finalizing', () => {
        process.env.DEBUG_LIVE_FLOW = 'true';
        const longText = 'x'.repeat(700);

        const trace = createTurnTrace({
            sessionId: 's1',
            toolName: 'add_item_to_cart',
            rawArgs: { dish: longText },
            rawTranscript: longText,
            finalTranscript: longText,
        });
        const finalized = finalizeTurnTrace(trace);

        expect(finalized.tool_call.raw_args.dish).toHaveLength(500);
        expect(finalized.tool_call.raw_args.dish.endsWith('...')).toBe(true);
        expect(finalized.stt.raw_transcript).toHaveLength(500);
    });

    it('redacts audio, base64, and blob-like fields', () => {
        process.env.DEBUG_LIVE_FLOW = 'true';

        const trace = createTurnTrace({
            toolName: 'add_item_to_cart',
            rawArgs: {
                dish: 'pierogi',
                raw_audio: 'abc',
                payload_base64: 'abc',
                blob: 'abc',
                pcmData: 'abc',
                wave_form: 'abc',
            },
        });
        const finalized = finalizeTurnTrace(trace);

        expect(finalized.tool_call.raw_args.dish).toBe('pierogi');
        expect(finalized.tool_call.raw_args.raw_audio).toBe('[redacted]');
        expect(finalized.tool_call.raw_args.payload_base64).toBe('[redacted]');
        expect(finalized.tool_call.raw_args.blob).toBe('[redacted]');
        expect(finalized.tool_call.raw_args.pcmData).toBe('[redacted]');
        expect(finalized.tool_call.raw_args.wave_form).toBe('[redacted]');
    });

    it('redacts secret-like fields by key name', () => {
        process.env.DEBUG_LIVE_FLOW = 'true';

        const trace = createTurnTrace({
            toolName: 'add_item_to_cart',
            rawArgs: {
                token: 't',
                secret: 's',
                apiKey: 'k',
                api_key: 'k2',
                authorization: 'Bearer abc',
                password: 'p',
                cookie: 'c',
                bearer: 'b',
                supabase_key: 'sb',
                service_role: 'role',
                nested: { service_role: 'nested-role' },
            },
        });
        const finalized = finalizeTurnTrace(trace);

        expect(finalized.tool_call.raw_args).toMatchObject({
            token: '[redacted]',
            secret: '[redacted]',
            apiKey: '[redacted]',
            api_key: '[redacted]',
            authorization: '[redacted]',
            password: '[redacted]',
            cookie: '[redacted]',
            bearer: '[redacted]',
            supabase_key: '[redacted]',
            service_role: '[redacted]',
            nested: { service_role: '[redacted]' },
        });
    });

    it('does not throw when a sanitized object has a throwing getter', () => {
        process.env.DEBUG_LIVE_FLOW = 'true';
        const rawArgs = {};
        Object.defineProperty(rawArgs, 'dish', {
            enumerable: true,
            get() {
                throw new Error('getter exploded');
            },
        });

        let trace;
        expect(() => {
            trace = createTurnTrace({ toolName: 'add_item_to_cart', rawArgs });
        }).not.toThrow();
        expect(() => finalizeTurnTrace(trace)).not.toThrow();
    });

    it('warns when args.text and args.dish look like different turns', () => {
        process.env.DEBUG_LIVE_FLOW = 'true';
        let trace = createTurnTrace({
            toolName: 'add_item_to_cart',
            rawArgs: { text: 'show me sushi nearby', dish: 'nalesniki z serem' },
        });

        trace = applyRouterDecision(trace, {
            mappedText: 'show me sushi nearby',
            mappedIntent: 'create_order',
            runtimeIntent: 'create_order',
            args: { text: 'show me sushi nearby', dish: 'nalesniki z serem' },
            session: {},
        });

        expect(trace.warnings.some((warning) => warning.code === 'TEXT_DISH_MISMATCH')).toBe(true);
    });

    it('warns when requested dish is absent from available menu candidates', () => {
        process.env.DEBUG_LIVE_FLOW = 'true';
        let trace = createTurnTrace({
            toolName: 'add_item_to_cart',
            rawArgs: { dish: 'ramen' },
        });

        trace = applyRouterDecision(trace, {
            mappedText: 'ramen',
            mappedIntent: 'create_order',
            runtimeIntent: 'create_order',
            args: { dish: 'ramen' },
            session: { menuItems: [{ name: 'Pierogi ruskie' }, { name: 'Nalesniki' }] },
        });

        expect(trace.warnings.some((warning) => warning.code === 'NON_MENU_RECOMMENDATION')).toBe(true);
    });

    it('warns when a success-like cart mutation has no cart delta', () => {
        process.env.DEBUG_LIVE_FLOW = 'true';
        let trace = createTurnTrace({
            toolName: 'add_item_to_cart',
            rawArgs: { dish: 'pierogi' },
        });

        trace = applyHandlerDecision(trace, {
            domainResponse: { ok: true, intent: 'create_order', reply: 'Dodalam pierogi do koszyka.' },
            cartBefore: { items: [], total: 0 },
            cartAfter: { items: [], total: 0 },
            cartChanged: false,
            cartMutationPath: true,
            responseSuggestsSuccess: true,
        });

        expect(trace.warnings.some((warning) => warning.code === 'SUCCESS_WITHOUT_CART_DELTA')).toBe(true);
    });

    it('attaches turnTrace to response.meta.liveTool only when debug trace exists', () => {
        const response = { meta: { liveTool: { toolName: 'add_item_to_cart' } } };
        process.env.DEBUG_LIVE_FLOW = 'false';

        expect(attachTurnTraceToLiveToolMeta(response, { schema: 'freeflow.turn_trace.v1' })).toBe(response);
        expect(response.meta.liveTool.turnTrace).toBeUndefined();

        process.env.DEBUG_LIVE_FLOW = 'true';
        const trace = createTurnTrace({ toolName: 'add_item_to_cart', rawArgs: { dish: 'pierogi' } });
        const finalized = finalizeTurnTrace(trace);

        attachTurnTraceToLiveToolMeta(response, finalized);
        expect(response.meta.liveTool.turnTrace).toBe(finalized);
    });
});
