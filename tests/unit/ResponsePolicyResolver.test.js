import { describe, it, expect } from 'vitest';
import { resolveResponsePolicy, getDefaultPolicyForIntent, validatePolicy } from '../../api/brain/core/ResponsePolicyResolver.js';

describe('ResponsePolicyResolver', () => {
    it('Default policies', () => {
        const findNearbyPolicy = getDefaultPolicyForIntent('find_nearby');
        expect(findNearbyPolicy.style).toBe('enthusiastic');
        expect(findNearbyPolicy.shouldUseLLM).toBe(true);

        const createOrderPolicy = getDefaultPolicyForIntent('create_order');
        expect(createOrderPolicy.style).toBe('professional');
        expect(createOrderPolicy.shouldUseLLM).toBe(false);
    });

    it('Session adaptation (long session -> casual)', () => {
        const longSession = { interactionCount: 15, lastIntent: 'menu_request' };
        const adaptedPolicy = resolveResponsePolicy({
            intent: 'create_order', // This intent has 'professional' base style
            entities: {},
            session: longSession,
            adminConfig: null
        });
        expect(adaptedPolicy.style).toBe('casual');
    });

    it('Error recovery adaptation', () => {
        const errorSession = { interactionCount: 5, lastIntent: 'unknown' };
        const errorPolicy = resolveResponsePolicy({
            intent: 'find_nearby',
            entities: {},
            session: errorSession,
            adminConfig: null
        });
        expect(errorPolicy.style).toBe('empathetic');
        expect(errorPolicy.verbosity).toBe('detailed');
    });

    it('Admin panel overrides', () => {
        const adminOverride = {
            forceStyle: 'neutral',
            disableLLM: true,
            fastTTS: true
        };
        const overriddenPolicy = resolveResponsePolicy({
            intent: 'find_nearby',
            entities: {},
            session: {},
            adminConfig: adminOverride
        });
        expect(overriddenPolicy.style).toBe('neutral');
        expect(overriddenPolicy.shouldUseLLM).toBe(false);
        expect(overriddenPolicy.ttsMode).toBe('fast');
    });

    it('Policy validation', () => {
        const validPolicy = {
            style: 'professional',
            verbosity: 'normal',
            recommendationMode: 'direct',
            shouldUseLLM: true,
            ttsMode: 'standard'
        };
        expect(validatePolicy(validPolicy)).toBe(true);

        const invalidPolicy = {
            style: 'INVALID',
            verbosity: 'normal',
            recommendationMode: 'direct',
            shouldUseLLM: 'yes',
            ttsMode: 'standard'
        };
        expect(validatePolicy(invalidPolicy)).toBe(false);
    });

    it('Metadata tracking', () => {
        const policyWithMetadata = resolveResponsePolicy({
            intent: 'confirm_order',
            entities: {},
            session: { interactionCount: 1 },
            adminConfig: { forceStyle: 'enthusiastic' }
        });
        expect(policyWithMetadata.metadata.sourceIntent).toBe('confirm_order');
        expect(policyWithMetadata.metadata.adminOverride).toBe(true);
    });
});
