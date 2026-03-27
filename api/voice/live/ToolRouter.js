import { pipeline as brainPipeline } from '../../brain/brainV2.js';
import { getSession, updateSession } from '../../brain/session/sessionStore.js';
import { HandlerDispatcher } from '../../brain/core/pipeline/HandlerDispatcher.js';
import { ResponseBuilder } from '../../brain/core/pipeline/ResponseBuilder.js';
import {
    checkRequiredState,
    getFallbackIntent,
    getIntentDomain,
    mutatesCart,
} from '../../brain/core/IntentCapabilityMap.js';
import { CART_MUTATION_WHITELIST } from '../../brain/core/pipeline/IntentGroups.js';
import { ORDER_MODE_EVENT, ORDER_MODE_STATE, transitionOrderMode } from '../../brain/core/pipeline/OrderModeFSM.js';

const TOOL_TO_INTENT = Object.freeze({
    find_nearby: 'find_nearby',
    select_restaurant: 'select_restaurant',
    show_menu: 'menu_request',
    show_more_options: 'show_more_options',
    add_item_to_cart: 'create_order',
    add_items_to_cart: 'create_order',
    confirm_add_to_cart: 'confirm_add_to_cart',
    open_checkout: 'open_checkout',
    confirm_order: 'confirm_order',
    cancel_order: 'cancel_order',
    get_cart_state: 'get_cart_state',
});

function getOrderModeEvent(intent, preState, domainResponse) {
    const expectedContext = domainResponse?.contextUpdates?.expectedContext || null;

    if (intent === 'confirm_order') return ORDER_MODE_EVENT.CONFIRM_ORDER;
    if (intent === 'open_checkout') return ORDER_MODE_EVENT.OPEN_CHECKOUT;
    if (intent === 'cancel_order') return ORDER_MODE_EVENT.CANCEL_ORDER;

    if (intent === 'find_nearby' || intent === 'show_more_options') {
        return ORDER_MODE_EVENT.RESET_TO_NEUTRAL;
    }

    if (intent === 'select_restaurant' || intent === 'menu_request') {
        return ORDER_MODE_EVENT.SELECT_RESTAURANT;
    }

    if (expectedContext === 'confirm_order') return ORDER_MODE_EVENT.REQUEST_CONFIRM;

    if (intent === 'create_order' || intent === 'confirm_add_to_cart') {
        if (
            preState === ORDER_MODE_STATE.NEUTRAL
            || preState === ORDER_MODE_STATE.RESTAURANT_SELECTED
            || preState === ORDER_MODE_STATE.COMPLETED
            || preState === ORDER_MODE_STATE.CANCELLED
        ) {
            return ORDER_MODE_EVENT.START_ORDER;
        }
        return ORDER_MODE_EVENT.ADD_ITEM;
    }

    return ORDER_MODE_EVENT.NOOP;
}

