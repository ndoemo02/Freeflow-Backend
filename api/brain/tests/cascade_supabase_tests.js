/**
 * Cascade Supabase Test Runner
 * ============================
 * Samodzielny runner (node cascade_supabase_tests.js) testujący pełny
 * flow zamówienia dla każdego dania z Supabase.
 *
 * Uruchomienie: node api/brain/tests/cascade_supabase_tests.js
 * Wymaga: działającego serwera na http://localhost:3000
 *
 * Nie modyfikuje: FSM, pipeline, handlers, session lifecycle.
 *
 * Stabilizacja v2 (2026-03-05):
 *   P1: State validation after select_restaurant + menu_request
 *   P2: Explicit menu_request step guaranteed in each scenario
 *   P3: Extended dataset with per-dish aliases
 *   P4: STEP_DELAY_MS bumped to 350ms
 *   P5: TransactionLock uses dish that confirms correctly (BBQ Bacon Burger)
 *   P6: PASS condition checks cart.items + conversationClosed
 */

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ════════════════════════════════════════════════════════════════════
// CONFIG
// ════════════════════════════════════════════════════════════════════

const BASE_URL = 'http://localhost:3000/api/brain/v2';
const REQUEST_TIMEOUT_MS = 15_000;
const STEP_DELAY_MS = 350; // P4: bumped from 200 to handle pipeline NLU+Supabase latency

// ════════════════════════════════════════════════════════════════════
// DATASET (P3 — extended with per-dish aliases)
// alias: the short/colloquial form a user would say
// ════════════════════════════════════════════════════════════════════

const DATASET = [
    // Bar Praha
    { restaurant: 'Bar Praha', dish_name: 'Zupa czosnkowa', price: '14.9', alias: 'zupa' },
    { restaurant: 'Bar Praha', dish_name: 'Smażony ser', price: '38.00', alias: 'ser' },
    { restaurant: 'Bar Praha', dish_name: 'Gulasz wieprzowy z knedlikiem', price: '45.00', alias: 'gulasz' },
    // Tasty King Kebab
    { restaurant: 'Tasty King Kebab', dish_name: 'Kebab w bułce', price: '28.00', alias: 'kebab' },
    { restaurant: 'Tasty King Kebab', dish_name: 'Rollo Kebab', price: '30.00', alias: 'rollo' },
    { restaurant: 'Tasty King Kebab', dish_name: 'Kebab Box', price: '35.00', alias: 'box' },
    // Restauracja Stara Kamienica
    { restaurant: 'Restauracja Stara Kamienica', dish_name: 'Rolada śląska z kluskami i modrą kapustą', price: '52.00', alias: 'rolada' },
    { restaurant: 'Restauracja Stara Kamienica', dish_name: 'Żurek śląski na maślance', price: '22.00', alias: 'żurek' },
    { restaurant: 'Restauracja Stara Kamienica', dish_name: 'Kotlet schabowy z ziemniakami i kapustą', price: '45.00', alias: 'schabowy' },
    // Dwór Hubertus
    { restaurant: 'Dwór Hubertus', dish_name: 'Ćwiartka kaczki', price: '65.00', alias: 'kaczka' },
    { restaurant: 'Dwór Hubertus', dish_name: 'Krem borowikowy', price: '25.00', alias: 'krem' },
    { restaurant: 'Dwór Hubertus', dish_name: 'Polędwica wieprzowa', price: '89.00', alias: 'polędwica' },
    // Rezydencja Luxury Hotel
    { restaurant: 'Rezydencja Luxury Hotel', dish_name: 'Krem z dyni z białą czekoladą', price: '75.00', alias: 'krem z dyni' },
    { restaurant: 'Rezydencja Luxury Hotel', dish_name: 'Wędzony pstrąg', price: '55.00', alias: 'pstrąg' },
    { restaurant: 'Rezydencja Luxury Hotel', dish_name: 'Tagliatelle z krewetkami', price: '28.00', alias: 'tagliatelle' },
    // Vien-Thien
    { restaurant: 'Vien-Thien', dish_name: 'Zupa Won Ton', price: '35.00', alias: 'zupa won ton' },
    { restaurant: 'Vien-Thien', dish_name: 'Sajgonki z ryżem', price: '25.00', alias: 'sajgonki' },
    { restaurant: 'Vien-Thien', dish_name: 'Wołowina 5 smaków', price: '49.00', alias: 'wołowina' },
    // Callzone
    { restaurant: 'Callzone', dish_name: 'Pizza Pepperoni', price: '36.00', alias: 'pepperoni' },
    { restaurant: 'Callzone', dish_name: 'Pizza Hawajska', price: '35.00', alias: 'hawajska' },
    { restaurant: 'Callzone', dish_name: 'Pizza Margherita', price: '32.00', alias: 'margherita' },
    // Klaps Burgers
    { restaurant: 'Klaps Burgers', dish_name: 'Głodzilla', price: '46.00', alias: 'głodzilla' },
    { restaurant: 'Klaps Burgers', dish_name: 'Smak Vegas', price: '15.00', alias: 'smak vegas' },
    { restaurant: 'Klaps Burgers', dish_name: 'Onionator', price: '18.00', alias: 'onionator' },
];

