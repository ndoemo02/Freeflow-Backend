/**
 * PhraseGenerator.js
 * 
 * LLM-Powered Phrase Generator for Natural Dialog
 * 
 * Purpose: Transform deterministic facts into natural spoken Polish
 * 
 * ❌ Does NOT make decisions
 * ❌ Does NOT ask questions the FSM didn't authorize
 * ❌ Does NOT change meaning
 * ❌ Does NOT change numbers (prices, quantities)
 * ❌ Does NOT change proper nouns (dish names, restaurant names)
 * ❌ Does NOT add new dishes, prices, or restaurants not in templateText
 * ✅ May change style, tone, sentence structure
 * ✅ May shorten or warm up phrasing
 * ✅ Paraphrases for natural speech
 * ✅ Max 2 sentences
 * ✅ Falls back to SurfaceRenderer on failure
 *
 * FACTS ARE IMMUTABLE — this is an architectural contract, not a guideline.
 * If validateParaphrase detects mutation of numbers or proper nouns, output is rejected.
 * 
 * INPUT:  { surfaceKey, facts, lang }
 * OUTPUT: { spokenText, ssml, fromLLM: boolean }
 */

import { renderSurface } from './SurfaceRenderer.js';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const PHRASE_GENERATOR_CONFIG = {
    enabled: true,
    maxSentences: 2,
    maxWords: 40,       // default — applies to most surfaces
    maxChars: 300,      // Hard cap for TTS
    timeout: 2000,      // ms
    fallbackOnError: true
};

// Surface-specific word limit overrides.
// Used when surface contract explicitly allows longer output
// (e.g., dish detail explanation, cart summary with multiple items).
// Must match surface keys from SurfaceRenderer.
const SURFACE_WORD_LIMITS = {
    DISH_DETAIL:  60,
    CART_SUMMARY: 60,
    MENU_OVERVIEW: 55,
    // all other surfaces: PHRASE_GENERATOR_CONFIG.maxWords (40)
};

// System prompt for phrase generation (Polish)
const SYSTEM_PROMPT = `Jesteś asystentem głosowym do zamawiania jedzenia.
Twoim jedynym zadaniem jest przeformułowanie podanego tekstu na naturalną mowę.

ZASADY — STYL (wolno zmieniać):
1. Maksymalnie 2 krótkie zdania
2. Używaj naturalnego języka mówionego (nie pisanego)
3. Bądź przyjazna ale rzeczowa
4. Możesz skrócić, ocieplić ton, zmienić szyk zdania
5. Używaj poprawnej polskiej gramatyki: dopełniacz ("nie ma problemu"), właściwy przypadek, odmiana czasowników

ZASADY — FAKTY (nigdy nie zmieniaj):
6. NIE zmieniaj żadnych liczb — ceny, ilości, numery pozycji przepisuj dokładnie tak jak są w oryginale
7. NIE zmieniaj nazw własnych — nazwy dań i restauracji przepisuj dokładnie, bez parafrazowania ani zastępowania zaimkami; szczególnie gdy nazwa jest częścią kontekstu akcji (potwierdzenie zamówienia, wybór restauracji)
8. NIE dopisuj nowych dań, cen ani restauracji których nie ma w oryginale
9. NIE dodawaj nowych pytań jeśli oryginał ich nie zawiera; możesz uprościć formę CTA ("Czy dodać do koszyka?" → "Dodać do koszyka?") ale nie zmieniaj intencji pytania
10. Jeśli w oryginale jest lista numerowana, zachowaj wszystkie numery i pozycje

PRZYKŁADY:
Oryginał: "Mam kilka opcji dla pizza. Wybierz: 1) Margherita (25 zł) 2) Pepperoni (28 zł)"
Przepisane: "Mam dla ciebie dwie opcje pizzy: Margherita za 25 złotych albo Pepperoni za 28."

Oryginał: "Chcesz menu której restauracji? 1. Pizza Hut, 2. Domino's"
Przepisane: "Z której restauracji chcesz menu? Pizza Hut czy Domino's?"

Oryginał: "Dodałam Vege Burger — razem 2 pozycje. Co jeszcze?"
Przepisane: "Dodałam Vege Burgera, masz już 2 pozycje. Coś jeszcze?"

DOZWOLONE uproszczenia CTA:
✅ "Czy dodać do koszyka?" → "Dodać do koszyka?" — uproszczenie formy, ta sama intencja
✅ "Czy potwierdzasz zamówienie?" → "Potwierdzamy?" — skrót formy, ta sama intencja

NIEDOZWOLONE (przykłady błędów):
❌ "Margherita (25 zł)" → "Margherita (26 zł)" — zmiana ceny
❌ Dodanie nowej pozycji której nie było w oryginale
❌ "Vege Burger" → "wegetariański burger" — zmiana nazwy własnej dania
❌ "Zamówienie w Starej Kamienicy" → "Zamówienie w tej restauracji" — zastąpienie nazwy zaimkiem gdy jest częścią kontekstu akcji
❌ "Czy chcesz zobaczyć menu?" → "Chcesz zobaczyć menu i dodać do koszyka?" — zmiana intencji pytania`;