function mapToolPayload(toolName, args = {}) {
    switch (toolName) {
        case 'find_nearby':
            return {
                text: args.location
                    ? `pokaż restauracje w ${args.location}`
                    : (args.cuisine ? `szukam ${args.cuisine}` : 'gdzie zamówię'),
                entities: {
                    location: args.location || null,
                    cuisine: args.cuisine || null,
                    quantity: 1,
                    restaurant: null,
                    restaurantId: null,
                    dish: null,
                    items: null,
                },
                coords: (Number.isFinite(args.lat) && Number.isFinite(args.lng))
                    ? { lat: Number(args.lat), lng: Number(args.lng) }
                    : null,
            };
        case 'select_restaurant':
            return {
                text: args.selection_text || args.restaurant_name || 'wybieram restaurację',
                entities: {
                    restaurant: args.restaurant_name || null,
                    restaurantId: args.restaurant_id || null,
                },
            };
        case 'show_menu':
            return {
                text: args.restaurant_name ? `pokaż menu ${args.restaurant_name}` : 'pokaż menu',
                entities: {
                    restaurant: args.restaurant_name || null,
                    restaurantId: args.restaurant_id || null,
                },
            };
        case 'show_more_options':
            return {
                text: 'pokaż więcej opcji',
                entities: {},
            };
        case 'add_item_to_cart': {
            const quantity = Math.max(1, Math.floor(Number(args.quantity || 1)));
            return {
                text: quantity > 1 ? `${quantity} ${args.dish}` : `${args.dish}`,
                entities: {
                    dish: args.dish || null,
                    quantity,
                    hasExplicitNumber: quantity > 1,
                    restaurant: args.restaurant_name || null,
                    restaurantId: args.restaurant_id || null,
                    items: null,
                },
            };
        }
        case 'add_items_to_cart': {
            const sourceItems = Array.isArray(args.items) ? args.items : [];
            const normalizedItems = sourceItems
                .map((item) => ({
                    dish: item?.dish,
                    quantity: Math.max(1, Math.floor(Number(item?.quantity || 1))),
                    meta: item?.dish ? { rawLabel: item.dish } : undefined,
                }))
                .filter((item) => typeof item.dish === 'string' && item.dish.trim().length > 0);
            return {
                text: normalizedItems.map((item) => `${item.quantity} ${item.dish}`).join(' i '),
                entities: {
                    dish: normalizedItems[0]?.dish || null,
                    quantity: null,
                    items: normalizedItems,
                    compoundSource: 'live_tool',
                    hasExplicitNumber: normalizedItems.some((item) => item.quantity > 1),
                    skipCategoryClarify: normalizedItems.length > 1,
                    skipGenericTokenBlock: normalizedItems.length > 1,
                    restaurant: args.restaurant_name || null,
                    restaurantId: args.restaurant_id || null,
                },
            };
        }
        case 'confirm_add_to_cart':
            return { text: 'potwierdź dodanie do koszyka', entities: {} };
        case 'open_checkout':
            return { text: 'przejdź do checkoutu', entities: {} };
        case 'confirm_order':
            return { text: 'potwierdzam zamówienie', entities: {} };
        case 'cancel_order':
            return { text: 'anuluj zamówienie', entities: {} };
        case 'get_cart_state':
            return { text: 'pokaż koszyk', entities: {} };
        default:
            return { text: '', entities: {} };
    }
}

function buildClarifyResponse(activeSessionId, intent, reason, trace = []) {
    const fallbackReply = reason === 'state_requirements_not_met'
        ? 'Brakuje wymaganego kontekstu tej akcji. Najpierw wybierz restaurację lub menu.'
        : 'Ta akcja została zablokowana przez politykę bezpieczeństwa.';

    return {
        ok: true,
        session_id: activeSessionId,
        intent,
        text: fallbackReply,
        reply: fallbackReply,
        should_reply: true,
        actions: [],
        events: [],
        recommendations: [],
        meta: {
            source: 'live_tool_guard',
            liveTool: {
                blocked: true,
                reason,
                trace,
            },
        },
        context: getSession(activeSessionId) || {},
        timestamp: new Date().toISOString(),
    };
}

export class ToolRouter {
    constructor(deps = {}) {
        this.pipeline = deps.pipeline || brainPipeline;
        this.handlers = deps.handlers || this.pipeline.handlers;
        this.getSession = deps.getSession || getSession;
        this.updateSession = deps.updateSession || updateSession;
    }