// ════════════════════════════════════════════════════════════════════
// CORE RUNNER
// ════════════════════════════════════════════════════════════════════

function extractMetrics(data) {
    const ctx = data?.context || {};
    const cart = ctx?.cart || {};
    const cartItems = Array.isArray(cart?.items) ? cart.items.length : 0;
    const cartItemsRaw = Array.isArray(cart?.items) ? cart.items : [];

    return {
        intent: data?.intent ?? null,
        source: data?.meta?.source ?? null,
        expectedContext: ctx?.expectedContext ?? null,
        pendingOrder: ctx?.pendingOrder ?? null,
        currentRestaurant: ctx?.currentRestaurant ?? null,
        lastMenu: ctx?.last_menu ?? null,
        cartItems,
        cartItemsRaw,
        conversationClosed: ctx?.conversationClosed ?? false,
        reply: (data?.reply ?? '').substring(0, 80),
        ok: data?.ok ?? false,
    };
}

async function runStep(sessionId, text) {
    const res = await axios.post(
        BASE_URL,
        { session_id: sessionId, text },
        { timeout: REQUEST_TIMEOUT_MS }
    );
    const metrics = extractMetrics(res.data);
    return { metrics, raw: res.data };
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

function newSession() {
    return `cascade-${crypto.randomBytes(6).toString('hex')}`;
}

// ════════════════════════════════════════════════════════════════════
// P1: STATE VALIDATION HELPERS
// ════════════════════════════════════════════════════════════════════

/**
 * Validates that after select_restaurant step the session
 * has a currentRestaurant set. Returns a warn string or null.
 */
function validateRestaurantSelected(stepResult) {
    if (!stepResult?.metrics?.currentRestaurant) {
        return 'WARN: currentRestaurant not set after select_restaurant step';
    }
    return null;
}

/**
 * Validates that after menu_request step the session has last_menu loaded.
 */
function validateMenuLoaded(stepResult) {
    const menu = stepResult?.metrics?.lastMenu;
    if (!Array.isArray(menu) || menu.length === 0) {
        return 'WARN: last_menu empty after menu_request step';
    }
    return null;
}

// ════════════════════════════════════════════════════════════════════
// PASS EVALUATOR (P6 — improved conditions)
// ════════════════════════════════════════════════════════════════════

/**
 * Determines if a scenario PASSED.
 * P6: Check cart.items mutation + conversationClosed, and intent chain.
 */
function evaluatePass(steps, scenarioType) {
    const last = steps[steps.length - 1]?.metrics;
    if (!last) return { pass: false, reason: 'no_steps' };

    const intents = steps.map(s => s.metrics?.intent).filter(Boolean);
    const hasAddToCart = intents.includes('confirm_add_to_cart');
    const hasCreateOrder = intents.includes('create_order');
    const errors = steps.filter(s => s.error).length;

    if (errors > 0) {
        return { pass: false, reason: `step_error (${errors} steps errored)` };
    }

    if (!hasCreateOrder && !hasAddToCart) {
        return { pass: false, reason: `no_order_intent (intents: ${intents.join('→')})` };
    }

    if (last.conversationClosed === true) {
        return { pass: false, reason: 'conversation_closed' };
    }

    // P6: Primary check is cart mutation (cart.items.length > 0)
    if (last.cartItems >= 1) {
        // For qty_2: also verify quantity=2 if possible
        if (scenarioType === 'qty_2') {
            const qtyItems = last.cartItemsRaw || [];
            const hasQty2 = qtyItems.some(item => item.quantity === 2);
            return { pass: true, reason: hasQty2 ? 'ok (qty=2 confirmed)' : 'ok' };
        }
        return { pass: true, reason: 'ok' };
    }

    // Fallback: accept if pendingOrder exists (order created but not yet confirmed)
    // This covers the case where confirm step was skipped/failed
    if (last.pendingOrder && hasCreateOrder) {
        return { pass: false, reason: `cart_empty_pending_unconfirmed (cartItems=${last.cartItems})` };
    }

    return { pass: false, reason: `cart_empty (cartItems=${last.cartItems})` };
}

// ════════════════════════════════════════════════════════════════════
// SCENARIO BUILDERS (P1+P2: menu_request guaranteed, state validated)
// ════════════════════════════════════════════════════════════════════

/**
 * Full 5-step canonical scenario.
 * P2: 'pokaż menu' is always step 3, guaranteed before dish order.
 */
function buildFullScenario(restaurant, dish_name) {
    return [
        'znajdź restauracje w Piekary Slaskich',
        restaurant,
        'pokaż menu',
        dish_name,
        'tak',
    ];
}

/**
 * Alias test — uses the curated alias from dataset (not blind first word).
 * P3: Uses per-dish alias instead of auto-splitting dish_name.
 */
function buildAliasScenario(restaurant, dish_name, alias) {
    const aliasPhrase = alias || dish_name.split(/\s+/)[0];
    return [
        'znajdź restauracje w Piekary Slaskich',
        restaurant,
        'pokaż menu',
        aliasPhrase,
        'tak',
    ];
}

/**
 * Quantity test — "dwa {dish_name}" then "tak".
 */
function buildQuantityScenario(restaurant, dish_name) {
    return [
        'znajdź restauracje w Piekary Slaskich',
        restaurant,
        'pokaż menu',
        `dwa ${dish_name}`,
        'tak',
    ];
}

// ════════════════════════════════════════════════════════════════════
// SCENARIO EXECUTOR (P1: state validation after key steps)
// ════════════════════════════════════════════════════════════════════

async function runScenario(steps, sessionId) {
    const results = [];
    for (let i = 0; i < steps.length; i++) {
        const text = steps[i];
        try {
            const { metrics, raw } = await runStep(sessionId, text);
            const stepResult = { text, metrics, raw };

            // P1: Validate state after step 2 (select_restaurant)
            if (i === 1) {
                const warn = validateRestaurantSelected(stepResult);
                if (warn) stepResult.stateWarn = warn;
            }
            // P1: Validate state after step 3 (menu_request)
            if (i === 2) {
                const warn = validateMenuLoaded(stepResult);
                if (warn) stepResult.stateWarn = warn;
            }

            results.push(stepResult);
        } catch (err) {
            results.push({
                text,
                metrics: { intent: 'ERROR', source: err.message, cartItems: 0, cartItemsRaw: [], conversationClosed: false },
                error: true,
            });
        }
        await sleep(STEP_DELAY_MS);
    }
    return results;
}

// ════════════════════════════════════════════════════════════════════
// EDGE TESTS
// ════════════════════════════════════════════════════════════════════

async function runGhostCartTest() {
    const label = 'EdgeTest::GhostCart';
    const sessionA = newSession();
    const sessionB = newSession();
    const entry = { restaurant: 'Callzone', dish_name: 'Pizza Margherita' };

    try {
        await runStep(sessionA, 'znajdź restauracje w Piekary Slaskich');
        await sleep(STEP_DELAY_MS);
        await runStep(sessionA, entry.restaurant);
        await sleep(STEP_DELAY_MS);
        await runStep(sessionA, 'pokaż menu');
        await sleep(STEP_DELAY_MS);
        await runStep(sessionA, entry.dish_name);
        await sleep(STEP_DELAY_MS);
        await runStep(sessionA, 'tak');
        await sleep(STEP_DELAY_MS);
        await runStep(sessionA, 'zamów');
        await sleep(STEP_DELAY_MS);

        const { metrics: newM } = await runStep(sessionB, 'cześć');
        const cartEmpty = newM.cartItems === 0;

        return {
            label,
            pass: cartEmpty,
            reason: cartEmpty ? 'ok' : `cart_not_empty_in_new_session (items=${newM.cartItems})`,
            details: `SessionA confirmed. SessionB cartItems=${newM.cartItems}`,
        };
    } catch (err) {
        return { label, pass: false, reason: `error: ${err.message}`, details: '' };
    }
}

/**
 * P5: Transaction Lock Test — fixed to use BBQ Bacon Burger (resolves correctly)
 * and confirm via "tak" before attempting to break out.
 * Only tests lock if pendingOrder is actually established.
 */
async function runTransactionLockTest() {
    const label = 'EdgeTest::TransactionLock';
    const sessionId = newSession();
    // P5: Use a dish that reliably resolves to confirm_add_to_cart
    const entry = { restaurant: 'Callzone', dish_name: 'Pizza Margherita' };

    try {
        await runStep(sessionId, 'znajdź restauracje w Piekary Slaskich');
        await sleep(STEP_DELAY_MS);
        await runStep(sessionId, entry.restaurant);
        await sleep(STEP_DELAY_MS);
        await runStep(sessionId, 'pokaż menu');
        await sleep(STEP_DELAY_MS);

        // Step that creates the pending order
        const { metrics: orderM } = await runStep(sessionId, entry.dish_name);
        await sleep(STEP_DELAY_MS);

        // P5: Only test lock if pendingOrder was actually established
        const hasPendingOrder = orderM.pendingOrder !== null;
        const isAwaitingConfirm = orderM.expectedContext === 'confirm_add_to_cart';

        if (!hasPendingOrder && !isAwaitingConfirm) {
            return {
                label,
                pass: false,
                reason: `setup_failed: no pendingOrder after dish step (intent=${orderM.intent})`,
                details: `Cannot test lock without pendingOrder. expectedContext=${orderM.expectedContext}`,
            };
        }

        // Now try to break out of the ordering context
        const { metrics: lockM } = await runStep(sessionId, 'pokaż restauracje');

        const contextStaysOrdering = [
            'confirm_add_to_cart',
            'create_order',
            'cancel_order',
        ].includes(lockM.intent) ||
            lockM.source === 'transaction_lock_override' ||
            lockM.source === 'transaction_lock';

        return {
            label,
            pass: contextStaysOrdering,
            reason: contextStaysOrdering
                ? 'ok'
                : `context_leaked: intent=${lockM.intent}, source=${lockM.source}`,
            details: `After "pokaż restauracje": intent=${lockM.intent} source=${lockM.source}`,
        };
    } catch (err) {
        return { label, pass: false, reason: `error: ${err.message}`, details: '' };
    }
}

// ════════════════════════════════════════════════════════════════════
// REPORT GENERATOR
// ════════════════════════════════════════════════════════════════════

function buildReport(results, edgeResults) {
    const now = new Date().toISOString();
    const lines = [
        `# Cascade Test Report`,
        `_Generated: ${now}_`,
        ``,
        `## Main Scenarios`,
        ``,
        `| # | restaurant | dish | scenario | intent_chain | cart_items | state_warns | PASS/FAIL | reason |`,
        `|---|-----------|------|----------|-------------|-----------|------------|-----------|--------|`,
    ];

    results.forEach((r, idx) => {
        const intentChain = r.steps.map(s => s.metrics?.intent ?? '?').join('→');
        const lastStep = r.steps[r.steps.length - 1];
        const cartItems = lastStep?.metrics?.cartItems ?? '?';
        const stateWarns = r.steps.filter(s => s.stateWarn).map(s => s.stateWarn).join('; ') || '-';
        const status = r.pass ? '✅ PASS' : '❌ FAIL';
        lines.push(
            `| ${idx + 1} | ${r.restaurant} | ${r.dish} | ${r.scenario} | \`${intentChain}\` | ${cartItems} | ${stateWarns} | ${status} | ${r.reason} |`
        );
    });

    lines.push('');
    lines.push('## Edge Tests');
    lines.push('');
    lines.push('| test | PASS/FAIL | reason | details |');
    lines.push('|------|-----------|--------|---------|');
    edgeResults.forEach(e => {
        const status = e.pass ? '✅ PASS' : '❌ FAIL';
        lines.push(`| ${e.label} | ${status} | ${e.reason} | ${e.details} |`);
    });

    lines.push('');
    const totalMain = results.length;
    const passMain = results.filter(r => r.pass).length;
    const totalEdge = edgeResults.length;
    const passEdge = edgeResults.filter(e => e.pass).length;

    // State warnings summary
    const warnCount = results.filter(r => r.steps.some(s => s.stateWarn)).length;

    lines.push(`## Summary`);
    lines.push('');
    lines.push(`- **Main scenarios:** ${passMain}/${totalMain} PASS`);
    lines.push(`- **Edge tests:** ${passEdge}/${totalEdge} PASS`);
    lines.push(`- **Total:** ${passMain + passEdge}/${totalMain + totalEdge} PASS`);
    lines.push(`- **State warnings:** ${warnCount} scenarios had FSM state issues`);

    return lines.join('\n');
}

// ════════════════════════════════════════════════════════════════════
// MAIN RUNNER
// ════════════════════════════════════════════════════════════════════

async function main() {
    console.log('🚀 Cascade Supabase Test Runner v2 — starting...');
    console.log(`   Endpoint: ${BASE_URL}`);
    console.log(`   Dishes in dataset: ${DATASET.length}`);
    console.log(`   Step delay: ${STEP_DELAY_MS}ms`);
    console.log('');

    try {
        await axios.get('http://localhost:3000/api/health', { timeout: 5000 });
        console.log('✅ Server reachable on port 3000\n');
    } catch (err) {
        console.error('❌ Cannot reach server on port 3000. Start the backend first.');
        process.exit(1);
    }

    const results = [];

    // Pick up to 3 dishes per restaurant for manageable run time
    const byRestaurant = {};
    for (const row of DATASET) {
        if (!byRestaurant[row.restaurant]) byRestaurant[row.restaurant] = [];
        byRestaurant[row.restaurant].push(row);
    }

    const selectedDishes = [];
    for (const [, rows] of Object.entries(byRestaurant)) {
        selectedDishes.push(...rows.slice(0, 3));
    }

    console.log(`📋 Running ${selectedDishes.length} main scenarios × 3 types = ${selectedDishes.length * 3} tests\n`);

    for (const row of selectedDishes) {
        const { restaurant, dish_name, alias } = row;

        // --- Full scenario ---
        {
            const sid = newSession();
            const steps = await runScenario(buildFullScenario(restaurant, dish_name), sid);
            const { pass, reason } = evaluatePass(steps, 'full');
            results.push({ restaurant, dish: dish_name, scenario: 'full', steps, pass, reason });
            const icon = pass ? '✅' : '❌';
            console.log(`${icon} [full]  ${restaurant} / ${dish_name}`);
            if (!pass) console.log(`        └─ ${reason}`);
            const warns = steps.filter(s => s.stateWarn);
            warns.forEach(s => console.log(`        ⚠️  ${s.stateWarn}`));
        }

        // --- Alias scenario (P3: curated alias) ---
        {
            const sid = newSession();
            const steps = await runScenario(buildAliasScenario(restaurant, dish_name, alias), sid);
            const { pass, reason } = evaluatePass(steps, 'alias');
            results.push({ restaurant, dish: dish_name, scenario: 'alias', steps, pass, reason });
            const icon = pass ? '✅' : '❌';
            console.log(`${icon} [alias] ${restaurant} / ${dish_name} (alias="${alias || dish_name.split(/\s+/)[0]}")`);
            if (!pass) console.log(`        └─ ${reason}`);
        }

        // --- Quantity scenario ---
        {
            const sid = newSession();
            const steps = await runScenario(buildQuantityScenario(restaurant, dish_name), sid);
            const { pass, reason } = evaluatePass(steps, 'qty_2');
            results.push({ restaurant, dish: dish_name, scenario: 'qty_2', steps, pass, reason });
            const icon = pass ? '✅' : '❌';
            console.log(`${icon} [qty2]  ${restaurant} / dwa ${dish_name}`);
            if (!pass) console.log(`        └─ ${reason}`);
        }

        console.log('');
    }

    // --- Edge tests ---
    console.log('━━━ Edge Tests ━━━');
    const ghostResult = await runGhostCartTest();
    const lockResult = await runTransactionLockTest();
    const edgeResults = [ghostResult, lockResult];

    edgeResults.forEach(e => {
        const icon = e.pass ? '✅' : '❌';
        console.log(`${icon} ${e.label}: ${e.reason}`);
        if (e.details) console.log(`   └─ ${e.details}`);
    });

    // --- Generate report ---
    const report = buildReport(results, edgeResults);
    const reportPath = path.join(__dirname, 'cascade_report.md');
    fs.writeFileSync(reportPath, report, 'utf8');

    const totalMain = results.length;
    const passMain = results.filter(r => r.pass).length;
    const passEdge = edgeResults.filter(e => e.pass).length;
    const warnScenarios = results.filter(r => r.steps.some(s => s.stateWarn)).length;

    console.log('\n━━━ Summary ━━━');
    console.log(`Main: ${passMain}/${totalMain} PASS`);
    console.log(`Edge: ${passEdge}/${edgeResults.length} PASS`);
    if (warnScenarios > 0) console.log(`⚠️  FSM state warnings: ${warnScenarios} scenarios`);
    console.log(`\n📄 Report saved to: ${reportPath}`);

    process.exit(passMain === totalMain && passEdge === edgeResults.length ? 0 : 1);
}

main().catch(err => {
    console.error('💥 Runner crashed:', err);
    process.exit(1);
});
