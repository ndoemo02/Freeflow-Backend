// api/brain/intents/llmRefiner.js
// Vertex (default) → OpenAI (fallback) — per project LLM policy.
import { normalize as normalizeText } from "../utils/normalizeText.js";
import { generateJsonWithVertex, isVertexTextConfigured } from "../ai/vertexTextClient.js";

const OPENAI_URL = `https://api.openai.com/v1/chat/completions`;
const TIMEOUT_MS = 6000;

const SYSTEM_PROMPT = `
Jesteś modułem analizującym intencje użytkownika dla systemu zamawiania jedzenia.
Zwracaj TYLKO JSON. Bez wyjaśnień.

Dopuszczalne pola:
{
  "intent": string,
  "targetRestaurant": string | null,
  "targetItems": string[] | null,
  "quantity": number | null,
  "action": string | null,
  "confidence": number
}
`.trim();

async function refineWithVertex(payload) {
    if (!isVertexTextConfigured()) return null;
    try {
        return await generateJsonWithVertex({
            systemPrompt: SYSTEM_PROMPT,
            userPrompt: JSON.stringify(payload),
            model: process.env.GEMINI_TEXT_MODEL || "gemini-2.5-flash",
            temperature: 0.2,
            timeoutMs: TIMEOUT_MS,
        });
    } catch (err) {
        if (!String(err?.message || "").includes("vertex_timeout")) {
            console.error("LLM REFINER (Vertex) error:", err);
        }
        return null;
    }
}

async function refineWithOpenAI(payload) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return null;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
        const response = await fetch(OPENAI_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                temperature: 0.2,
                messages: [
                    { role: "system", content: SYSTEM_PROMPT },
                    { role: "user", content: JSON.stringify(payload) },
                ],
            }),
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            console.warn("LLM REFINER (OpenAI) HTTP error:", response.status);
            return null;
        }

        const data = await response.json();
        const raw = data?.choices?.[0]?.message?.content ?? "{}";
        try {
            return JSON.parse(raw);
        } catch {
            console.warn("LLM REFINER (OpenAI) invalid JSON:", raw);
            return null;
        }
    } catch (err) {
        clearTimeout(timeoutId);
        if (err.name !== "AbortError") console.error("LLM REFINER (OpenAI) error:", err);
        return null;
    }
}

export async function refineIntentLLM({ text, coarseIntent, session }) {
    const normalized = normalizeText(text || "");
    const IS_TEST = !!(process.env.VITEST || process.env.VITEST_WORKER_ID || process.env.NODE_ENV === "test");

    if (IS_TEST && process.env.FORCE_LLM_TEST !== "true") {
        return {
            intent: coarseIntent || "none",
            targetRestaurant: null,
            targetItems: null,
            action: null,
            quantity: null,
            confidence: 0.3,
            text,
        };
    }

    const noKeyAvailable =
        !isVertexTextConfigured() &&
        !process.env.OPENAI_API_KEY;

    if (noKeyAvailable) {
        return {
            intent: coarseIntent || "none",
            targetRestaurant: null,
            targetItems: null,
            action: null,
            quantity: null,
            confidence: 0.3,
            text,
        };
    }

    const payload = {
        text: normalized,
        coarseIntent,
        lastRestaurant: session?.lastRestaurant || null,
        cart: session?.cart || null,
    };

    const parsed = (await refineWithVertex(payload)) ?? (await refineWithOpenAI(payload));

    if (!parsed) {
        return {
            intent: "unknown",
            targetRestaurant: null,
            targetItems: null,
            quantity: null,
            action: null,
            confidence: 0.2,
            text,
        };
    }

    return {
        intent: parsed.intent || "unknown",
        targetRestaurant: parsed.targetRestaurant || null,
        targetItems: parsed.targetItems || null,
        quantity: parsed.quantity || null,
        action: parsed.action || null,
        confidence: parsed.confidence ?? 0.6,
    };
}