// ═══════════════════════════════════════════════════════════════════════════
// PHRASE GENERATOR
// ═══════════════════════════════════════════════════════════════════════════

let openaiClient = null;

/**
 * Get or initialize OpenAI client (lazy loading)
 */
function getOpenAIClient() {
    if (!openaiClient) {
        try {
            const OpenAI = require('openai');
            openaiClient = new OpenAI({
                apiKey: process.env.OPENAI_API_KEY
            });
        } catch (err) {
            console.warn('[PhraseGenerator] OpenAI not available:', err.message);
            return null;
        }
    }
    return openaiClient;
}

/**
 * Generate natural spoken phrase from surface output
 * 
 * @param {Object} input
 * @param {string} input.surfaceKey - Dialog surface key
 * @param {Object} input.facts - Facts to render
 * @param {string} [input.lang='pl'] - Language code
 * @param {Object} [options]
 * @param {boolean} [options.skipLLM=false] - Force template-only
 * @returns {Promise<{ spokenText: string, ssml: string, fromLLM: boolean, surfaceKey: string }>}
 */
export async function generatePhrase(input, options = {}) {
    const { surfaceKey, facts = {}, lang = 'pl' } = input;
    const { skipLLM = false } = options;

    // Step 1: Get deterministic template output
    const surface = { key: surfaceKey, facts };
    const { reply: templateText, uiHints } = renderSurface(surface);

    // If LLM disabled, skipped, or running under test — use deterministic template
    if (!PHRASE_GENERATOR_CONFIG.enabled || skipLLM || process.env.NODE_ENV === 'test') {
        return {
            spokenText: templateText,
            ssml: wrapSSML(templateText),
            fromLLM: false,
            surfaceKey: surfaceKey
        };
    }

    // Step 2: Try LLM paraphrase
    try {
        const paraphrased = await paraphraseWithLLM(templateText, surfaceKey);

        if (paraphrased && paraphrased.length > 0) {
            const valid = validateParaphrase(templateText, paraphrased, facts, surfaceKey);

            if (valid) {
                // Hard cap: truncate to maxChars
                let finalText = paraphrased;
                if (finalText.length > PHRASE_GENERATOR_CONFIG.maxChars) {
                    finalText = finalText.slice(0, PHRASE_GENERATOR_CONFIG.maxChars - 3) + '...';
                    console.debug(`[PhraseGenerator] Truncated to ${PHRASE_GENERATOR_CONFIG.maxChars} chars`);
                }

                return {
                    spokenText: finalText,
                    ssml: wrapSSML(finalText, surfaceKey),
                    fromLLM: true,
                    surfaceKey: surfaceKey
                };
            } else {
                console.warn('[PhraseGenerator] Validation failed, using template');
            }
        }
    } catch (err) {
        console.warn('[PhraseGenerator] LLM error, falling back:', err.message);
    }

    // Step 3: Fallback to template
    return {
        spokenText: templateText,
        ssml: wrapSSML(templateText),
        fromLLM: false,
        surfaceKey: surfaceKey
    };
}

/**
 * Paraphrase text using LLM
 * @param {string} text - Original template text
 * @param {string} surfaceKey - Context hint
 * @returns {Promise<string | null>}
 */
async function paraphraseWithLLM(text, surfaceKey) {
    const client = getOpenAIClient();
    if (!client) return null;

    const userPrompt = `Przepisz na naturalną mowę (max 2 zdania):\n\n"${text}"`;

    try {
        const response = await Promise.race([
            client.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user', content: userPrompt }
                ],
                max_tokens: 150,
                temperature: 0.3
            }),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Timeout')), PHRASE_GENERATOR_CONFIG.timeout)
            )
        ]);

        const result = response.choices?.[0]?.message?.content?.trim();
        return result || null;

    } catch (err) {
        console.debug('[PhraseGenerator] LLM call failed:', err.message);
        return null;
    }
}

/**
 * Validate paraphrased output.
 *
 * FACTS ARE IMMUTABLE — architectural contract.
 * Checks: length, sentence count, question count, number preservation,
 * and named entity preservation (dish names, restaurant names).
 *
 * @param {string} original   - Template text from SurfaceRenderer
 * @param {string} paraphrased - LLM output
 * @param {Object} facts       - Surface facts (used for entity extraction)
 * @param {string} surfaceKey  - Surface context (used for word limit override)
 * @returns {boolean}
 */
