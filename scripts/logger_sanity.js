/**
 * Logger UTF-8 sanity script.
 *
 * Verifies that:
 *  1. Polish characters pass through safeLogStr unchanged.
 *  2. C1 control-range bytes (mojibake artefacts from double-encoded emoji)
 *     are replaced with '?'.
 *  3. BrainLogger and devLog produce readable output without crashing.
 *
 * Run: node scripts/logger_sanity.js
 */

import { safeLogStr } from '../utils/logger.js';
import { devLog, devWarn, safeLogStr as engineSafeLogStr } from '../api/brain/core/engineMode.js';
import { BrainLogger } from '../utils/logger.js';

let failures = 0;

function assert(label, actual, expected) {
    // Use JSON comparison so objects/arrays compare by value, not reference.
    const a = typeof actual === 'object' && actual !== null ? JSON.stringify(actual) : actual;
    const e = typeof expected === 'object' && expected !== null ? JSON.stringify(expected) : expected;
    if (a === e) {
        console.log(`  PASS  ${label}`);
    } else {
        console.error(`  FAIL  ${label}`);
        console.error(`        expected: ${JSON.stringify(expected)}`);
        console.error(`        actual:   ${JSON.stringify(actual)}`);
        failures++;
    }
}

// ── 1. safeLogStr — Polish characters pass through unchanged ──────────────
console.log('\n[1] Polish character preservation');
const pl = 'zażółć gęślą jaźń ZAŻÓŁĆ GĘŚLĄ JAŹŃ';
assert('Polish text unchanged', safeLogStr(pl), pl);
assert('engineMode.safeLogStr same result', engineSafeLogStr(pl), pl);

// ── 2. C1 range stripped ──────────────────────────────────────────────────
console.log('\n[2] C1 control-range stripping (mojibake artefacts)');

// U+0080–U+009F are the C1 block — artefacts of CP1252→UTF-8 double-encoding.
const c1Chars = '\u0080\u0090\u009F'; // low, middle, high of range
assert('C1 chars replaced with ?', safeLogStr(c1Chars), '???');

// Simulate the real mojibake from router.js: Ä'Ĺş Â§ Â\u00a0
// The \u009F is actually the garbled piece; let's test a concrete mojibake sample.
const mojibakeSample = 'prefix \u0084 \u0090suffix';
assert('C1 in middle of string', safeLogStr(mojibakeSample), 'prefix ? ?suffix');

// ── 3. Non-string pass-through ────────────────────────────────────────────
console.log('\n[3] Non-string values unchanged');
assert('number', safeLogStr(42), 42);
assert('null', safeLogStr(null), null);
assert('object ref', safeLogStr({ a: 1 }), { a: 1 });

// ── 4. ASCII and extended Latin preserved ────────────────────────────────
console.log('\n[4] ASCII and extended Latin preserved');
const ascii = 'Hello World! 1234 +-=/[]{}';
assert('ASCII printable', safeLogStr(ascii), ascii);
// U+00A0 (NBSP) and beyond — kept (these appear in Polish context legitimately)
const latin1 = '\u00A0\u00C0\u00FF\u0100\u017E'; // NBSP Â À ÿ Ā ž
assert('Latin extended (U+00A0-U+017E)', safeLogStr(latin1), latin1);

// ── 5. Live logger calls ──────────────────────────────────────────────────
console.log('\n[5] Live logger calls (visual check — should not crash or throw)');
process.env.ENGINE_MODE = 'dev';
process.env.NODE_ENV = 'development';
global.BRAIN_DEBUG = true;

devLog('[devLog] Zażółć gęślą jaźń — Polish text test');
devWarn('[devWarn] Polskie znaki: ą ę ó ś ź ż ć ń ł Ą Ę Ó Ś Ź Ż Ć Ń Ł');

BrainLogger.nlu('Intent: create_order | dish: żurek staropolski | qty: 2');
BrainLogger.pipeline('Pipeline START | session=test-123 | text="dodaj żurek"');
BrainLogger.debug('Debug: Zamówienie przyjęte pomyślnie');

// NOTE: The double-encoded emoji in source string literals (e.g. Ä'Ĺş in router.js)
// use codepoints above U+009F (Latin Extended, General Punctuation) — outside the C1
// range handled by safeLogStr. Fixing those requires editing the source literals
// directly (separate task). safeLogStr addresses the C1-range artefacts only.
devLog('[devLog] Mojibake note: C1 range fixed; source-literal emoji requires source edit');

// ── Summary ───────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(50));
if (failures === 0) {
    console.log('ALL ASSERTIONS PASSED - UTF-8 logging path is safe.');
} else {
    console.error(`${failures} ASSERTION(S) FAILED.`);
    process.exit(1);
}
