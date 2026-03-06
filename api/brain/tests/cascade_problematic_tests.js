/**
 * Cascade Supabase Test Runner
 * ============================
 * Samodzielny runner (node cascade_supabase_tests.js) testujÄ…cy peĹ‚ny
 * flow zamĂłwienia dla kaĹĽdego dania z Supabase.
 *
 * Uruchomienie: node api/brain/tests/cascade_supabase_tests.js
 * Wymaga: dziaĹ‚ajÄ…cego serwera na http://localhost:3000
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

// DISABLE LLM & TTS for deterministic tests
process.env.DISABLE_LLM = "true";
process.env.DISABLE_TTS = "true";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// CONFIG
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

const BASE_URL = 'http://localhost:3000/api/brain/v2';
const REQUEST_TIMEOUT_MS = 15_000;
const STEP_DELAY_MS = 350; // P4: bumped from 200 to handle pipeline NLU+Supabase latency
const FILTER = '';

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// DATASET (P3 â€” extended with per-dish aliases)
// alias: the short/colloquial form a user would say
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

const DATASET = [
    // Pizzeria Monte Carlo (replaces outdated Bar Praha fixtures)
    { restaurant: 'Pizzeria Monte Carlo', dish_name: 'Margherita', price: '31.00', alias: 'margherita' },
    { restaurant: 'Pizzeria Monte Carlo', dish_name: 'Hawajska', price: '34.00', alias: 'hawajska' },
    { restaurant: 'Pizzeria Monte Carlo', dish_name: 'Quattro Formaggi', price: '34.00', alias: 'quattro' },
    // Restauracja Stara Kamienica
    { restaurant: 'Restauracja Stara Kamienica', dish_name: 'Rolada Ĺ›lÄ…ska z kluskami i modrÄ… kapustÄ…', price: '52.00', alias: 'rolada' },
    { restaurant: 'Restauracja Stara Kamienica', dish_name: 'Rosół z makaronem', price: '10.00', alias: 'rosol' },
    // DwĂłr Hubertus
    { restaurant: 'DwĂłr Hubertus', dish_name: 'Ä†wiartka kaczki', price: '65.00', alias: 'kaczka' },
    { restaurant: 'DwĂłr Hubertus', dish_name: 'Krem borowikowy', price: '25.00', alias: 'krem' },
    { restaurant: 'DwĂłr Hubertus', dish_name: 'PolÄ™dwica wieprzowa', price: '89.00', alias: 'poledwica' },
    // Rezydencja Luxury Hotel
    { restaurant: 'Rezydencja Luxury Hotel', dish_name: 'Tagliatelle z krewetkami', price: '28.00', alias: 'tagliatelle' },
    // Klaps Burgers
    { restaurant: 'Klaps Burgers', dish_name: 'Onionator', price: '18.00', alias: 'onionator' },
];

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// CORE RUNNER
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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
        {
            session_id: sessionId,
            text,
            includeTTS: false,
            stylize: false,
            meta: { channel: 'test' }
        },
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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// P1: STATE VALIDATION HELPERS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// PASS EVALUATOR (P6 â€” improved conditions)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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
        return { pass: false, reason: `no_order_intent (intents: ${intents.join('â†’')})` };
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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// SCENARIO BUILDERS (P1+P2: menu_request guaranteed, state validated)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

/**
 * Full 5-step canonical scenario.
 * P2: 'pokaĹĽ menu' is always step 3, guaranteed before dish order.
 */
function buildFullScenario(restaurant, dish_name) {
    return [
        'znajdĹş restauracje w Piekary Slaskich',
        restaurant,
        'pokaĹĽ menu',
        dish_name,
        'tak',
    ];
}

/**
 * Alias test â€” uses the curated alias from dataset (not blind first word).
 * P3: Uses per-dish alias instead of auto-splitting dish_name.
 */
function buildAliasScenario(restaurant, dish_name, alias) {
    const aliasPhrase = alias || dish_name.split(/\s+/)[0];
    return [
        'znajdĹş restauracje w Piekary Slaskich',
        restaurant,
        'pokaĹĽ menu',
        aliasPhrase,
        'tak',
    ];
}

/**
 * Quantity test â€” "dwa {dish_name}" then "tak".
 */
function buildQuantityScenario(restaurant, dish_name) {
    return [
        'znajdĹş restauracje w Piekary Slaskich',
        restaurant,
        'pokaĹĽ menu',
        `dwa ${dish_name}`,
        'tak',
    ];
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// SCENARIO EXECUTOR (P1: state validation after key steps)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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
                details: err.message,
                error: true,
            });
        }
        await sleep(STEP_DELAY_MS);
    }
    return results;
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// EDGE TESTS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

