import { describe, it, expect } from 'vitest';
import { ResponseBuilder } from '../core/pipeline/ResponseBuilder.js';

describe('ResponseBuilder checkoutProgress contract', () => {
    it('exposes checkoutProgress in meta based on session snapshot', () => {
        const sessionSnapshot = {
            conversationPhase: 'checkout',
            currentRestaurant: { id: 'r1', name: 'Test Resto' },
            orderMode: 'building',
            checkoutDraft: {
                name: 'Jan',
                phone: '500600700',
                address: '',
                notes: 'bez ostrego',
            },
            cart: {
                items: [{ qty: 2 }],
                total: 26,
            },
        };

        const { response } = ResponseBuilder.build({
            domainResponse: {
                reply: 'ok',
                intent: 'create_order',
                should_reply: true,
            },
            activeSessionId: 'sess_test_checkout_progress',
            speechText: 'ok',
            speechPartForTTS: 'ok',
            audioContent: null,
            intent: 'create_order',
            source: 'unit_test',
            totalLatency: 10,
            stylingMs: 0,
            ttsMs: 0,
            getSession: () => sessionSnapshot,
        });

        expect(response.meta.state.orderMode).toBe('building');
        expect(response.meta.checkoutProgress).toBeDefined();
        expect(response.meta.checkoutProgress.complete).toBe(false);
        expect(response.meta.checkoutProgress.missingFields).toEqual(['address']);
        expect(response.meta.checkoutProgress.completion).toBe(67);
        expect(response.meta.checkoutProgress.cartItems).toBe(2);
        expect(response.meta.checkoutProgress.cartTotal).toBe(26);
    });
});
