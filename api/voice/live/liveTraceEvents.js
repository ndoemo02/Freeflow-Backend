import { EventLogger } from '../../brain/services/EventLogger.js';

function compactString(value, max = 240) {
    if (value == null) return '';
    const text = String(value).trim();
    if (!text) return '';
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function sanitizeValue(value, depth = 0) {
    if (depth > 3) return '[max_depth]';
    if (value == null) return value;
    if (typeof value === 'string') return compactString(value, 220);
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (Array.isArray(value)) return value.slice(0, 8).map((item) => sanitizeValue(item, depth + 1));
    if (typeof value === 'object') {
        const out = {};
        for (const [key, raw] of Object.entries(value)) {
            // hard guard: never persist raw audio/blob-ish payloads
            if (/audio|pcm|base64|wave|blob/i.test(key)) continue;
            out[key] = sanitizeValue(raw, depth + 1);
        }
        return out;
    }
    return compactString(value, 220);
}

export function buildLiveArgsSummary(toolName, args = {}) {
    const safeTool = compactString(toolName || 'unknown_tool', 80);
    if (!args || typeof args !== 'object') return { tool: safeTool };

    const summary = { tool: safeTool };
    if (args.dish) summary.dish = compactString(args.dish, 120);
    if (args.quantity != null) summary.quantity = Number(args.quantity) || 1;
    if (args.restaurant_id) summary.restaurant_id = compactString(args.restaurant_id, 80);
    if (args.restaurant_name) summary.restaurant_name = compactString(args.restaurant_name, 120);
    if (Array.isArray(args.items)) {
        summary.items_count = args.items.length;
        summary.items = args.items.slice(0, 3).map((item) => ({
            dish: compactString(item?.dish, 100),
            quantity: Number(item?.quantity) || 1,
        }));
    }
    return sanitizeValue(summary);
}

export function logLiveEvent({
    sessionId,
    eventType,
    payload = {},
    eventStatus = 'success',
    workflowStep = 'live',
}) {
    if (!sessionId || !eventType) return;

    const safePayload = sanitizeValue(payload);
    EventLogger.logConversation(sessionId, {
        source: 'live',
        last_live_event: eventType,
        last_live_at: new Date().toISOString(),
    }, 'active').catch(() => {});

    EventLogger.logEvent(
        sessionId,
        eventType,
        safePayload,
        null,
        workflowStep,
        eventStatus
    ).catch(() => {});
}

