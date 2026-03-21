import { describe, it, expect } from 'vitest';
import {
    normalizeCheckoutDraft,
    extractCheckoutDraft,
    mergeCheckoutDraft,
    buildCheckoutProgress,
} from '../core/pipeline/CheckoutDraft.js';

describe('CheckoutDraft utility', () => {
    it('normalizes canonical and alias keys', () => {
        const draft = normalizeCheckoutDraft({
            customer_name: ' Jan Kowalski ',
            customer_phone: ' 555 111 222 ',
            delivery_address: ' ul. Testowa 1 ',
            instructions: ' bez cebuli ',
        });

        expect(draft).toEqual({
            name: 'Jan Kowalski',
            phone: '555 111 222',
            address: 'ul. Testowa 1',
            notes: 'bez cebuli',
        });
    });

    it('extracts draft from session checkoutDraft first', () => {
        const draft = extractCheckoutDraft({
            checkoutDraft: {
                name: 'Anna',
                phone: '123',
                address: 'Piekary',
            },
            deliveryInfo: {
                name: 'Ignored',
                phone: 'Ignored',
                address: 'Ignored',
            },
        });

        expect(draft.name).toBe('Anna');
        expect(draft.phone).toBe('123');
        expect(draft.address).toBe('Piekary');
    });

    it('merges only provided incoming keys and preserves rest', () => {
        const merged = mergeCheckoutDraft(
            { name: 'Anna', phone: '111', address: 'Katowice', notes: 'old' },
            { phone: '222', notes: '' },
        );

        expect(merged).toEqual({
            name: 'Anna',
            phone: '222',
            address: 'Katowice',
            notes: '',
        });
    });

    it('builds completeness progress and readiness', () => {
        const progress = buildCheckoutProgress({
            checkoutDraft: {
                name: 'Anna',
                phone: '111',
                address: '',
            },
            cart: {
                items: [{ qty: 2 }, { quantity: 1 }],
                total: 39,
            },
        });

        expect(progress.complete).toBe(false);
        expect(progress.missingFields).toEqual(['address']);
        expect(progress.filledFields).toEqual(['name', 'phone']);
        expect(progress.completion).toBe(67);
        expect(progress.cartItems).toBe(3);
        expect(progress.cartTotal).toBe(39);
        expect(progress.readyToSubmit).toBe(false);
    });
});
