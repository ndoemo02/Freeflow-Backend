import { WebSocketServer } from 'ws';
import { URL } from 'node:url';
import { LIVE_TOOL_SCHEMAS } from './ToolSchemas.js';

function safeJsonParse(raw) {
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
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

            socket.send(JSON.stringify({
                type: 'live_ready',
                session_id: sessionId,
                tools: LIVE_TOOL_SCHEMAS.map((tool) => tool.name),
            }));

            socket.on('message', async (rawPayload) => {
                const parsed = safeJsonParse(rawPayload.toString());
                if (!parsed) {
                    socket.send(JSON.stringify({
                        type: 'tool_error',
                        error: 'invalid_json',
                    }));
                    return;
                }

                if (parsed.type !== 'tool_call') {
                    socket.send(JSON.stringify({
                        type: 'tool_error',
                        error: 'unsupported_message_type',
                    }));
                    return;
                }

                try {
                    const result = await this.toolRouter.executeToolCall({
                        sessionId,
                        toolName: parsed.tool,
                        args: parsed.args || {},
                        requestId: parsed.request_id || null,
                    });

                    socket.send(JSON.stringify({
                        type: 'tool_result',
                        request_id: parsed.request_id || null,
                        tool: parsed.tool,
                        ok: result.ok,
                        response: result.response || null,
                        trace: result.trace || [],
                    }));

                    if (Array.isArray(result.response?.events) && result.response.events.length > 0) {
                        socket.send(JSON.stringify({
                            type: 'ui_events',
                            request_id: parsed.request_id || null,
                            events: result.response.events,
                        }));
                    }
                } catch (error) {
                    socket.send(JSON.stringify({
                        type: 'tool_error',
                        request_id: parsed.request_id || null,
                        tool: parsed.tool || null,
                        error: error?.message || 'live_gateway_error',
                    }));
                }
            });
        });

        return this.wss;
    }
}

