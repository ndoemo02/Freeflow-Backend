import app from './api/server-vercel.js';
import { supabase } from './api/server-vercel.js';
import { getSession, updateSession } from './api/brain/session/sessionStore.js';
import request from 'supertest';

process.env.EXPERT_MODE = 'true';
process.env.USE_LLM_INTENT = 'true';
process.env.OPENAI_API_KEY = 'test-key';

async function run() {
    const TEST_SESSION_ID = 'dbg-' + Date.now();
    updateSession(TEST_SESSION_ID, {
        currentRestaurant: { id: '00000000-0000-0000-0000-000000000001', name: 'Testowy Lokal' },
        expectedContext: 'confirm_order',
        pendingOrder: [
            { id: 'item1', name: 'Pizza Margherita', quantity: 2, price: 20 }
        ]
    });

    console.log('Session before request:', getSession(TEST_SESSION_ID));

    // Test the HTTP request but only send standard properties
    const res = await request(app).post('/api/brain/v2').send({ text: 'potwierdzam', session_id: TEST_SESSION_ID });

    console.log('--- DEBUG END ---');
    console.log(JSON.stringify(res.body, null, 2));
    process.exit(0);
}
run();
