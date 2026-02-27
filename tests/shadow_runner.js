
import request from 'supertest';
import app from '../api/server-vercel.js';
import fs from 'fs';
import path from 'path';

const realData = JSON.parse(fs.readFileSync('test_data_dump.json', 'utf8'));

async function runShadowTests() {
    console.log('🌑 Starting REAL-DATA SHADOW TEST (Step 2)...');

    const scenarios = [
        {
            name: "Scenario 1: Discovery -> Select # -> Order -> Confirm",
            steps: [
                { input: "Szukam jedzenia w Piekarach Śląskich", expected: "find_nearby" },
                { input: "pokaż mi Bar Praha", expected: "select_restaurant" },
                { input: "poproszę Rumcajsowy Burger", expected: "create_order" },
                { input: "potwierdzam zamówienie", expected: "confirm_order" }
            ]
        },
        {
            name: "Scenario 2: Verbal Selection -> Ordinal Test -> 2 Items -> Restaurant Change",
            steps: [
                { input: "chcę zjeść burgera", expected: "find_nearby" },
                { input: "wybierz Klaps Burgers", expected: "select_restaurant" },
                { input: "pokaż menu", expected: "menu_request" },
                { input: "poproszę ten pierwszy na liście", expected: "create_order" },
                { input: "i jeszcze Kosmiczne Jaja Double", expected: "create_order" },
                { input: "właściwie to wolę pizzę z Monte Carlo", expected: "select_restaurant" },
                { input: "tak, wyczyść koszyk i zmień", expected: "select_restaurant" }
            ]
        },
        {
            name: "Scenario 3: Outside Menu Case",
            steps: [
                { input: "Gdzie zjem coś wietnamskiego?", expected: "find_nearby" },
                { input: "Vien-Thien", expected: "select_restaurant" },
                { input: "Poproszę pizzę z ananasem", expected: "unknown" } // Should NOT be in Vien-Thien menu
            ]
        },
        {
            name: "Scenario 4: Menu Request -> Other Restaurants",
            steps: [
                { input: "chcę pizzę", expected: "find_nearby" },
                { input: "Pizzeria Monte Carlo", expected: "select_restaurant" },
                { input: "pokaż mi co mają do jedzenia", expected: "menu_request" },
                { input: "pokaż inne restauracje", expected: "find_nearby" }
            ]
        },
        {
            name: "Scenario 5: Direct Order",
            steps: [
                { input: "Zamawiam Wodzionka z Dwór Hubertus", expected: "create_order" }
            ]
        }
    ];

    for (const scenario of scenarios) {
        console.log(`\n🏃 Running ${scenario.name}...`);
        const sessionId = `shadow-${Date.now()}-${Math.random()}`;

        for (const step of scenario.steps) {
            process.stdout.write(`  Input: "${step.input}" ... `);
            const res = await request(app)
                .post('/api/brain/v2')
                .send({ text: step.input, session_id: sessionId });

            if (res.status !== 200) {
                console.log(`❌ FAIL (Status ${res.status})`);
                continue;
            }

            const actual = res.body.intent;
            if (actual === step.expected || (step.expected === 'unknown' && actual === 'UNKNOWN_INTENT')) {
                console.log(`✅ OK (${actual})`);
            } else {
                console.log(`⚠️ MISMATCH (Got ${actual}, Expected ${step.expected})`);
                // console.log(JSON.stringify(res.body, null, 2));
            }
        }
    }

    console.log('\n✨ Shadow Tests Complete.');
}

runShadowTests();