    async executeToolCall({ sessionId, toolName, args = {}, requestId = null }) {
        const startedAt = Date.now();
        const intent = TOOL_TO_INTENT[toolName] || null;

        if (!sessionId || typeof sessionId !== 'string') {
            return {
                ok: false,
                error: 'missing_session_id',
            };
        }

        if (!intent) {
            return {
                ok: false,
                error: 'unknown_tool',
                tool: toolName,
            };
        }

        if (intent === 'get_cart_state') {
            const snapshot = this.getSession(sessionId) || {};
            const cart = snapshot.cart || { items: [], total: 0 };
            return {
                ok: true,
                tool: toolName,
                request_id: requestId,
                response: {
                    ok: true,
                    session_id: sessionId,
                    intent: 'get_cart_state',
                    reply: `Koszyk ma ${Array.isArray(cart.items) ? cart.items.length : 0} pozycji.`,
                    text: `Koszyk ma ${Array.isArray(cart.items) ? cart.items.length : 0} pozycji.`,
                    cart,
                    meta: {
                        source: 'live_tool:get_cart_state',
                    },
                    context: snapshot,
                    timestamp: new Date().toISOString(),
                },
                trace: ['tool:get_cart_state'],
            };
        }

        const trace = [`tool:${toolName}`, `intent:${intent}`];
        const mapped = mapToolPayload(toolName, args);
        const entities = mapped.entities || {};

        let runtimeIntent = intent;
        let runtimeDomain = getIntentDomain(runtimeIntent);
        let sessionSnapshot = this.getSession(sessionId) || {};
        const stateCheck = checkRequiredState(runtimeIntent, sessionSnapshot, entities);

        trace.push(`icm_required_state:${stateCheck.met ? 'ok' : 'fail'}`);

        if (!stateCheck.met) {
            const fallbackIntent = getFallbackIntent(runtimeIntent);
            if (fallbackIntent) {
                runtimeIntent = fallbackIntent;
                runtimeDomain = getIntentDomain(runtimeIntent);
                trace.push(`icm_fallback_intent:${fallbackIntent}`);
            } else {
                return {
                    ok: true,
                    tool: toolName,
                    request_id: requestId,
                    response: buildClarifyResponse(sessionId, runtimeIntent, 'state_requirements_not_met', trace),
                    trace,
                };
            }
        }

        if (mutatesCart(runtimeIntent) && !CART_MUTATION_WHITELIST.includes(runtimeIntent)) {
            trace.push('cart_mutation_blocked:not_whitelisted');
            return {
                ok: true,
                tool: toolName,
                request_id: requestId,
                response: buildClarifyResponse(sessionId, runtimeIntent, 'cart_mutation_not_whitelisted', trace),
                trace,
            };
        }

        const context = {
            sessionId,
            text: mapped.text || '',
            rawText: mapped.text || '',
            entities,
            body: {
                meta: {
                    channel: 'live_tools',
                    sourceTool: toolName,
                },
                ...(mapped.coords || {}),
            },
            domain: runtimeDomain,
            intent: runtimeIntent,
            source: `live_tool:${toolName}`,
            session: sessionSnapshot,
            meta: {
                requestId,
                liveMode: true,
                toolName,
            },
            trace: [...trace],
        };

        const { handler } = HandlerDispatcher.resolve({
            handlers: this.handlers,
            context,
        });

        const applyContextUpdates = (patch) => {
            if (!patch || typeof patch !== 'object') return;
            const next = this.updateSession(sessionId, patch);
            context.session = next;
            context.trace.push(`context_update:${Object.keys(patch).join(',')}`);
        };

        context.dispatchIntentLocked = true;
        context.trace.push('dispatch_intent_locked:true');

        const domainResponse = await HandlerDispatcher.executeTransactional({
            handler,
            context,
            applyContextUpdates,
        });

        sessionSnapshot = this.getSession(sessionId) || context.session || {};
        const preOrderMode = sessionSnapshot?.orderMode || ORDER_MODE_STATE.NEUTRAL;
        const orderModeEvent = getOrderModeEvent(runtimeIntent, preOrderMode, domainResponse);
        const orderModeResult = transitionOrderMode(preOrderMode, orderModeEvent, {
            toolName,
            intent: runtimeIntent,
        });
        if (orderModeResult.changed) {
            this.updateSession(sessionId, { orderMode: orderModeResult.state });
            context.trace.push(`order_mode:${preOrderMode}->${orderModeResult.state}`);
        } else {
            context.trace.push(`order_mode:${preOrderMode}(noop)`);
        }

        const speechText = domainResponse?.reply || '';
        const { response } = ResponseBuilder.build({
            domainResponse: domainResponse || { reply: '', intent: runtimeIntent },
            activeSessionId: sessionId,
            speechText,
            speechPartForTTS: speechText,
            audioContent: null,
            intent: domainResponse?.intent || runtimeIntent,
            source: `live_tool:${toolName}`,
            totalLatency: Date.now() - startedAt,
            stylingMs: 0,
            ttsMs: 0,
            getSession: this.getSession,
        });

        response.meta = {
            ...(response.meta || {}),
            liveTool: {
                toolName,
                requestId,
                runtimeIntent,
                runtimeDomain,
                orderMode: orderModeResult.state,
            },
            trace: context.trace,
        };

        return {
            ok: true,
            tool: toolName,
            request_id: requestId,
            response,
            trace: context.trace,
        };
    }
}

