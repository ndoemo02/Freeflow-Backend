// api/brain/intents/llmRefiner.js
// Gemini (default) → OpenAI (fallback) — per project LLM policy.
// Both providers use native fetch — no SDK dependency.
import { normalize as normalizeText } from "../utils/normalizeText.js";

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`;
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

async function refineWithGemini(payload) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) return null;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
        const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
                contents: [{ parts: [{ text: JSON.stringify(payload) }] }],
                generationConfig: {
                    temperature: 0.2,
                    responseMimeType: "application/json",
                },
            }),
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            console.warn("LLM REFINER (Gemini) HTTP error:", response.status);
            return null;
        }

        const data = await response.json();
        const raw = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "{}";

        try {
            return JSON.parse(raw);
        } catch {
            console.warn("LLM REFINER (Gemini) invalid JSON:", raw);
            return null;
        }
    } catch (err) {
        clearTimeout(timeoutId);
        if (err.name !== "AbortError") console.error("LLM REFINER (Gemini) error:", err);
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
        !(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) &&
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

    const parsed = (await refineWithGemini(payload)) ?? (await refineWithOpenAI(payload));

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
