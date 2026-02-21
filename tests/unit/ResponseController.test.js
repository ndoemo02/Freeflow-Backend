import { describe, it, expect } from 'vitest';
import {
    finalizeResponse,
    isResponseFinalized,
    resetFinalizationFlag,
    getResponseControllerConfig
} from '../../api/brain/core/ResponseController.js';

describe('ResponseController', () => {
    it('Basic finalization (Shadow Mode)', async () => {
        const context1 = {
            intent: 'find_nearby',
            entities: { location: 'Piekary' },
            session: { id: 'test-123', interactionCount: 1 },
            adminConfig: null
        };

        const result1 = await finalizeResponse('Znalazłam 5 restauracji.', context1);

        expect(result1.reply).toBe('Znalazłam 5 restauracji.');
        expect(result1.rawReply).toBe('Znalazłam 5 restauracji.');
        expect(result1.policy).not.toBeNull();
        expect(result1.metadata.mode).toBe('shadow');
        expect(context1.responseFinalized).toBe(true);
    });

    it('Double finalization guard', async () => {
        const context1 = {
            intent: 'find_nearby',
            entities: { location: 'Piekary' },
            session: { id: 'test-123', interactionCount: 1 },
            adminConfig: null
        };
        await finalizeResponse('Pierwsza', context1);

        await expect(finalizeResponse('Druga odpowiedź', context1)).rejects.toThrow(/already finalized/);
    });

    it('isResponseFinalized helper', async () => {
        const context2 = {
            intent: 'create_order',
            entities: {},
            session: {}
        };
        expect(isResponseFinalized(context2)).toBe(false);

        await finalizeResponse('Dodano do koszyka.', context2);
        expect(isResponseFinalized(context2)).toBe(true);

        resetFinalizationFlag(context2);
        expect(isResponseFinalized(context2)).toBe(false);
    });

    it('Policy resolution integration', async () => {
        const context3 = {
            intent: 'confirm_order',
            entities: {},
            session: { interactionCount: 5, lastIntent: 'create_order' },
            adminConfig: { forceStyle: 'enthusiastic' }
        };

        const result3 = await finalizeResponse('Zamówienie potwierdzone.', context3);

        expect(result3.policy.style).toBe('enthusiastic');
        expect(result3.policy.metadata.adminOverride).toBe(true);
    });

    it('Invalid input handling', async () => {
        const context4 = { intent: 'unknown', entities: {}, session: {} };

        const result4a = await finalizeResponse(null, context4);
        expect(result4a.reply).toContain('Przepraszam');
        resetFinalizationFlag(context4);

        const result4b = await finalizeResponse('', context4);
        expect(result4b.reply).toContain('Przepraszam');
        resetFinalizationFlag(context4);

        const result4c = await finalizeResponse(123, context4);
        expect(result4c.reply).toContain('Przepraszam');
    });

    it('Configuration getter', () => {
        const config = getResponseControllerConfig();
        expect(typeof config.SHADOW_MODE).toBe('boolean');
        expect(typeof config.ACTIVE_MODE).toBe('boolean');
    });

    it('Metadata tracking', async () => {
        const context5 = {
            intent: 'show_menu',
            entities: {},
            session: { id: 'test-456' }
        };

        const result5 = await finalizeResponse('Oto menu.', context5);
        expect(result5.metadata.processingTimeMs).toBeDefined();
        expect(result5.metadata.timestamp).toBeDefined();
        expect(result5.metadata.policyUsed).toBeDefined();
        expect(result5.metadata.transformationApplied).toBe(false);
    });

    it('Missing intent handling', async () => {
        const context6 = {
            entities: {},
            session: {}
        };

        const result6 = await finalizeResponse('Odpowiedź bez intencji.', context6);
        expect(result6.reply).toBe('Odpowiedź bez intencji.');
        expect(result6.policy).not.toBeNull();
    });

    it('Context mutation (responseFinalized flag)', async () => {
        const context7 = {
            intent: 'find_nearby',
            entities: {},
            session: {},
            someOtherField: 'should be preserved'
        };

        const originalKeys = Object.keys(context7);
        await finalizeResponse('Test mutation.', context7);

        expect(context7.responseFinalized).toBe(true);
        expect(context7.someOtherField).toBe('should be preserved');
        expect(Object.keys(context7).length).toBe(originalKeys.length + 1);
    });
});
