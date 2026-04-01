import { WebSocketServer } from 'ws';
import { URL } from 'node:url';
import { LIVE_TOOL_SCHEMAS } from './ToolSchemas.js';
import { validateAndSanitize } from './ToolValidator.js';
import { liveLog } from './liveObservability.js';

const TOOL_EXECUTION_TIMEOUT_MS = 8000;

function safeJsonParse(raw) {
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function withTimeout(promise, ms) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('tool_timeout')), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export class GeminiLiveGateway {
    constructor({ toolRouter, isLiveEnabled }) {
        this.toolRouter = toolRouter;
        this.isLiveEnabled = isLiveEnabled;
        this.wss = null;
    }

    attach(server, path = '/api/voice/live/ws') {
        if (this.wss) return this.wss;

        this.wss = new WebSocketServer({ server, path });

        this.wss.on('connection', (socket, req) => {
            if (!this.isLiveEnabled()) {
                socket.close(4001, 'LIVE_MODE_DISABLED');
                return;
            }

            const requestUrl = new URL(req.url, 'http://localhost');
            const sessionId = requestUrl.searchParams.get('session_id') || '';

            if (!sessionId.trim()) {
                socket.close(4002, 'MISSING_SESSION_ID');
                return;
            }

            liveLog.wsConnect({ sessionId });

            socket.on('close', (code) => {
                liveLog.wsDisconnect({ sessionId, code });
            });

            socket.send(JSON.stringify({
                type: 'live_ready',
                session_id: sessionId,
                tools: LIVE_TOOL_SCHEMAS.map((tool) => tool.name),
            }));

            socket.on('message', async (rawPayload) => {
                const parsed = safeJsonParse(rawPayload.toString());

                if (!parsed) {
                    socket.send(JSON.stringify({ type: 'tool_error', error: 'invalid_json' }));
                    return;
                }

                if (parsed.type !== 'tool_call') {
                    socket.send(JSON.stringify({ type: 'tool_error', error: 'unsupported_message_type' }));
                    return;
                }

                const toolName = parsed.tool;
                const requestId = parsed.request_id || null;

                // ── DIAG-B: WS gateway received tool_call ─────────────
                console.log(`[LiveDiag-BE] 📩 WS tool_call received: ${toolName}  req:${requestId}  session:${sessionId}`);
                console.log(`[LiveDiag-BE]    args:`, JSON.stringify(parsed.args || {}));
                // ──────────────────────────────────────────────────────

                // 1. Validate + sanitize args before touching ToolRouter
                const validation = validateAndSanitize(toolName, parsed.args || {});
                if (!validation.valid) {
                    console.warn(`[LiveDiag-BE] ❌ Validation failed: ${toolName}  error:${validation.error}  field:${validation.field}`);
                    liveLog.toolFail({ sessionId, toolName, requestId, error: validation.error, field: validation.field });
                    socket.send(JSON.stringify({
                        type: 'tool_error',
                        request_id: requestId,
                        tool: toolName,
                        error: validation.error,
                        field: validation.field || null,
                    }));
                    return;
                }

                liveLog.toolCall({ sessionId, toolName, requestId });

                // 2. Execute with timeout
                try {
                    const result = await withTimeout(
                        this.toolRouter.executeToolCall({
                            sessionId,
                            toolName,
                            args: validation.sanitized,
                            requestId,
                        }),
                        TOOL_EXECUTION_TIMEOUT_MS,
                    );

                    // ── DIAG-C: ToolRouter finished, sending tool_result ──
                    const reply = result.response?.reply || result.response?.text || '(empty)';
                    const rCount = result.response?.restaurants?.length ?? null;
                    const mCount = result.response?.menuItems?.length ?? null;
                    console.log(`[LiveDiag-BE] ✅ ToolRouter done: ${toolName}  ok:${result.ok}`);
                    console.log(`[LiveDiag-BE]    reply: "${reply.slice(0, 120)}"`);
                    if (rCount !== null) console.log(`[LiveDiag-BE]    restaurants: ${rCount}`);
                    if (mCount !== null) console.log(`[LiveDiag-BE]    menuItems: ${mCount}`);
                    console.log(`[LiveDiag-BE]    trace: ${(result.trace || []).join(' → ')}`);
                    // ──────────────────────────────────────────────────────

                    socket.send(JSON.stringify({
                        type: 'tool_result',
                        request_id: requestId,
                        tool: toolName,
                        ok: result.ok,
                        response: result.response || null,
                        trace: result.trace || [],
                    }));

                    if (Array.isArray(result.response?.events) && result.response.events.length > 0) {
                        socket.send(JSON.stringify({
                            type: 'ui_events',
                            request_id: requestId,
                            events: result.response.events,
                        }));
                    }
                } catch (error) {
                    const errMsg = error?.message || 'live_gateway_error';
                    console.error(`[LiveDiag-BE] ❌ ToolRouter threw: ${toolName}  error:${errMsg}`);
                    liveLog.toolFail({ sessionId, toolName, requestId, error: errMsg });
                    socket.send(JSON.stringify({
                        type: 'tool_error',
                        request_id: requestId,
                        tool: toolName,
                        error: errMsg,
                    }));
                }
            });
        });

        return this.wss;
    }
}
