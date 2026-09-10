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
import { buildInitialTurnTrace } from './liveTurnLedger.js';
import { updateSessionDurable } from '../../brain/session/sessionStore.js';
import {
    summarizeLiveToolResult,
    validateLiveOrigin,
} from './liveSecurity.js';
import { prepareLiveSession, persistLiveSession, liveSessionErrorResponse } from './liveSessionBoundary.js';
import { validateSessionId } from '../../brain/session/sessionIdContract.js';
import { runLiveSessionOperation } from './liveSessionQueue.js';
import { requireSessionAccess } from '../../brain/session/sessionAccess.js';

const VERIFIED_SESSION = Symbol('verifiedLiveSession');

const TOOL_EXECUTION_TIMEOUT_MS = 12000;
const DEFAULT_LIVE_MODEL = process.env.GEMINI_LIVE_MODEL || process.env.LIVE_MODEL || 'gemini-2.5-flash-native-audio-preview-12-2025';
const GPS_SOFT_RESET_DISTANCE_KM = 0.8;

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

function toFiniteNumber(value) {
    if (value == null || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function haversineKm(lat1, lng1, lat2, lng2) {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2
        + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function canApplyGeoSoftReset(session = {}) {
    const cartItems = Array.isArray(session?.cart?.items) ? session.cart.items.length : 0;
    const cartTotal = Number(session?.cart?.total || 0);
    const hasPendingOrder = Boolean(session?.pendingOrder);
    const orderMode = String(session?.orderMode || '').trim().toLowerCase();
    const hasActiveCheckout =
        orderMode === 'building'
        || orderMode === 'checkout_form'
        || orderMode === 'awaiting_confirmation';

    return (
        cartItems === 0
        && (!Number.isFinite(cartTotal) || cartTotal <= 0)
        && !hasPendingOrder
        && !hasActiveCheckout
    );
}

function buildGeoSoftResetPatch() {
    return {
        conversationPhase: 'idle',
        expectedContext: null,
        awaiting: null,
        pendingDish: null,
        pendingOrder: null,
        last_location: null,
        last_restaurants_list: null,
        lastRestaurants: [],
        currentRestaurant: null,
        current_restaurant: null,
        selectedRestaurant: null,
    };
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
    if (toolName === 'compare_restaurants' && restaurantsCount != null) {
        return `Poównano ${restaurantsCount} restauracji.`;
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

        this.wss = new WebSocketServer({ server, path,
            handleProtocols: protocols => protocols.has('freeflow') ? 'freeflow' : false,
            verifyClient: (info, done) => {
                const req = info.req;
                const sessionId = new URL(req.url, 'http://localhost').searchParams.get('session_id');
                const protocols = String(req.headers?.['sec-websocket-protocol'] || '').split(',').map(value => value.trim());
                const credential = protocols.find(value => value.startsWith('bearer.'));
                const authRequest = { headers: { authorization: credential ? `Bearer ${credential.slice(7)}` : req.headers?.authorization } };
                requireSessionAccess(authRequest, sessionId).then(() => {
                    req[VERIFIED_SESSION] = { sessionId, authRequest };
                    done(true);
                }).catch(error => done(false, error.statusCode || 503, 'Live access denied'));
            },
        });
        this._activeSockets = new Map();

        // Keepalive — ping wszystkich klientów co 15s, zapobiega terminacji
        // idle połączeń przez Vercel proxy (1001/1006).
        // Vercel ma ~60s timeout na idle — 15s daje margines 4x.
        this._keepaliveInterval = setInterval(() => {
            this.wss?.clients.forEach((ws) => {
                if (ws.readyState === ws.OPEN) ws.ping();
            });
        }, 15000);
        this._keepaliveInterval.unref?.();

        this.wss.on('connection', async (socket, req) => {
            if (!this.isLiveEnabled()) {
                socket.close(4001, 'LIVE_MODE_DISABLED');
                return;
            }

            const originCheck = validateLiveOrigin(req?.headers?.origin);
            if (!originCheck.ok) {
                socket.close(4003, 'ORIGIN_NOT_ALLOWED');
                return;
            }

            const requestUrl = new URL(req.url, 'http://localhost');
            const sessionIdVerdict = validateSessionId(requestUrl.searchParams.get('session_id'));
            if (!sessionIdVerdict.ok) {
                socket.close(4002, sessionIdVerdict.error.toUpperCase());
                return;
            }
            const sessionId = sessionIdVerdict.sessionId;
            if (req[VERIFIED_SESSION]?.sessionId !== sessionId) {
                socket.close(4003, 'UNAUTHORIZED');
                return;
            }
            const authRequest = req[VERIFIED_SESSION].authRequest;

            // Deduplikacja: zamknij poprzedni socket dla tego samego sessionId
            // przed rejestracją nowego — zapobiega data race w sessionStore.
            const existingSocket = this._activeSockets.get(sessionId);
            if (existingSocket && existingSocket !== socket) {
                try {
                    existingSocket.close(4000, 'duplicate_session_replaced');
                } catch { /* socket already closing */ }
            }
            this._activeSockets.set(sessionId, socket);

            liveLog.wsConnect({ sessionId });

            // Rejestruj handler message PRZED await resolveRuntimeLiveModel.
            // Eliminuje okno ~200ms gdzie przychodzące wiadomości były gubione.
            // Queue by session, not socket: replacement connections must wait
            // for an already-running tool and its durable checkpoint.
            let closed = false;
            const isCurrentSocket = () => !closed && socket.readyState === 1
                && this._activeSockets.get(sessionId) === socket;
            const sendIfCurrent = payload => {
                if (!isCurrentSocket()) return;
                try { socket.send(payload); } catch { closed = true; }
            };
            let sessionInitError = null;
            const processMessage = async (rawPayload) => {
                if (!isCurrentSocket()) return;
                const parsed = safeJsonParse(rawPayload.toString());

                if (!parsed) {
                    sendIfCurrent(JSON.stringify({ type: 'tool_error', error: 'invalid_json' }));
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
                        sendIfCurrent(JSON.stringify({
                            type: 'metrics_ack',
                            session_id: sessionId,
                        }));
                        return;
                    }
                    if (parsed.type === 'session_init') {
                        try {
                            const sessionSnapshot = await prepareLiveSession(sessionId, parsed, authRequest);
                            if (!isCurrentSocket()) return;
                            const lat = typeof parsed.lat === 'number' ? parsed.lat : null;
                            const lng = typeof parsed.lng === 'number' ? parsed.lng : null;
                            if (Number.isFinite(lat) && Number.isFinite(lng)) {
                                const prevLat = toFiniteNumber(sessionSnapshot?.session_lat);
                                const prevLng = toFiniteNumber(sessionSnapshot?.session_lng);
                                const movedKm = prevLat != null && prevLng != null
                                    ? haversineKm(prevLat, prevLng, lat, lng) : 0;
                                const geoSoftResetApplied = movedKm >= GPS_SOFT_RESET_DISTANCE_KM && canApplyGeoSoftReset(sessionSnapshot);
                                await updateSessionDurable(sessionId, {
                                    ...(geoSoftResetApplied ? buildGeoSoftResetPatch() : {}),
                                    session_lat: lat,
                                    session_lng: lng,
                                    session_geo_updated_at: new Date().toISOString(),
                                });
                                console.log(`[SESSION_INIT] GPS saved sessionId=${sessionId} lat=${lat} lng=${lng}`);
                                if (geoSoftResetApplied) {
                                    console.log(`[SESSION_GPS_MOVE_RESET] sessionId=${sessionId} movedKm=${movedKm.toFixed(2)} cart=empty pendingOrder=false`);
                                }
                            }
                            sessionInitError = null;
                        } catch (error) {
                            sessionInitError = liveSessionErrorResponse(error)?.body.error || 'live_session_unavailable';
                            sendIfCurrent(JSON.stringify({
                                type: 'tool_error',
                                error: sessionInitError,
                            }));
                        }
                        return;
                    }
                    sendIfCurrent(JSON.stringify({ type: 'tool_error', error: 'unsupported_message_type' }));
                    return;
                }

                const toolName = parsed.tool;
                const requestId = parsed.request_id || null;
                if (sessionInitError) {
                    sendIfCurrent(JSON.stringify({ type: 'tool_error', request_id: requestId, tool: toolName, error: sessionInitError }));
                    return;
                }
                const turnId = parsed.turn_id || requestId || `live_turn_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
                const transcriptFinal = compactText(parsed.transcript_final || '');
                const turnTrace = buildInitialTurnTrace({
                    sessionId,
                    turnId,
                    requestId,
                    toolName,
                    rawArgs: parsed.args || {},
                    rawTranscript: parsed.raw_transcript || parsed.transcript_raw || null,
                    finalTranscript: parsed.transcript_final || transcriptFinal || null,
                    source: 'gemini_live_ws',
                });

                console.log(`[LiveDiag-BE] WS tool_call received: ${toolName} req:${requestId} session:${sessionId} turn:${turnId}`);
                console.log(`[InteractionBridge] toolcall_received turn_id=${turnId} session_id=${sessionId} tool=${toolName}`);


                const validation = validateAndSanitize(toolName, parsed.args || {});
                if (!validation.valid) {
                    console.warn(`[LiveDiag-BE] Validation failed: ${toolName} error:${validation.error} field:${validation.field}`);
                    liveLog.toolFail({ sessionId, toolName, requestId, error: validation.error, field: validation.field });
                    sendIfCurrent(JSON.stringify({
                        type: 'tool_error',
                        request_id: requestId,
                        tool: toolName,
                        error: validation.error,
                        field: validation.field || null,
                    }));
                    return;
                }

                try {
                    const session = await prepareLiveSession(sessionId, parsed, authRequest);
                    if (!isCurrentSocket()) return;
                    // Persist GPS from tool args as context when session_init is delayed/missed.
                    // Keep existing session GPS: Gemini may hallucinate coordinates.
                    if (toolName === 'find_nearby') {
                        const lat = Number(validation.sanitized?.lat);
                        const lng = Number(validation.sanitized?.lng);
                        if (Number.isFinite(lat) && Number.isFinite(lng)) {
                            const hasSessionGps = toFiniteNumber(session?.session_lat) != null && toFiniteNumber(session?.session_lng) != null;
                            if (!hasSessionGps) {
                                try {
                                    await updateSessionDurable(sessionId, { session_lat: lat, session_lng: lng });
                                } catch (cause) {
                                    throw Object.assign(new Error('live_session_unavailable', { cause }), { code: 'live_session_unavailable', statusCode: 503 });
                                }
                                console.log(`[SESSION_GPS_FROM_TOOL] sessionId=${sessionId} lat=${lat} lng=${lng}`);
                            } else {
                                console.log(`[SESSION_GPS_FROM_TOOL] SKIP — session already has GPS (session_init), ignoring tool GPS lat=${lat} lng=${lng}`);
                            }
                        }
                    }

                    if (!isCurrentSocket()) return;
                    liveLog.toolCall({ sessionId, toolName, requestId });

                    const execution = this.toolRouter.executeToolCall({
                            sessionId,
                            toolName,
                            args: validation.sanitized,
                            requestId,
                            turnId,
                            transcript: transcriptFinal || null,
                            userText: null,
                            debugLiveFlow: {
                                turnTrace,
                                rawArgs: parsed.args || {},
                                finalTranscript: parsed.transcript_final || transcriptFinal || null,
                            },
                        });
                    let result;
                    try {
                        result = await withTimeout(execution, TOOL_EXECUTION_TIMEOUT_MS);
                    } catch (error) {
                        if (error?.message !== 'tool_timeout') throw error;
                        sendIfCurrent(JSON.stringify({ type: 'tool_error', request_id: requestId, tool: toolName, error: 'tool_timeout' }));
                        // A timeout cannot cancel a legacy tool. Keep the session
                        // locked until it settles; never publish its late result.
                        await execution.catch(() => undefined);
                        try { await persistLiveSession(sessionId); } catch {
                            sessionInitError = 'live_session_unavailable';
                        }
                        return;
                    }
                    await persistLiveSession(sessionId);

                    const reply = result.response?.reply || result.response?.text || '(empty)';
                    const summary = summarizeLiveToolResult(result, toolName);
                    console.log(`[LIVE_TOOL_SUMMARY] session=${sessionId} tool=${toolName} ok=${result.ok !== false} intent=${summary.intent} restaurantLocked=${summary.restaurantLocked} candidateCount=${summary.candidateCount ?? 'n/a'} topMatch=${summary.topMatch ?? 'n/a'} score=${summary.score ?? 'n/a'}`);


                    const liveMeta = result?.response?.meta?.liveTool || {};
                    const actionSummary = buildActionSummary({ toolName, response: result.response });
                    const assistantText = compactText(result?.response?.reply || result?.response?.text || '');
                    const cartBefore = liveMeta.cartBefore || null;
                    const cartAfter = liveMeta.cartAfter || null;


                    sendIfCurrent(JSON.stringify({
                        type: 'tool_result',
                        request_id: requestId,
                        turn_id: liveMeta.turnId || turnId,
                        tool: toolName,
                        ok: result.ok,
                        response: result.response || null,
                        trace: result.trace || [],
                    }));
                    console.log(`[InteractionBridge] backend_execution_done turn_id=${liveMeta.turnId || turnId} session_id=${sessionId} tool=${toolName} ok=${result.ok !== false}`);

                    if (Array.isArray(result.response?.events) && result.response.events.length > 0) {
                        sendIfCurrent(JSON.stringify({
                            type: 'ui_events',
                            request_id: requestId,
                            events: result.response.events,
                        }));
                    }
                } catch (error) {
                    const errMsg = liveSessionErrorResponse(error)?.body.error || error?.message || 'live_gateway_error';
                    console.error(`[LiveDiag-BE] ToolRouter threw: ${toolName} error:${errMsg}`);
                    liveLog.toolFail({ sessionId, toolName, requestId, error: errMsg });
                    sendIfCurrent(JSON.stringify({
                        type: 'tool_error',
                        request_id: requestId,
                        tool: toolName,
                        error: errMsg,
                    }));
                }
            };
            socket.on('message', (rawPayload) => {
                return runLiveSessionOperation(sessionId, () => processMessage(rawPayload)).catch(() => {
                    sessionInitError = 'live_session_unavailable';
                    sendIfCurrent(JSON.stringify({ type: 'tool_error', error: sessionInitError }));
                });
            });

            socket.on('close', (code) => {
                closed = true;
                if (this._activeSockets.get(sessionId) === socket) {
                    this._activeSockets.delete(sessionId);
                    liveMetricsSessionClose({ sessionId });
                }
                liveLog.wsDisconnect({ sessionId, code });
            });
            socket.on('error', () => { closed = true; });

            const runtimeModel = await resolveRuntimeLiveModel();
            if (!isCurrentSocket()) return;
            console.log(`[LIVE BACK MODEL] ${runtimeModel} sessionId=${sessionId}`);
            liveMetricsSessionStart({ sessionId, model: runtimeModel });

            sendIfCurrent(JSON.stringify({
                type: 'live_ready',
                session_id: sessionId,
                tools: LIVE_TOOL_SCHEMAS.map((tool) => tool.name),
            }));
        });

        return this.wss;
    }
}
