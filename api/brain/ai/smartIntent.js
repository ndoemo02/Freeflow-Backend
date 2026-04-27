// Smart Intent Resolution Layer (V2 + classic NLU compatibility)

import { detectIntent } from '../intents/intentRouterGlue.js';
import { generateJsonWithVertex, isVertexTextConfigured } from './vertexTextClient.js';

const TIMEOUT_MS = 15000;

/**
 * Smart Intent Resolution Layer
 * V2 path: classic NLU baseline → ordering guards → LLM fallback (if EXPERT_MODE=true)
 */
export async function smartResolveIntent({ text, session, sessionId, restaurants, previousIntent }) {
    // 1. Guard empty input
    if (!text || !text.trim()) {
        return { intent: "smalltalk", confidence: 0, slots: {}, source: 'empty', engine: 'v2' };
    }

    // 2. Classic NLU baseline — try detectIntent, fallback to unknown
    let classicResult;
    try {
        const sessionForDetect = session
            ? {
                ...session,
                id: session?.id || session?.sessionId || session?.session_id || sessionId || null
            }
            : null;
        const det = await detectIntent(text, sessionForDetect, {});
        let detIntent = det?.intent || 'unknown';
        if (detIntent === 'UNKNOWN_INTENT' || detIntent === 'fallback') detIntent = 'unknown';
        classicResult = {
            intent: detIntent,
            confidence: det?.confidence || 0,
            slots: det?.entities || {},
            source: 'classic',
            engine: 'v2'
        };
    } catch (err) {
        console.warn('[SmartIntent] Classic NLU failed, using fallback:', err?.message);
        classicResult = {
            intent: 'unknown',
            confidence: 0,
            slots: {},
            source: 'classic',
            engine: 'v2'
        };
    }

    // 3. Fast-track (Skip LLM)
    // Jeśli mamy expectedContext LUB wysokie confidence (>= 0.75)
    const hasExpectedContext = !!session?.expectedContext;
    const hasRestaurant = !!(session?.currentRestaurant || session?.lockedRestaurantId || session?.lastRestaurant);

    // ═══════════════════════════════════════════════════════════════════
    // ORDERING CONTEXT GUARD (V2 parity)
    // If session has a restaurant selected and classic says choose_restaurant
    // → that's wrong. User is ordering, not picking a place again.
    // Remap to create_order so pipeline ordering handlers fire correctly.
    // ═══════════════════════════════════════════════════════════════════
    if (classicResult.intent === 'choose_restaurant' && hasRestaurant) {
        console.warn('[SmartIntent] choose_restaurant blocked (restaurant already selected) → remapped to create_order');
        classicResult.intent = 'create_order';
        classicResult.source = 'classic_remapped';
    }

    // HARD BLOCK: classic ordering intents must never bypass V2 safety guards
    if (classicResult.intent === 'confirm_order' && !session?.pendingOrder) {
        // No pending order → classic is hallucinating a confirm, downgrade
        classicResult.intent = 'find_nearby';
        classicResult.source = 'classic_blocked_no_pending';
    }

    // Confidence check
    const isConfident = (classicResult.confidence >= 0.75) &&
        (classicResult.intent !== 'none') &&
        (classicResult.intent !== 'unknown') &&
        (classicResult.intent !== 'fallback');

    if (hasExpectedContext || isConfident) {
        return classicResult;
    }

    // 4. LLM Fallback (Vertex)
    const USE_LLM = process.env.USE_LLM_INTENT === 'true' || isVertexTextConfigured();
    if (!USE_LLM) return classicResult;

    try {
        const contextData = {
            lastIntent: previousIntent || 'none',
            lastRestaurant: session?.lastRestaurant?.name || null,
            city: session?.last_location || null
        };

        const systemPrompt = `Analyze user text and return JSON.
Target Intents: [create_order, show_menu, find_nearby, change_restaurant, confirm_order, cancel_order, smalltalk, unknown].

Rules:
- If user wants food/drink -> create_order (extract items)
- If user asks for location/places -> find_nearby
- If user changes preference ('wolałbym pizza', 'jednak kebab') -> find_nearby (with cuisine)
- If user picks a place -> show_menu or confirm selection
- If ambiguous -> unknown

Return JSON: { "intent": "string", "confidence": number, "slots": object }
Context: ${JSON.stringify(contextData)}`;

        const parsed = await generateJsonWithVertex({
            systemPrompt,
            userPrompt: `User: "${text}"`,
            temperature: 0.1,
            model: process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash',
            timeoutMs: TIMEOUT_MS,
        });

        // 5. Merge / Refine
        if (parsed?.intent && parsed.intent !== 'unknown') {
            return {
                ...classicResult, // Preserve classic raw data
                intent: parsed.intent,
                confidence: parsed.confidence || 0.85,
                slots: { ...classicResult.slots, ...(parsed.slots || {}) },
                source: 'llm'
            };
        }
    } catch (err) {
        if (String(err?.message || '').includes('vertex_timeout')) {
            console.warn(`⚠️ SmartIntent timeout after ${TIMEOUT_MS}ms`);
        } else {
            console.warn('⚠️ SmartIntent LLM error:', err.message);
        }
    }

    return classicResult;
}
