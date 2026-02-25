import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { vi } from 'vitest';

import app from '../../api/server-vercel.js';
import { updateSession, getSession } from '../../api/brain/session/sessionStore.js';
import { applyAliases } from '../../api/brain/intent-router.js';

let TEST_SESSION_ID;

describe('Hours FAQ and Plural matching E2E', () => {
    const originalFetch = global.fetch;

    beforeAll(() => {
        process.env.EXPERT_MODE = 'true';
        process.env.USE_LLM_INTENT = 'true';
        process.env.OPENAI_API_KEY = 'test-key';
    });

    afterAll(() => {
        global.fetch = originalFetch;
    });

    beforeEach(() => {
        TEST_SESSION_ID = 'test-plural-hours-' + Date.now();
        updateSession(TEST_SESSION_ID, {
            expectedContext: 'create_order',
            currentRestaurant: { id: 'test-id', name: 'Test Restaurant', opening_hours: '12:00 - 22:00' },
            lastRestaurant: { id: 'test-id', name: 'Test Restaurant', opening_hours: '12:00 - 22:00' },
            pendingOrder: null,
            cart: { items: [{ name: 'existing', quantity: 1, price: 10 }] }
        });

        // Mock fetch to avoid real LLM calls just in case
        global.fetch = vi.fn(async (url, options) => {
            return {
                ok: true,
                json: async () => ({
                    choices: [{
                        message: { content: JSON.stringify({ intent: 'unknown', confidence: 0.5, slots: {} }) }
                    }]
                })
            };
        });
    });

    it('should handle "do której otwarte" without losing cart/state', async () => {
        const res = await request(app)
            .post('/api/brain/v2')
            .send({ text: 'do której macie otwarte', session_id: TEST_SESSION_ID });

        expect(res.status).toBe(200);
        expect(res.body.intent).toBe('restaurant_hours');
        expect(res.body.reply).toContain('Test Restaurant jest otwarta: 12:00 - 22:00');

        const session = getSession(TEST_SESSION_ID);
        // Ensure state is unchanged
        expect(session.expectedContext).toBe('create_order');
        expect(session.cart.items.length).toBe(1); // Cart not lost
    });
});
