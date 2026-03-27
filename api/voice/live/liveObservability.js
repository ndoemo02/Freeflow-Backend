/**
 * liveObservability — structured JSON logs for Gemini Live path.
 * All events go to stdout (Vercel captures automatically).
 * Format: { event, _src, ts, ...fields }
 */

function emit(event, fields) {
    try {
        console.log(JSON.stringify({ event, _src: 'live', ts: new Date().toISOString(), ...fields }));
    } catch {
        // never throw from logging
    }
}

export const liveLog = {
    /** Tool call received and queued for execution */
    toolCall({ sessionId, toolName, requestId }) {
        emit('TOOL_CALL_TRACE', { sessionId, toolName, requestId });
    },

    /** Tool call failed — validation, ICM block, or unhandled error */
    toolFail({ sessionId, toolName, requestId, error, field }) {
        emit('TOOL_FAIL_TRACE', { sessionId, toolName, requestId, error, ...(field ? { field } : {}) });
    },

    /** Tool call completed (ok or handled clarify) */
    toolComplete({ sessionId, toolName, requestId, ok, latencyMs, intent, orderMode }) {
        emit('TOOL_LATENCY_MS', { sessionId, toolName, requestId, ok, latencyMs, intent, orderMode });
    },

    /** OrderModeFSM transition fired by a live tool */
    orderModeTrace({ sessionId, toolName, from, to, fsm_event }) {
        emit('ORDER_MODE_TRACE', { sessionId, toolName, from, to, fsm_event });
    },

    /** WebSocket session lifecycle */
    wsConnect({ sessionId }) {
        emit('WS_CONNECT', { sessionId });
    },
    wsDisconnect({ sessionId, code }) {
        emit('WS_DISCONNECT', { sessionId, code });
    },
};