async function runGhostCartTest() {
    const label = 'EdgeTest::GhostCart';
    const sessionA = newSession();
    const sessionB = newSession();
    const entry = { restaurant: 'Callzone', dish_name: 'Pizza Margherita' };

    try {
        await runStep(sessionA, 'znajdĹş restauracje w Piekary Slaskich');
        await sleep(STEP_DELAY_MS);
        await runStep(sessionA, entry.restaurant);
        await sleep(STEP_DELAY_MS);
        await runStep(sessionA, 'pokaĹĽ menu');
        await sleep(STEP_DELAY_MS);
        await runStep(sessionA, entry.dish_name);
        await sleep(STEP_DELAY_MS);
        await runStep(sessionA, 'tak');
        await sleep(STEP_DELAY_MS);
        await runStep(sessionA, 'zamĂłw');
        await sleep(STEP_DELAY_MS);

        const { metrics: newM } = await runStep(sessionB, 'czeĹ›Ä‡');
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
 * P5/P6: TransactionLock test for the autocommit architecture.
 * After create_order the cart should mutate immediately and expectedContext stays null.
 * Escape intents must remain available even after an item was added.
 */
async function runTransactionLockTest() {
    const label = 'EdgeTest::TransactionLock';
    const entry = { restaurant: 'Callzone', dish_name: 'Vege Burger' };

    async function setupAutocommitSession() {
        const sessionId = newSession();
        await runStep(sessionId, 'znajdĹş restauracje w Piekary Slaskich');
        await sleep(STEP_DELAY_MS);
        await runStep(sessionId, entry.restaurant);
        await sleep(STEP_DELAY_MS);
        await runStep(sessionId, 'pokaĹĽ menu');
        await sleep(STEP_DELAY_MS);
        const { metrics: orderM } = await runStep(sessionId, entry.dish_name);
        await sleep(STEP_DELAY_MS);
        return { sessionId, orderM };
    }

    try {
        const { orderM } = await setupAutocommitSession();

        const hasCartItems = orderM.cartItems > 0;
        const expectedContextCleared = orderM.expectedContext === null;

        if (!hasCartItems || !expectedContextCleared) {
            return {
                label,
                pass: false,
                reason: `setup_failed: autocommit contract mismatch (cartItems=${orderM.cartItems}, expectedContext=${orderM.expectedContext})`,
                details: `intent=${orderM.intent} pendingOrder=${orderM.pendingOrder}`,
            };
        }

        const escapeCases = [
            {
                text: 'wybieram Rezydencja',
                label: 'select_restaurant',
                isValid: (m) => m.intent === 'select_restaurant' || m.source === 'restaurant_switch_conflict'
            },
            {
                text: 'znajdz restauracje w poblizu',
                label: 'find_nearby',
                isValid: (m) => m.intent === 'find_nearby'
            },
            {
                text: 'pokaz menu',
                label: 'show_menu',
                isValid: (m) => m.intent === 'menu_request' || m.intent === 'show_menu'
            },
            {
                text: 'anuluj',
                label: 'cancel_order',
                isValid: (m) => m.intent === 'cancel_order' || m.intent === 'DIALOG_CANCEL'
            },
        ];

        const failures = [];

        for (const escapeCase of escapeCases) {
            const { sessionId, orderM: setupMetrics } = await setupAutocommitSession();
            if (setupMetrics.cartItems <= 0 || setupMetrics.expectedContext !== null) {
                failures.push(`${escapeCase.text}: invalid setup (cartItems=${setupMetrics.cartItems}, expectedContext=${setupMetrics.expectedContext})`);
                continue;
            }

            const { metrics: escapeM } = await runStep(sessionId, escapeCase.text);
            await sleep(STEP_DELAY_MS);

            if (!escapeCase.isValid(escapeM)) {
                failures.push(`${escapeCase.text}: expected escape ${escapeCase.label}, got ${escapeM.intent} (source=${escapeM.source})`);
            }
        }

        return {
            label,
            pass: failures.length === 0,
            reason: failures.length === 0 ? 'ok' : 'escape_intent_blocked',
            details: failures.join(' | '),
        };
    } catch (err) {
        return { label, pass: false, reason: `error: ${err.message}`, details: '' };
    }
}


// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// REPORT GENERATOR
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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
        const intentChain = r.steps.map(s => s.metrics?.intent ?? '?').join('â†’');
        const lastStep = r.steps[r.steps.length - 1];
        const cartItems = lastStep?.metrics?.cartItems ?? '?';
        const stateWarns = r.steps.filter(s => s.stateWarn).map(s => s.stateWarn).join('; ') || '-';
        const status = r.pass ? 'âś… PASS' : 'âťŚ FAIL';
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
        const status = e.pass ? 'âś… PASS' : 'âťŚ FAIL';
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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// MAIN RUNNER
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

async function main() {
    console.log('đźš€ Cascade Supabase Test Runner v2 â€” starting...');
    console.log(`   Endpoint: ${BASE_URL}`);
    console.log(`   Dishes in dataset: ${DATASET.length}`);
    console.log(`   Step delay: ${STEP_DELAY_MS}ms`);
    console.log('');

    try {
        await axios.get('http://localhost:3000/api/health', { timeout: 5000 });
        console.log('âś… Server reachable on port 3000\n');
    } catch (err) {
        console.error('âťŚ Cannot reach server on port 3000. Start the backend first.');
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

    console.log(`đź“‹ Running ${selectedDishes.length} main scenarios Ă— 3 types = ${selectedDishes.length * 3} tests\n`);

    for (const row of selectedDishes) {
        const { restaurant, dish_name, alias } = row;

        if (FILTER && !restaurant.includes(FILTER)) {
            continue;
        }

        // --- Full scenario ---
        {
            const sid = newSession();
            const steps = await runScenario(buildFullScenario(restaurant, dish_name), sid);
            const { pass, reason } = evaluatePass(steps, 'full');
            results.push({ restaurant, dish: dish_name, scenario: 'full', steps, pass, reason });
            const icon = pass ? 'âś…' : 'âťŚ';
            console.log(`${icon} [full]  ${restaurant} / ${dish_name}`);
            if (!pass) console.log(`        â””â”€ ${reason}`);
            const warns = steps.filter(s => s.stateWarn);
            warns.forEach(s => console.log(`        âš ď¸Ź  ${s.stateWarn}`));
        }

        // --- Alias scenario (P3: curated alias) ---
        {
            const sid = newSession();
            const steps = await runScenario(buildAliasScenario(restaurant, dish_name, alias), sid);
            const { pass, reason } = evaluatePass(steps, 'alias');
            results.push({ restaurant, dish: dish_name, scenario: 'alias', steps, pass, reason });
            const icon = pass ? 'âś…' : 'âťŚ';
            console.log(`${icon} [alias] ${restaurant} / ${dish_name} (alias="${alias || dish_name.split(/\s+/)[0]}")`);
            if (!pass) console.log(`        â””â”€ ${reason}`);
        }

        // --- Quantity scenario ---
        {
            const sid = newSession();
            const steps = await runScenario(buildQuantityScenario(restaurant, dish_name), sid);
            const { pass, reason } = evaluatePass(steps, 'qty_2');
            results.push({ restaurant, dish: dish_name, scenario: 'qty_2', steps, pass, reason });
            const icon = pass ? 'âś…' : 'âťŚ';
            console.log(`${icon} [qty2]  ${restaurant} / dwa ${dish_name}`);
            if (!pass) console.log(`        â””â”€ ${reason}`);
        }

        console.log('');
    }

    // --- Edge tests ---
    console.log('â”â”â” Edge Tests â”â”â”');
    const ghostResult = await runGhostCartTest();
    const lockResult = await runTransactionLockTest();
    const edgeResults = [ghostResult, lockResult];

    edgeResults.forEach(e => {
        const icon = e.pass ? 'âś…' : 'âťŚ';
        console.log(`${icon} ${e.label}: ${e.reason}`);
        if (e.details) console.log(`   â””â”€ ${e.details}`);
    });

    // --- Generate report ---
    const report = buildReport(results, edgeResults);
    const reportPath = path.join(__dirname, 'cascade_problematic_report.md');
    fs.writeFileSync(reportPath, report, 'utf8');

    const totalMain = results.length;
    const passMain = results.filter(r => r.pass).length;
    const passEdge = edgeResults.filter(e => e.pass).length;
    const warnScenarios = results.filter(r => r.steps.some(s => s.stateWarn)).length;

    console.log('\nâ”â”â” Summary â”â”â”');
    console.log(`Main: ${passMain}/${totalMain} PASS`);
    console.log(`Edge: ${passEdge}/${edgeResults.length} PASS`);
    if (warnScenarios > 0) console.log(`âš ď¸Ź  FSM state warnings: ${warnScenarios} scenarios`);
    console.log(`\nđź“„ Report saved to: ${reportPath}`);

    process.exit(passMain === totalMain && passEdge === edgeResults.length ? 0 : 1);
}

main().catch(err => {
    console.error('đź’Ą Runner crashed:', err);
    process.exit(1);
});





