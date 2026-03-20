import { describe, it, expect } from 'vitest';
import { buildClarifyMessage, ORDER_REQUESTED_CATEGORY } from '../domains/food/clarifyOrderMessage.js';

describe('clarify message builder', () => {
    it('returns MAIN-specific clarify message', () => {
        const reply = buildClarifyMessage({
            category: ORDER_REQUESTED_CATEGORY.MAIN,
            candidateCount: 1,
        });

        expect(reply.toLowerCase()).toContain('danie glowne');
    });
});
