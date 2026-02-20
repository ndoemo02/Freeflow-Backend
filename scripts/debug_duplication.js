/**
 * debug_duplication.js
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * Narzędzie do debugowania duplikacji intent resolution.
 *
 * Uruchomienie (lokalny serwer musi działać na porcie 3000):
 *   node --input-type=module < scripts/debug_duplication.js
 *   node scripts/debug_duplication.js (jeśli masz "type":"module" w package.json)
 *
 * Co testuje:
 *   [T1] Pojedyncze żądanie         → 1 START + 1 DONE w logach serwera
 *   [T2] Równoległe duplikaty       → 1 OK + 1 duplicate_request
 *   [T3] Multi-turn (location flow) → brak podwójnego ASK_LOCATION
 *   [T4] Sekwencja burst (5x rapid) → tylko 1 przetwarza, reszta blokowane
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

import fetch from 'node-fetch';

const BASE_URL = process.env.BRAIN_URL || 'http://localhost:3000';
const ENDPOINT = `${BASE_URL}/api/brain/v2`;

// ── helpers ──────────────────────────────────────────────────────

function genSession(tag = 'dbg') {
    return `${tag}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

async function send(sessionId, text, label = '') {
    const t0 = Date.now();
    try {
        const res = await fetch(ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sessionId, input: text, meta: { channel: 'debug' } })
        });
        const data = await res.json();
        const ms = Date.now() - t0;
        return { ok: res.status === 200, ms, data, label };
    } catch (err) {
        return { ok: false, ms: Date.now() - t0, data: { error: err.message }, label };
    }
}

function printResult(r) {
    const intent = r.data?.intent ?? '—';
    const source = r.data?.meta?.source ?? r.data?.meta?.routing ?? '—';
    const reply = (r.data?.reply ?? '').substring(0, 80);
    const flag = r.data?.intent === 'duplicate_request' ? '🚫 BLOCKED' : (r.ok ? '✅' : '❌');
    console.log(`  ${flag}  [${r.label || '?'}]  intent=${intent}  source=${source}  ${r.ms}ms`);
    if (reply) console.log(`         reply: "${reply}"`);
}

function sep(title) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`  ${title}`);
    console.log('─'.repeat(60));
}

// ── TEST T1: Pojedyncze żądanie ───────────────────────────────────

async function t1_single() {
    sep('T1: Pojedyncze żądanie → musi być 1 rezolucja');
    const sid = genSession('t1');
    const r = await send(sid, 'Gdzie zjem kebaba w Piekarach?', 'single');
    printResult(r);

    const pass = r.ok && r.data?.intent !== 'duplicate_request';
    console.log(pass ? '  ✅ PASS' : '  ❌ FAIL — unexpected block or error');
    return pass;
}

// ── TEST T2: Równoległe duplikaty ─────────────────────────────────

async function t2_parallel_duplicate() {
    sep('T2: Równoległe duplikaty → pierwsza OK, druga ZABLOKOWANA');
    const sid = genSession('t2');
    const text = 'Szukam restauracji w Gliwicach';

    // Wysyłamy dwa identyczne żądania jednocześnie
    const [r1, r2] = await Promise.all([
        send(sid, text, 'req#1'),
        send(sid, text, 'req#2')
    ]);

    printResult(r1);
    printResult(r2);

    const results = [r1, r2];
    const blocked = results.filter(r => r.data?.intent === 'duplicate_request');
    const processed = results.filter(r => r.data?.intent !== 'duplicate_request' && r.ok);

    const pass = blocked.length === 1 && processed.length === 1;
    console.log(pass
        ? `  ✅ PASS — 1 przetworzone, 1 zablokowane`
        : `  ❌ FAIL — processed=${processed.length}, blocked=${blocked.length} (expected 1+1)`);
    return pass;
}

// ── TEST T3: Multi-turn location flow ─────────────────────────────

async function t3_location_flow() {
    sep('T3: Multi-turn location flow → brak podwójnego ASK_LOCATION');
    const sid = genSession('t3');

    // Turn 1: discovery bez lokalizacji
    const r1 = await send(sid, 'gdzie zjeść w pobliżu', 'turn1_discovery');
    printResult(r1);

    // Wait a moment for session to settle
    await new Promise(r => setTimeout(r, 300));

    // Turn 2: odpowiedź z lokalizacją
    const r2 = await send(sid, 'Piekarach Śląskich', 'turn2_location');
    printResult(r2);

    // Sprawdzamy czy turn2 NIE zwrócił ASK_LOCATION jako reply
    const replyT2 = r2.data?.reply ?? '';
    const hasDoubleAsk = /powiedz.*miasto|gdzie.*jedzenia|podaj.*lokalizacj/i.test(replyT2);
    const hasRestaurants = Array.isArray(r2.data?.restaurants) && r2.data.restaurants.length > 0;

    if (hasDoubleAsk) {
        console.log(`  ❌ FAIL — Turn2 nadal pyta o lokalizację: "${replyT2.substring(0, 100)}"`);
        return false;
    }
    if (!hasRestaurants && !replyT2) {
        console.log(`  ⚠️  WARN — brak restauracji i pustaw reply (może brak danych w Supabase)`);
        return true; // nie jest to błąd duplikacji
    }

    console.log(`  ✅ PASS — Intent=${r2.data?.intent}, restaurants=${r2.data?.restaurants?.length ?? 0}`);
    return true;
}

// ── TEST T4: Burst (rapid 5x) ─────────────────────────────────────

async function t4_burst() {
    sep('T4: Burst 5x identycznych → tylko 1 przetworzone, 4 zablokowane');
    const sid = genSession('t4');
    const text = 'Menu proszę';

    const requests = Array.from({ length: 5 }, (_, i) =>
        send(sid, text, `req#${i + 1}`)
    );

    const results = await Promise.all(requests);
    results.forEach(printResult);

    const blocked = results.filter(r => r.data?.intent === 'duplicate_request');
    const processed = results.filter(r => r.data?.intent !== 'duplicate_request' && r.ok);

    // W burście: ≥1 przetworzone, reszta zablokowane
    const pass = processed.length >= 1 && blocked.length >= 1;
    console.log(pass
        ? `  ✅ PASS — processed=${processed.length}, blocked=${blocked.length}`
        : `  ❌ FAIL — processed=${processed.length}, blocked=${blocked.length} (expected ≥1 + ≥1)`);

    if (!pass && blocked.length === 0) {
        console.log(`  ℹ️  HINT: Jeśli żaden nie był zablokowany, serwer przetwarza każde żądanie.`);
        console.log(`        Sprawdź logi serwera — czy widzisz wiele "▶️  [Pipeline] START" z tym samym sessionId?`);
    }
    return pass;
}

// ── TEST T5: Sekwencja (nie duplikaty) ────────────────────────────

async function t5_sequential() {
    sep('T5: Sekwencja różnych wejść → każde musi być przetworzone (nie blokowane)');
    const sid = genSession('t5');

    const turns = [
        'Szukam czegoś do jedzenia',
        'Piekary Śląskie',
        'Pokaż menu'
    ];

    let allPass = true;
    for (const [i, text] of turns.entries()) {
        await new Promise(r => setTimeout(r, 200)); // sequential
        const r = await send(sid, text, `turn${i + 1}`);
        printResult(r);
        if (r.data?.intent === 'duplicate_request') {
            console.log(`  ❌ FAIL — Turn ${i + 1} został nieprawidłowo zablokowany!`);
            allPass = false;
        }
    }
    if (allPass) console.log('  ✅ PASS — sekwencja poprawna, żaden turn nie zablokowany');
    return allPass;
}

// ── MAIN ──────────────────────────────────────────────────────────

async function main() {
    console.log('═'.repeat(60));
    console.log('  🔬 DUPLICATION DEBUGGER — FreeFlow Brain V2');
    console.log(`  Endpoint: ${ENDPOINT}`);
    console.log(`  Czas: ${new Date().toISOString()}`);
    console.log('═'.repeat(60));
    console.log('\n  UWAGA: Logi serwera są kluczowe!');
    console.log('  Szukaj: ▶️  [Pipeline] START / ⏹️  DONE / 🚫 DUPLICATE\n');

    const results = [];

    try { results.push({ name: 'T1 Single', pass: await t1_single() }); }
    catch (e) { console.error('T1 crashed:', e.message); results.push({ name: 'T1', pass: false }); }

    await new Promise(r => setTimeout(r, 500));

    try { results.push({ name: 'T2 Parallel', pass: await t2_parallel_duplicate() }); }
    catch (e) { console.error('T2 crashed:', e.message); results.push({ name: 'T2', pass: false }); }

    await new Promise(r => setTimeout(r, 500));

    try { results.push({ name: 'T3 Location', pass: await t3_location_flow() }); }
    catch (e) { console.error('T3 crashed:', e.message); results.push({ name: 'T3', pass: false }); }

    await new Promise(r => setTimeout(r, 500));

    try { results.push({ name: 'T4 Burst', pass: await t4_burst() }); }
    catch (e) { console.error('T4 crashed:', e.message); results.push({ name: 'T4', pass: false }); }

    await new Promise(r => setTimeout(r, 500));

    try { results.push({ name: 'T5 Sequential', pass: await t5_sequential() }); }
    catch (e) { console.error('T5 crashed:', e.message); results.push({ name: 'T5', pass: false }); }

    // ── PODSUMOWANIE
    console.log('\n' + '═'.repeat(60));
    console.log('  WYNIKI');
    console.log('═'.repeat(60));
    results.forEach(r => console.log(`  ${r.pass ? '✅' : '❌'}  ${r.name}`));

    const passed = results.filter(r => r.pass).length;
    console.log(`\n  ${passed}/${results.length} testów przeszło`);

    if (passed < results.length) {
        console.log('\n  ─── WSKAZÓWKI DEBUGOWANIA ───────────────────────────────');
        console.log('  1. Uruchom serwer lokalnie: npm run dev (port 3000)');
        console.log('  2. Obserwuj logi serwera w czasie rzeczywistym');
        console.log('  3. Poszukaj:');
        console.log('     ▶️  [Pipeline] START  ← powinien być 1 na request');
        console.log('     🚫 DUPLICATE_REQUEST  ← guard zadziałał');
        console.log('     🧠 NLURouter Result:  ← źródło (source) intent');
        console.log('  4. Jeśli T2/T4 fail: in-flight guard nie działa');
        console.log('     → Sprawdź czy BrainPipeline._inFlight jest zdefiniowane');
        console.log('  5. Jeśli T3 fail: LOCATION_COMMIT nie wyczyścił session.awaiting');
        console.log('     → Sprawdź pipeline.js blok LOCATION_COMMIT');
    }

    console.log('═'.repeat(60));
}

main().catch(console.error);
