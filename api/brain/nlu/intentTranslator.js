/**
 * LLM Intent Translator
 * ═══════════════════════════════════════════════════════════════════════════
 * Translates natural language to structured intent JSON.
 * 
 * CRITICAL CONSTRAINTS:
 * ❌ NO access to session
 * ❌ NO IDs
 * ❌ NO actions
 * ❌ NO reply
 * ✅ ONLY { intent, confidence, entities }
 * 
 * This is ALWAYS the LAST fallback after guards/regex/legacy.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { validateLLMOutput, sanitizeLLMOutput, ALLOWED_INTENTS, FORBIDDEN_FIELDS } from './intents/IntentSchema.js';
import { generateJsonWithVertex, isVertexTextConfigured } from '../ai/vertexTextClient.js';

const TIMEOUT_MS = 15000;

/**
 * Safe fallback returned when LLM fails
 */
const SAFE_FALLBACK = {
    intent: 'unknown',
    confidence: 0.0,
    entities: {},
    source: 'llm_fallback'
};

/**
 * System prompt for LLM - defines translator role ONLY
 */
const SYSTEM_PROMPT = `You are an intent classifier for a Polish food ordering voice assistant.

YOUR ONLY JOB: Convert user text into a JSON intent object.

ALLOWED INTENTS (pick exactly one):
- find_nearby: User wants to discover restaurants/places (gdzie, szukam, restauracje)
- menu_request: User wants to see a menu (menu, karta, oferta)
- select_restaurant: User is selecting from a list (by number like "1", "2" or name)
- create_order: User explicitly wants to order food (zamawiam, poproszę, wezmę, biorę)
- confirm_order: User confirms something (tak, potwierdzam, ok)
- confirm_add_to_cart: User confirms adding item (tak, dodaj)
- cancel_order: User cancels (nie, anuluj, stop)
- show_more_options: User wants more choices (więcej, inne, pokaż wszystkie)
- recommend: User asks for recommendations (polecisz, co polecasz)
- confirm: Generic yes response
- unknown: Cannot classify

OUTPUT FORMAT (JSON only, no markdown):
{
  "intent": "<intent_name>",
  "confidence": <0.0-1.0>,
  "entities": {
    "location": "<city name or null>",
    "restaurant": "<restaurant name or null>",
    "dish": "<food item or null>",
    "cuisine": "<cuisine type or null>",
    "quantity": <number 1-99 or null>,
    "selectionIndex": <number 1-20 if user said 'numer X' or null>
  }
}

CRITICAL RULES:
1. NEVER output IDs (no restaurantId, menuItemId, etc.)
2. NEVER output session data (no pendingDish, awaiting, etc.)
3. NEVER output actions or cart data
4. NEVER output reply text
5. If unsure, use "unknown" with low confidence (0.3)
6. Polish inflections: Piekarach → Piekary, Bytomiu → Bytom, Katowicach → Katowice
7. dish: ONLY the food item name (e.g., "pizza bez glutenu", "kurczak"), NEVER ordering verbs — strip "zamówić", "chcę", "poproszę", "wezmę" etc.`;

/**
 * Translate user text to structured intent
 * 
 * @param {string} text - User utterance
 * @param {object} hints - READ-ONLY context hints (NOT session data)
 * @param {string} [hints.lastIntent] - Previous intent name
 * @param {boolean} [hints.hasRestaurant] - Whether restaurant context exists
 * @param {boolean} [hints.hasLocation] - Whether location context exists
 * @returns {Promise<{intent: string, confidence: number, entities: object, source: string}>}
 */
export async function translateIntent(text, hints = {}) {
    const startTime = Date.now();

    // Guard: must have Vertex configuration
    if (!isVertexTextConfigured()) {
        console.warn('🛡️ LLM Translator: Vertex not configured (missing GCP_PROJECT_ID/GOOGLE_PROJECT_ID)');
        return SAFE_FALLBACK;
    }

    // Guard: LLM_TRANSLATOR_ENABLED flag (optional)
    const LLM_ENABLED = process.env.LLM_TRANSLATOR_ENABLED !== 'false';
    if (!LLM_ENABLED) {
        return SAFE_FALLBACK;
    }

    try {
        // Build user prompt with context hints (READ-ONLY, no session access)
        let userPrompt = `User said: "${text}"`;
        if (hints.lastIntent) userPrompt += `\nPrevious intent: ${hints.lastIntent}`;
        if (hints.hasRestaurant) userPrompt += `\nContext: Restaurant already selected`;
        if (hints.hasLocation) userPrompt += `\nContext: Location already known`;

        const parsed = await generateJsonWithVertex({
            systemPrompt: SYSTEM_PROMPT,
            userPrompt,
            model: process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash',
            temperature: 0.1,
            timeoutMs: TIMEOUT_MS,
        });

        if (!parsed) {
            console.warn('🛡️ LLM Translator: Empty content in response');
            return SAFE_FALLBACK;
        }

        // ═══════════════════════════════════════════════════════════════════
        // STEP 1: Parse JSON
        // ═══════════════════════════════════════════════════════════════════
        // STEP 2: Validate structure
        // ═══════════════════════════════════════════════════════════════════
        const validation = validateLLMOutput(parsed);

        if (!validation.valid) {
            console.warn('🛡️ LLM Translator: Validation failed:', validation.errors.slice(0, 3));
            return SAFE_FALLBACK;
        }

        // ═══════════════════════════════════════════════════════════════════
        // STEP 3: Sanitize (strip dangerous fields, cap values)
        // ═══════════════════════════════════════════════════════════════════
        const sanitized = sanitizeLLMOutput(parsed);

        // Add source marker
        sanitized.source = 'llm_translator';

        const latency = Date.now() - startTime;
        console.log(`✅ LLM Translator: ${sanitized.intent} (${sanitized.confidence.toFixed(2)}) in ${latency} ms`);

        return sanitized;

    } catch (error) {
        if (String(error?.message || '').includes('vertex_timeout')) {
            console.warn(`🛡️ LLM Translator: Timeout after ${TIMEOUT_MS} ms`);
        } else {
            console.warn('🛡️ LLM Translator: Error:', error.message);
        }
        return SAFE_FALLBACK;
    }
}

/**
 * Check if LLM translation is available
 */
export function isLLMTranslatorAvailable() {
    return !!(isVertexTextConfigured() && process.env.LLM_TRANSLATOR_ENABLED !== 'false');
}