function validateParaphrase(original, paraphrased, facts = {}, surfaceKey = null) {
    // 1. Length guard — surface-aware
    const maxWords = SURFACE_WORD_LIMITS[surfaceKey] ?? PHRASE_GENERATOR_CONFIG.maxWords;
    const wordCount = paraphrased.split(/\s+/).length;
    if (wordCount > maxWords) {
        console.warn(`[PhraseGenerator] Rejected: too long (${wordCount} words, limit ${maxWords} for surface ${surfaceKey})`);
        return false;
    }

    // 2. Sentence count guard
    const sentenceCount = (paraphrased.match(/[.!?]/g) || []).length;
    if (sentenceCount > PHRASE_GENERATOR_CONFIG.maxSentences + 1) {
        console.warn('[PhraseGenerator] Rejected: too many sentences');
        return false;
    }

    // 3. Questions guard
    // Simplifying CTA form is OK ("Czy dodać?" → "Dodać?"), adding new questions is not.
    const paraphrasedQuestions = (paraphrased.match(/\?/g) || []).length;
    const originalQuestions = (original.match(/\?/g) || []).length;
    if (paraphrasedQuestions > originalQuestions) {
        console.warn('[PhraseGenerator] Rejected: added new questions');
        return false;
    }

    // 4. IMMUTABLE FACTS — number preservation guard
    const extractNumbers = (text) =>
        (text.match(/\d+(?:[.,]\d+)?/g) || []).map(n => n.replace(',', '.'));

    const originalNumbers = extractNumbers(original);
    const paraphrasedNumbers = extractNumbers(paraphrased);

    for (const num of originalNumbers) {
        const found = paraphrasedNumbers.some(n => n === num);
        if (!found) {
            console.warn(`[PhraseGenerator] Rejected: number "${num}" from original missing in paraphrase`);
            return false;
        }
    }
    for (const num of paraphrasedNumbers) {
        const found = originalNumbers.some(n => n === num);
        if (!found) {
            console.warn(`[PhraseGenerator] Rejected: number "${num}" hallucinated — not in original`);
            return false;
        }
    }

    // 5. IMMUTABLE FACTS — named entity preservation guard
    // Extracts protected entity strings from facts (dish names, restaurant names).
    // Checks that each entity present in templateText also appears in paraphrase.
    // Note: uses case-insensitive substring match to allow Polish inflection (Vege Burger → Vege Burgera).
    const protectedEntities = extractNamedEntities(facts, original);
    for (const entity of protectedEntities) {
        if (!paraphrased.toLowerCase().includes(entity.toLowerCase())) {
            console.warn(`[PhraseGenerator] Rejected: named entity "${entity}" missing in paraphrase`);
            return false;
        }
    }

    return true;
}

/**
 * Extract protected named entities from facts and templateText.
 * Returns entity strings that must be preserved in paraphrase output.
 *
 * Heuristic: collects string values from facts that appear in templateText
 * and are longer than 3 chars (to exclude short words like "tak", "nie").
 * Does not require NLP — relies on facts being the authoritative source.
 *
 * @param {Object} facts       - Surface facts object
 * @param {string} templateText - Deterministic template text
 * @returns {string[]}
 */
function extractNamedEntities(facts, templateText) {
    const entities = new Set();
    const template = templateText.toLowerCase();

    function collectStrings(obj) {
        if (!obj || typeof obj !== 'object') return;
        for (const val of Object.values(obj)) {
            if (typeof val === 'string' && val.length > 3 && template.includes(val.toLowerCase())) {
                entities.add(val);
            } else if (Array.isArray(val)) {
                val.forEach(item => collectStrings(item));
            } else if (typeof val === 'object') {
                collectStrings(val);
            }
        }
    }

    collectStrings(facts);
    return [...entities];
}

/**
 * Wrap text in SSML with prosody hints
 * @param {string} text - Text to wrap
 * @param {string} [surfaceKey] - Context for tone
 * @returns {string}
 */
function wrapSSML(text, surfaceKey = null) {
    // Determine prosody based on surface
    let rate = 'medium';
    let pitch = 'medium';

    if (surfaceKey === 'ERROR') {
        pitch = 'low';
        rate = 'slow';
    } else if (surfaceKey === 'CONFIRM_ADD') {
        pitch = 'high';
    } else if (surfaceKey?.startsWith('ASK_')) {
        pitch = '+5%';
    }

    // Build SSML
    const ssml = `<speak>
  <prosody rate="${rate}" pitch="${pitch}">
    ${escapeSSML(text)}
  </prosody>
</speak>`;

    return ssml;
}

/**
 * Escape text for SSML
 * @param {string} text
 * @returns {string}
 */
function escapeSSML(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

// ═══════════════════════════════════════════════════════════════════════════
// BATCH AND SYNC HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Synchronous version - uses template only
 * @param {Object} input
 * @returns {{ spokenText: string, ssml: string, fromLLM: false, surfaceKey: string }}
 */
export function generatePhraseSync(input) {
    const { surfaceKey, facts = {} } = input;

    const surface = { key: surfaceKey, facts };
    const { reply: templateText } = renderSurface(surface);

    return {
        spokenText: templateText,
        ssml: wrapSSML(templateText, surfaceKey),
        fromLLM: false,
        surfaceKey: surfaceKey
    };
}

/**
 * Update phrase generator config
 * @param {Partial<typeof PHRASE_GENERATOR_CONFIG>} config
 */
export function configurePhraseGenerator(config) {
    Object.assign(PHRASE_GENERATOR_CONFIG, config);
}

/**
 * Check if LLM phrase generation is available
 * @returns {boolean}
 */
export function isLLMAvailable() {
    return !!getOpenAIClient();
}
