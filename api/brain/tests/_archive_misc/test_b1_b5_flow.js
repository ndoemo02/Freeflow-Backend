import axios from 'axios';
import crypto from 'crypto';
import fs from 'fs';

const BASE_URL = 'http://localhost:3000/api/brain/v2';
const sessionId = `test-${crypto.randomBytes(4).toString('hex')}`;

const steps = [
    'calzone',
    'wege burger',
    '2 wege burger',
    'tak',
    'pokaż restauracje w pobliżu',
    'Rezydencja'
];

async function runTest() {
    const output = [];
    output.push(`Starting test with session: ${sessionId}`);

    for (const text of steps) {
        try {
            const res = await axios.post(BASE_URL, { session_id: sessionId, text });
            const data = res.data;
            const ctx = data.context || {};
            const items = ctx.cart?.items || [];

            output.push({
                user: text,
                intent: data.intent,
                source: data.meta?.source,
                reply: data.reply,
                restaurant: ctx.currentRestaurant?.name || 'none',
                restaurantId: ctx.currentRestaurant?.id || 'none',
                cartItems: items.length,
                cartQty: items.reduce((s, i) => s + i.qty, 0),
                debug_cart: data.meta?.debug_cart
            });
        } catch (err) {
            output.push({ error: err.message });
        }
        await new Promise(r => setTimeout(r, 500));
    }
    fs.writeFileSync('test_results.json', JSON.stringify(output, null, 2));
}

runTest();
