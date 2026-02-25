import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { vi } from 'vitest';

import app from '../../api/server-vercel.js';
import { updateSession, getSession } from '../../api/brain/session/sessionStore.js';

let TEST_SESSION_ID;

describe('UNKNOWN_INTENT Safe Fallback E2E', () => {
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
        TEST_SESSION_ID = 'test-unknown-' + Date.now();

        // Mocujemy NLU by zawsze zwracało UNKNOWN_INTENT chyba, że powiedziano 'wybierz' (dla testu 1)
        global.fetch = vi.fn(async (url, options) => {
            return {
                ok: true,
                json: async () => ({
                    choices: [{
                        message: { content: JSON.stringify({ intent: 'UNKNOWN_INTENT', confidence: 1.0, slots: {} }) }
                    }]
                })
            };
        });
    });

    it('Scenariusz 1: W ordering (koszyk ma przetrwać)', async () => {
        updateSession(TEST_SESSION_ID, {
            conversationPhase: 'ordering',
            expectedContext: 'create_order',
            currentRestaurant: { id: 'test-1', name: 'Testowa Restauracja' },
            lastRestaurant: { id: 'test-1', name: 'Testowa Restauracja' },
            cart: {
                items: [{ name: 'Pizza', quantity: 1, price: 30 }]
            }
        });

        const res = await request(app)
            .post('/api/brain/v2')
            .send({ text: 'asdasdasd', session_id: TEST_SESSION_ID });

        expect(res.status).toBe(200);
        expect(res.body.intent).toBe('UNKNOWN_INTENT');
        expect(res.body.reply).toBe('Nie jestem pewna, o co chodzi. Kontynuujemy zamówienie czy chcesz coś zmienić?');

        const session = getSession(TEST_SESSION_ID);
        expect(session.conversationPhase).toBe('ordering');
        expect(session.cart.items.length).toBe(1);
    });

    it('Scenariusz 2: W idle powiedz blabla', async () => {
        updateSession(TEST_SESSION_ID, {
            conversationPhase: 'idle',
            expectedContext: 'find_nearby'
        });

        const res = await request(app)
            .post('/api/brain/v2')
            .send({ text: 'blabla', session_id: TEST_SESSION_ID });

        expect(res.status).toBe(200);
        expect(res.body.intent).toBe('UNKNOWN_INTENT');
        expect(res.body.reply).toBe('Mogę pokazać restauracje w pobliżu albo pomóc w wyborze dania.');

        const session = getSession(TEST_SESSION_ID);
        expect(session.conversationPhase).toBe('idle');
    });

    it('Scenariusz 3: Po wybraniu restauracji powiedz xyz', async () => {
        updateSession(TEST_SESSION_ID, {
            conversationPhase: 'restaurant_selected',
            expectedContext: 'menu_request',
            currentRestaurant: { id: 'test-1', name: 'Testowa' },
            lastRestaurant: { id: 'test-1', name: 'Testowa' }
        });

        const res = await request(app)
            .post('/api/brain/v2')
            .send({ text: 'xyz', session_id: TEST_SESSION_ID });

        expect(res.status).toBe(200);
        expect(res.body.intent).toBe('UNKNOWN_INTENT');
        expect(res.body.reply).toBe('Możesz wybrać coś z menu albo zapytać o szczegóły.');

        const session = getSession(TEST_SESSION_ID);
        expect(session.conversationPhase).toBe('restaurant_selected');
        expect(session.currentRestaurant.id).toBe('test-1');
    });
});
