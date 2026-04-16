import { WebSocketServer } from 'ws';
import { URL } from 'node:url';
import { LIVE_TOOL_SCHEMAS } from './ToolSchemas.js';
import { validateAndSanitize } from './ToolValidator.js';
import { liveLog } from './liveObservability.js';
import {
    liveMetricsRegisterClientStats,
    liveMetricsRegisterReconnect,
    liveMetricsSessionClose,
    liveMetricsSessionStart,
} from './liveMetrics.js';
import { buildLiveArgsSummary, logLiveEvent } from './liveTraceEvents.js';
import { updateSession } from '../../brain/session/sessionStore.js';
import supabase from '../../brain/supabaseClient.js';

const TOOL_EXECUTION_TIMEOUT_MS = 8000;
const DEFAULT_LIVE_MODEL = process.env.GEMINI_LIVE_MODEL || process.env.LIVE_MODEL || 'gemini-2.5-flash-native-audio-preview-12-2025';

async function resolveRuntimeLiveModel() {
    let runtimeModel = DEFAULT_LIVE_MODEL;
    try {
        const { getConfig } = await import('../../config/configService.js');
        const cfg = await getConfig();
        const configModel = typeof cfg?.live_model === 'string' ? cfg.live_model.trim() : '';
        if (configModel) runtimeModel = configModel;
    } catch (error) {
        console.warn('[LIVE_BACK_MODEL] config_read_failed, using fallback:', error?.message || error);
    }
    return runtimeModel;
}

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

function toNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function compactText(value, max = 260) {
    if (value == null) return '';
    const text = String(value).trim();
    if (!text) return '';
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function buildActionSummary({ toolName, response }) {
    const runtimeIntent = response?.meta?.liveTool?.runtimeIntent || response?.intent || null;
    const restaurantsCount = Array.isArray(response?.restaurants) ? response.restaurants.length : null;
    const menuItemsCount = Array.isArray(response?.menuItems) ? response.menuItems.length : null;
    const cartItemsCount = Array.isArray(response?.cart?.items) ? response.cart.items.length : null;

    if ((toolName === 'find_nearby' || runtimeIntent === 'find_nearby') && restaurantsCount != null) {
        return `Znaleziono ${restaurantsCount} restauracji.`;
    }
    if ((toolName === 'show_menu' || runtimeIntent === 'menu_request') && menuItemsCount != null) {
        return `Załadowano menu (${menuItemsCount} pozycji).`;
    }
    if (toolName === 'add_item_to_cart' || toolName === 'add_items_to_cart' || runtimeIntent === 'create_order') {
        if (cartItemsCount != null) return `Zaktualizowano koszyk (${cartItemsCount} pozycji).`;
        return 'Przetworzono zmianę koszyka.';
    }
    if (
        toolName === 'update_cart_item_quantity'
        || toolName === 'remove_item_from_cart'
        || toolName === 'replace_cart_item'
    ) {
        if (cartItemsCount != null) return `Zaktualizowano koszyk (${cartItemsCount} pozycji).`;
        return 'Zmieniono koszyk.';
    }
    if (toolName === 'open_checkout' || runtimeIntent === 'open_checkout') {
        return 'Otwarto podgląd zamówienia.';
    }
    return `Wykonano narzędzie: ${toolName}`;
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

        this.wss.on('connection', async (socket, req) => {
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
            const runtimeModel = await resolveRuntimeLiveModel();
            console.log(`[LIVE BACK MODEL] ${runtimeModel} sessionId=${sessionId}`);
            liveMetricsSessionStart({
                sessionId,
                model: runtimeModel,
            });

            socket.on('close', (code) => {
                liveLog.wsDisconnect({ sessionId, code });
                liveMetricsSessionClose({ sessionId });
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
                    if (parsed.type === 'live_metrics' || parsed.type === 'client_metrics') {
                        if (parsed.reconnect === true) {
                            liveMetricsRegisterReconnect({ sessionId });
                        }
                        liveMetricsRegisterClientStats({
                            sessionId,
                            payload: parsed,
                        });
                        socket.send(JSON.stringify({
                            type: 'metrics_ack',
                            session_id: sessionId,
                        }));
                        return;
                    }
                    if (parsed.type === 'session_init') {
                        const lat = typeof parsed.lat === 'number' ? parsed.lat : null;
                        const lng = typeof parsed.lng === 'number' ? parsed.lng : null;
                        if (Number.isFinite(lat) && Number.isFinite(lng)) {
                            updateSession(sessionId, { session_lat: lat, session_lng: lng });
                            console.log(`[SESSION_INIT] GPS saved sessionId=${sessionId} lat=${lat} lng=${lng}`);
                        }
                        return;
                    }
                    socket.send(JSON.stringify({ type: 'tool_error', error: 'unsupported_message_type' }));
                    return;
                }

                const toolName = parsed.tool;
                const requestId = parsed.request_id || null;
                const turnId = parsed.turn_id || requestId || `live_turn_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
                const transcriptFinal = compactText(parsed.transcript_final || parsed.transcript || parsed.user_text || '');

                console.log(`[LiveDiag-BE] WS tool_call received: ${toolName} req:${requestId} session:${sessionId}`);
                console.log(`[LiveDiag-BE] args:`, JSON.stringify(parsed.args || {}));

                if (transcriptFinal) {
                    logLiveEvent({
                        sessionId,
                        eventType: 'live_transcript_final',
                        payload: {
                            source: 'live',
                            session_id: sessionId,
                            turn_id: turnId,
                            text: transcriptFinal,
                            lang: parsed.lang || null,
                            asr_confidence: parsed.asr_confidence ?? null,
                            ts_client: parsed.ts_client || null,
                        },
                        eventStatus: 'success',
                        workflowStep: 'live_transcript',
                    });
                }

                const validation = validateAndSanitize(toolName, parsed.args || {});
                if (!validation.valid) {
                    console.warn(`[LiveDiag-BE] Validation failed: ${toolName} error:${validation.error} field:${validation.field}`);
                    liveLog.toolFail({ sessionId, toolName, requestId, error: validation.error, field: validation.field });
                    logLiveEvent({
                        sessionId,
                        eventType: 'live_tool_error',
                        payload: {
                            source: 'live',
                            session_id: sessionId,
                            turn_id: turnId,
                            request_id: requestId,
                            tool_name: toolName,
                            error_code: validation.error || 'validation_error',
                            error_message: validation.error || 'validation_error',
                            recoverable: true,
                        },
                        eventStatus: 'error',
                        workflowStep: 'live_tool',
                    });
                    socket.send(JSON.stringify({
                        type: 'tool_error',
                        request_id: requestId,
                        tool: toolName,
                        error: validation.error,
                        field: validation.field || null,
                    }));
                    return;
                }

                // Persist GPS from tool args as session context (fallback when session_init is delayed/missed).
                if (toolName === 'find_nearby') {
                    const lat = Number(validation.sanitized?.lat);
                    const lng = Number(validation.sanitized?.lng);
                    if (Number.isFinite(lat) && Number.isFinite(lng)) {
                        updateSession(sessionId, { session_lat: lat, session_lng: lng });
                        console.log(`[SESSION_GPS_FROM_TOOL] sessionId=${sessionId} lat=${lat} lng=${lng}`);
                    }
                }

                liveLog.toolCall({ sessionId, toolName, requestId });
                logLiveEvent({
                    sessionId,
                    eventType: 'live_tool_call',
                    payload: {
                        source: 'live',
                        session_id: sessionId,
                        turn_id: turnId,
                        request_id: requestId,
                        tool_name: toolName,
                        args_summary: buildLiveArgsSummary(toolName, validation.sanitized),
                        ts_server: new Date().toISOString(),
                    },
                    eventStatus: 'success',
                    workflowStep: 'live_tool',
                });

                try {
                    const result = await withTimeout(
                        this.toolRouter.executeToolCall({
                            sessionId,
                            toolName,
                            args: validation.sanitized,
                            requestId,
                            turnId,
                            transcript: transcriptFinal || null,
                            userText: transcriptFinal || null,
                        }),
                        TOOL_EXECUTION_TIMEOUT_MS,
                    );

                    const reply = result.response?.reply || result.response?.text || '(empty)';
                    const rCount = result.response?.restaurants?.length ?? null;
                    const mCount = result.response?.menuItems?.length ?? null;
                    const fullMenuCount = result.response?.menu?.length ?? null;
                    console.log(`[LiveDiag-BE] ToolRouter done: ${toolName} ok:${result.ok}`);
                    console.log(`[LiveDiag-BE] reply: "${reply.slice(0, 120)}"`);
                    if (rCount !== null) console.log(`[LiveDiag-BE] restaurants: ${rCount}`);
                    if (mCount !== null) console.log(`[LiveDiag-BE] menuItems(shortlist): ${mCount}`);
                    if (fullMenuCount !== null) console.log(`[LiveDiag-BE] menu(full): ${fullMenuCount}`);
                    console.log(`[LiveDiag-BE] trace: ${(result.trace || []).join(' -> ')}`);

                    // Loguj intencję do amber_intents (zasila panel "Ostatnie interakcje Amber")
                    {
                        const intentLogged = result?.response?.intent || result?.response?.meta?.liveTool?.runtimeIntent || toolName;
                        const confidence = result?.response?.meta?.intentVerification?.confidence ?? (result.ok ? 1 : 0);
                        const blocked = result?.response?.meta?.liveTool?.blocked ?? false;
                        const latencyLogged = toNumber(result?.response?.timings?.durationMs ?? result?.response?.meta?.liveTool?.totalLatency, null);
                        supabase
                            .from('amber_intents')
                            .insert({
                                intent: intentLogged,
                                confidence,
                                reply: String(reply).slice(0, 120),
                                duration_ms: latencyLogged,
                                fallback: blocked,
                                created_at: new Date().toISOString(),
                            })
                            .then(() => {})
                            .catch(() => {}); // fire-and-forget, silent fail
                    }

                    const liveMeta = result?.response?.meta?.liveTool || {};
                    const actionSummary = buildActionSummary({ toolName, response: result.response });
                    const assistantText = compactText(result?.response?.reply || result?.response?.text || '');
                    const cartBefore = liveMeta.cartBefore || null;
                    const cartAfter = liveMeta.cartAfter || null;

                    logLiveEvent({
                        sessionId,
                        eventType: 'live_tool_result',
                        payload: {
                            source: 'live',
                            session_id: sessionId,
                            turn_id: liveMeta.turnId || turnId,
                            request_id: requestId,
                            tool_name: toolName,
                            ok: result.ok !== false,
                            intent: result?.response?.intent || liveMeta.runtimeIntent || null,
                            entities_resolved: Array.isArray(liveMeta.entitiesResolved) ? liveMeta.entitiesResolved : [],
                            action_summary: actionSummary,
                            assistant_text: assistantText || null,
                            cart_before: cartBefore ? { items: toNumber(cartBefore.items), total: toNumber(cartBefore.total) } : null,
                            cart_after: cartAfter ? { items: toNumber(cartAfter.items), total: toNumber(cartAfter.total) } : null,
                            latency_ms: toNumber(result?.response?.timings?.durationMs, null) ?? null,
                        },
                        eventStatus: result.ok !== false ? 'success' : 'error',
                        workflowStep: 'live_tool',
                    });

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
                    console.error(`[LiveDiag-BE] ToolRouter threw: ${toolName} error:${errMsg}`);
                    liveLog.toolFail({ sessionId, toolName, requestId, error: errMsg });
                    if (errMsg === 'tool_timeout') {
                        logLiveEvent({
                            sessionId,
                            eventType: 'live_turn_timeout',
                            payload: {
                                source: 'live',
                                session_id: sessionId,
                                turn_id: turnId,
                                request_id: requestId,
                                timeout_ms: TOOL_EXECUTION_TIMEOUT_MS,
                            },
                            eventStatus: 'error',
                            workflowStep: 'live_tool',
                        });
                    }
                    logLiveEvent({
                        sessionId,
                        eventType: 'live_tool_error',
                        payload: {
                            source: 'live',
                            session_id: sessionId,
                            turn_id: turnId,
                            request_id: requestId,
                            tool_name: toolName,
                            error_code: errMsg,
                            error_message: errMsg,
                            recoverable: true,
                            latency_ms: TOOL_EXECUTION_TIMEOUT_MS,
                        },
                        eventStatus: 'error',
                        workflowStep: 'live_tool',
                    });
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
