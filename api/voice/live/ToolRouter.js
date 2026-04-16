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
import { liveLog } from './liveObservability.js';
import { liveMetricsRegisterToolCall } from './liveMetrics.js';
import { CART_MUTATION_WHITELIST } from '../../brain/core/pipeline/IntentGroups.js';
import { ORDER_MODE_EVENT, ORDER_MODE_STATE, transitionOrderMode } from '../../brain/core/pipeline/OrderModeFSM.js';
import { findRestaurantInText } from '../../brain/data/restaurantCatalog.js';
import { sanitizeLocation } from '../../brain/core/ConversationGuards.js';
import { verifyToolCall } from './IntentVerificationLayer.js';

const TOOL_TO_INTENT = Object.freeze({
    find_nearby: 'find_nearby',
    select_restaurant: 'select_restaurant',
    show_menu: 'menu_request',
    show_more_options: 'show_more_options',
    add_item_to_cart: 'create_order',
    add_items_to_cart: 'create_order',
    update_cart_item_quantity: 'create_order',
    remove_item_from_cart: 'create_order',
    replace_cart_item: 'create_order',
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

function mapToolPayload(toolName, args = {}, options = {}) {
    const transcriptHint = String(options?.transcriptText || '').trim();
    // Keep tool args as source of truth for discovery calls.
    // Transcript hint remains enabled for non-discovery tools where it helps order phrasing.
    const allowTranscriptHint = toolName !== 'find_nearby';
    const pickText = (fallbackText) => (allowTranscriptHint && transcriptHint) ? transcriptHint : fallbackText;
    switch (toolName) {
        case 'find_nearby':
            return {
                text: pickText(
                    args.location
                        ? (args.cuisine ? `szukam ${args.cuisine} w ${args.location}` : `pokaz restauracje w ${args.location}`)
                        : (args.cuisine ? `szukam ${args.cuisine}` : 'gdzie zamowic'),
                ),
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
                text: pickText(args.selection_text || args.restaurant_name || 'wybieram restauracje'),
                entities: {
                    restaurant: args.restaurant_name || null,
                    restaurantId: args.restaurant_id || null,
                },
            };
        case 'show_menu':
            return {
                text: pickText(args.restaurant_name ? `pokaz menu ${args.restaurant_name}` : 'pokaz menu'),
                entities: {
                    restaurant: args.restaurant_name || null,
                    restaurantId: args.restaurant_id || null,
                },
            };
        case 'show_more_options':
            return {
                text: pickText('pokaz wiecej opcji'),
                entities: {},
            };
        case 'add_item_to_cart': {
            const quantity = Math.max(1, Math.floor(Number(args.quantity || 1)));
            return {
                text: pickText(quantity > 1 ? `${quantity} ${args.dish}` : `${args.dish}`),
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
                text: pickText(normalizedItems.map((item) => `${item.quantity} ${item.dish}`).join(' i ')),
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
        case 'update_cart_item_quantity': {
            const quantity = Math.max(1, Math.floor(Number(args.quantity || 1)));
            return {
                text: pickText(`zmien ilosc ${args.dish || 'pozycji'} na ${quantity}`),
                entities: {
                    dish: args.dish || null,
                    quantity,
                    restaurant: args.restaurant_name || null,
                    restaurantId: args.restaurant_id || null,
                    items: null,
                },
            };
        }
        case 'remove_item_from_cart': {
            const quantity = args.quantity == null ? null : Math.max(1, Math.floor(Number(args.quantity || 1)));
            return {
                text: pickText(quantity ? `usun ${quantity} ${args.dish || 'pozycji'}` : `usun ${args.dish || 'pozycje'}`),
                entities: {
                    dish: args.dish || null,
                    quantity,
                    restaurant: args.restaurant_name || null,
                    restaurantId: args.restaurant_id || null,
                    items: null,
                },
            };
        }
        case 'replace_cart_item': {
            const quantity = args.quantity == null ? null : Math.max(1, Math.floor(Number(args.quantity || 1)));
            return {
                text: pickText(`zamien ${args.from_dish || 'pozycje'} na ${args.to_dish || 'inna pozycje'}`),
                entities: {
                    dish: args.to_dish || null,
                    quantity,
                    restaurant: args.restaurant_name || null,
                    restaurantId: args.restaurant_id || null,
                    items: null,
                },
            };
        }
        case 'confirm_add_to_cart':
            return { text: pickText('potwierdz dodanie do koszyka'), entities: {} };
        case 'open_checkout':
            return { text: pickText('przejdz do checkoutu'), entities: {} };
        case 'confirm_order':
            return { text: pickText('potwierdzam zamowienie'), entities: {} };
        case 'cancel_order':
            return { text: pickText('anuluj zamowienie'), entities: {} };
        case 'get_cart_state':
            return { text: pickText('pokaz koszyk'), entities: {} };
        default:
            return { text: '', entities: {} };
    }
}

function hasNearbyCue(text = '') {
    const t = String(text || '').toLowerCase();
    return /\b(w pobliżu|w poblizu|w okolicy|blisko|nearby|obok)\b/i.test(t);
}

function normalizeLoose(value = '') {
    return String(value || '')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function shouldDropLocationForGps({ locationCandidate, cuisineCandidate, transcriptText, locationLooksLikeRestaurant }) {
    if (!locationCandidate) return false;

    const normalizedLocation = normalizeLoose(locationCandidate);
    const normalizedCuisine = normalizeLoose(cuisineCandidate);

    const isPlaceholder = /\b(current location|my location|here|nearby|w poblizu|blisko|biezaca lokalizacja)\b/i.test(normalizedLocation);
    const mirrorsCuisine = !!normalizedCuisine && normalizedLocation === normalizedCuisine;
    const transcriptNearbyCue = hasNearbyCue(transcriptText);

    return Boolean(
        locationLooksLikeRestaurant
        || isPlaceholder
        || mirrorsCuisine
        || transcriptNearbyCue
    );
}
function buildClarifyResponse(activeSessionId, intent, reason, trace = []) {
    const fallbackReply = reason === 'state_requirements_not_met'
        ? 'Brakuje wymaganego kontekstu tej akcji. Najpierw wybierz restauracjĂ„â„˘ lub menu.'
        : 'Ta akcja zostaÄąâ€ša zablokowana przez politykĂ„â„˘ bezpieczeÄąâ€žstwa.';

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

function toEntitiesResolved(entities = {}) {
    if (!entities || typeof entities !== 'object') return [];
    return Object.entries(entities)
        .filter(([, value]) => value !== null && value !== undefined && value !== '')
        .slice(0, 12)
        .map(([key, value]) => ({ key, value }));
}

function coercePositiveInt(value, fallback = 1) {
    const parsed = Math.floor(Number(value));
    if (!Number.isFinite(parsed) || parsed < 1) return fallback;
    return parsed;
}

function readItemQty(item = {}) {
    return coercePositiveInt(item.qty ?? item.quantity ?? 1, 1);
}

function readItemUnitPrice(item = {}) {
    const directCandidates = [item.price_pln, item.price, item.unit_price, item.unitPrice];
    for (const candidate of directCandidates) {
        const parsed = Number(candidate);
        if (Number.isFinite(parsed)) return parsed;
    }
    const cents = Number(item.unit_price_cents ?? item.price_cents);
    if (Number.isFinite(cents)) return cents / 100;
    return 0;
}

function recalcCartTotal(items = []) {
    const total = items.reduce((sum, item) => {
        return sum + readItemUnitPrice(item) * readItemQty(item);
    }, 0);
    return Number(total.toFixed(2));
}

function ensureCartShape(session = {}) {
    const rawCart = (session?.cart && typeof session.cart === 'object') ? session.cart : {};
    const items = Array.isArray(rawCart.items) ? rawCart.items.map((item) => ({ ...item })) : [];
    const rawTotal = Number(rawCart.total);
    const total = Number.isFinite(rawTotal) ? rawTotal : recalcCartTotal(items);
    return {
        ...rawCart,
        items,
        total,
    };
}

function findCartItemIndexByDish(items = [], dish = '') {
    const needle = normalizeLoose(dish);
    if (!needle) return -1;

    let bestIndex = -1;
    let bestScore = 0;

    for (let i = 0; i < items.length; i += 1) {
        const haystack = normalizeLoose(items[i]?.name || items[i]?.base_name || items[i]?.dish || '');
        if (!haystack) continue;

        let score = 0;
        if (haystack === needle) {
            score = 5;
        } else if (haystack.includes(needle)) {
            score = 4;
        } else if (needle.includes(haystack)) {
            score = 3;
        } else {
            const needleTokens = needle.split(' ').filter(Boolean);
            const hayTokens = haystack.split(' ').filter(Boolean);
            const overlap = needleTokens.filter((token) => hayTokens.includes(token)).length;
            if (overlap >= 2) score = 2;
            else if (overlap >= 1) score = 1;
        }

        if (score > bestScore) {
            bestScore = score;
            bestIndex = i;
        }
    }

    return bestScore > 0 ? bestIndex : -1;
}

export class ToolRouter {
    constructor(deps = {}) {
        this.pipeline = deps.pipeline || brainPipeline;
        this.handlers = deps.handlers || this.pipeline.handlers;
        this.getSession = deps.getSession || getSession;
        this.updateSession = deps.updateSession || updateSession;
        // Rapid-fire protection: śledzi czas ostatniego wywołania narzędzia per sesja
        // Map<sessionId, { toolName: string, timestamp: number, argsKey: string }>
        this._lastToolCallBySession = new Map();
    }

    _buildCartEditResult({ sessionId, toolName, requestId, reply, cart, context, trace = [] }) {
        return {
            ok: true,
            tool: toolName,
            request_id: requestId,
            response: {
                ok: true,
                session_id: sessionId,
                intent: 'create_order',
                reply,
                text: reply,
                cart,
                meta: {
                    source: `live_tool:${toolName}`,
                    trace,
                },
                context,
                timestamp: new Date().toISOString(),
            },
            trace,
        };
    }

    async _executeCartEditTool({
        sessionId,
        toolName,
        args = {},
        requestId = null,
        turnId = null,
        transcript = null,
        userText = null,
        trace = [],
    }) {
        const snapshot = this.getSession(sessionId) || {};
        const cart = ensureCartShape(snapshot);
        const dish = String(args?.dish || '').trim();
        const quantityArg = args?.quantity == null ? null : coercePositiveInt(args.quantity, 1);

        if (!Array.isArray(cart.items) || cart.items.length === 0) {
            return this._buildCartEditResult({
                sessionId,
                toolName,
                requestId,
                reply: 'Koszyk jest pusty.',
                cart: { ...cart, items: [], total: 0 },
                context: snapshot,
                trace,
            });
        }

        if (toolName === 'update_cart_item_quantity') {
            const matchIndex = findCartItemIndexByDish(cart.items, dish);
            if (matchIndex < 0) {
                return this._buildCartEditResult({
                    sessionId,
                    toolName,
                    requestId,
                    reply: `Nie widze pozycji "${dish}" w koszyku.`,
                    cart,
                    context: snapshot,
                    trace,
                });
            }

            const nextQty = coercePositiveInt(quantityArg ?? 1, 1);
            const matchedItem = { ...cart.items[matchIndex] };
            matchedItem.qty = nextQty;
            matchedItem.quantity = nextQty;
            cart.items[matchIndex] = matchedItem;
            cart.total = recalcCartTotal(cart.items);

            const updatedSession = this.updateSession(sessionId, { cart });
            const itemName = String(matchedItem.name || matchedItem.base_name || dish || 'pozycja').trim();

            return this._buildCartEditResult({
                sessionId,
                toolName,
                requestId,
                reply: `Zmienilam ilosc "${itemName}" na ${nextQty}.`,
                cart,
                context: updatedSession,
                trace,
            });
        }

        if (toolName === 'remove_item_from_cart') {
            const matchIndex = findCartItemIndexByDish(cart.items, dish);
            if (matchIndex < 0) {
                return this._buildCartEditResult({
                    sessionId,
                    toolName,
                    requestId,
                    reply: `Nie widze pozycji "${dish}" w koszyku.`,
                    cart,
                    context: snapshot,
                    trace,
                });
            }

            const matchedItem = { ...cart.items[matchIndex] };
            const currentQty = readItemQty(matchedItem);
            const removeQty = quantityArg == null ? currentQty : quantityArg;
            const nextQty = currentQty - removeQty;
            const itemName = String(matchedItem.name || matchedItem.base_name || dish || 'pozycja').trim();
            let reply = '';

            if (nextQty > 0) {
                matchedItem.qty = nextQty;
                matchedItem.quantity = nextQty;
                cart.items[matchIndex] = matchedItem;
                reply = `Zmniejszylam ilosc "${itemName}" do ${nextQty}.`;
            } else {
                cart.items.splice(matchIndex, 1);
                reply = `Usunelam "${itemName}" z koszyka.`;
            }

            cart.total = recalcCartTotal(cart.items);
            const updatedSession = this.updateSession(sessionId, { cart });

            return this._buildCartEditResult({
                sessionId,
                toolName,
                requestId,
                reply,
                cart,
                context: updatedSession,
                trace,
            });
        }

        if (toolName === 'replace_cart_item') {
            const fromDish = String(args?.from_dish || '').trim();
            const toDish = String(args?.to_dish || '').trim();
            if (!fromDish || !toDish) {
                return this._buildCartEditResult({
                    sessionId,
                    toolName,
                    requestId,
                    reply: 'Podaj pozycje do zamiany i nowa pozycje.',
                    cart,
                    context: snapshot,
                    trace,
                });
            }

            const fromIndex = findCartItemIndexByDish(cart.items, fromDish);
            if (fromIndex < 0) {
                return this._buildCartEditResult({
                    sessionId,
                    toolName,
                    requestId,
                    reply: `Nie widze pozycji "${fromDish}" w koszyku.`,
                    cart,
                    context: snapshot,
                    trace,
                });
            }

            if (normalizeLoose(fromDish) === normalizeLoose(toDish)) {
                const passthrough = await this._executeCartEditTool({
                    sessionId,
                    toolName: 'update_cart_item_quantity',
                    args: { dish: fromDish, quantity: quantityArg ?? readItemQty(cart.items[fromIndex]) },
                    requestId,
                    turnId,
                    transcript,
                    userText,
                    trace,
                });
                return passthrough;
            }

            const originalItem = cart.items[fromIndex];
            const replaceQty = quantityArg ?? readItemQty(originalItem);
            const sessionRestaurant = snapshot?.currentRestaurant || snapshot?.lastRestaurant || {};
            const restaurant_id = args?.restaurant_id || originalItem?.restaurant_id || sessionRestaurant?.id || null;
            const restaurant_name = args?.restaurant_name || originalItem?.restaurant_name || sessionRestaurant?.name || null;

            const addArgs = {
                dish: toDish,
                quantity: replaceQty,
                ...(restaurant_id ? { restaurant_id } : {}),
                ...(restaurant_name ? { restaurant_name } : {}),
            };

            const addRequestId = requestId ? `${requestId}:replace_add` : null;
            const addResult = await this.executeToolCall({
                sessionId,
                toolName: 'add_item_to_cart',
                args: addArgs,
                requestId: addRequestId,
                turnId,
                transcript,
                userText,
            });

            if (!addResult?.ok) {
                return addResult;
            }

            const afterAddSnapshot = this.getSession(sessionId) || {};
            const afterAddCart = ensureCartShape(afterAddSnapshot);
            const removeByIdIndex = originalItem?.id
                ? afterAddCart.items.findIndex((item) => String(item?.id || '') === String(originalItem.id))
                : -1;
            const removeIndex = removeByIdIndex >= 0
                ? removeByIdIndex
                : findCartItemIndexByDish(afterAddCart.items, fromDish);

            if (removeIndex >= 0) {
                afterAddCart.items.splice(removeIndex, 1);
                afterAddCart.total = recalcCartTotal(afterAddCart.items);
                this.updateSession(sessionId, { cart: afterAddCart });
            }

            const finalSnapshot = this.getSession(sessionId) || {};
            const finalCart = ensureCartShape(finalSnapshot);

            return this._buildCartEditResult({
                sessionId,
                toolName,
                requestId,
                reply: `Zamienilam "${fromDish}" na "${toDish}".`,
                cart: finalCart,
                context: finalSnapshot,
                trace,
            });
        }

        return this._buildCartEditResult({
            sessionId,
            toolName,
            requestId,
            reply: 'Nie obsluguje jeszcze tej edycji koszyka.',
            cart,
            context: snapshot,
            trace,
        });
    }

    async executeToolCall({ sessionId, toolName, args = {}, requestId = null, turnId = null, transcript = null, userText = null }) {
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

        liveMetricsRegisterToolCall({ sessionId, toolName });

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
        const transcriptText = String(transcript || userText || '').trim();
        const mapped = mapToolPayload(toolName, args, { transcriptText });
        const entities = mapped.entities || {};
        const textCameFromTranscript = Boolean(transcriptText && mapped.text === transcriptText);
        if (textCameFromTranscript) {
            trace.push('live_transcript_hint:used');
        } else if (transcriptText && toolName === 'find_nearby') {
            trace.push('live_transcript_hint:ignored_for_find_nearby');
        }

        // LIVE order convenience:
        // If model omits restaurant in add-to-cart args but user transcript contains
        // an explicit restaurant name, infer it from catalog and inject before IVL.
        const canInferOrderRestaurant =
            (toolName === 'add_item_to_cart' || toolName === 'add_items_to_cart')
            && !entities?.restaurant
            && !entities?.restaurantId
            && !args?.restaurant_name
            && !args?.restaurant_id
            && !!transcriptText;
        if (canInferOrderRestaurant) {
            const inferredRestaurant = findRestaurantInText(transcriptText);
            if (inferredRestaurant) {
                if (inferredRestaurant.name) {
                    entities.restaurant = inferredRestaurant.name;
                    args.restaurant_name = inferredRestaurant.name;
                }
                if (inferredRestaurant.id) {
                    entities.restaurantId = inferredRestaurant.id;
                    args.restaurant_id = inferredRestaurant.id;
                }
                console.log(`[LIVE_ORDER_SCOPE_INFER] tool=${toolName} restaurant="${inferredRestaurant.name || 'unknown'}" id=${inferredRestaurant.id || 'n/a'}`);
                trace.push(`live_order_restaurant_inferred:${inferredRestaurant.id || 'name_only'}`);
            }
        }

        // ─── Intent Verification Layer ────────────────────────────────────────
        // Uruchom PRZED główną logiką — po validateAndSanitize (robi GeminiLiveGateway/tool-call),
        // ale zanim ICM/FSM/handlers. Nie zastępuje istniejących guardów.
        {
            const lastCallRecord = this._lastToolCallBySession.get(sessionId);
            const lastToolCallTimestamp = (lastCallRecord?.toolName === toolName)
                ? lastCallRecord.timestamp
                : undefined;
            const lastToolCallArgsKey = (lastCallRecord?.toolName === toolName)
                ? lastCallRecord.argsKey
                : undefined;

            const sessionSnapshotForIVL = this.getSession(sessionId) || {};
            const ivlResult = verifyToolCall({
                toolName,
                args,
                session: sessionSnapshotForIVL,
                lastToolCallTimestamp,
                lastToolCallArgsKey,
            });

            // Zapisz bieżący timestamp dla ochrony rapid-fire
            this._lastToolCallBySession.set(sessionId, {
                toolName,
                timestamp: Date.now(),
                argsKey: JSON.stringify(args || {}),
            });

            // Dodaj trace z IVL do głównego trace
            for (const entry of ivlResult.trace) {
                trace.push(`ivl:${entry}`);
            }

            console.log(`[IVL] toolName=${toolName} verified=${ivlResult.verified} confidence=${ivlResult.confidence} reason=${ivlResult.reason || '-'}`);

            if (!ivlResult.verified || ivlResult.confidence < 0.4) {
                const ivlReason = ivlResult.reason || 'intent_verification_failed';
                trace.push(`ivl_blocked:${ivlReason}`);

                // Buduj odpowiedź clarify z komunikatem po polsku
                let ivlReply;
                if (ivlReason === 'duplicate_rapid_fire') {
                    ivlReply = 'Proszę chwilę poczekać — poprzednie polecenie jest jeszcze przetwarzane.';
                } else if (ivlReason === 'restaurant_id_not_in_session_list') {
                    ivlReply = 'Nie rozpoznaję tej restauracji na liście wyników. Proszę powiedzieć nazwę lub numer restauracji.';
                } else if (ivlReason === 'confirm_order_state_missing') {
                    ivlReply = 'Brak aktywnego zamówienia do potwierdzenia. Najpierw dodaj pozycje do koszyka.';
                } else if (ivlReason === 'fsm_escalation_blocked') {
                    ivlReply = 'Nie możemy przeskoczyć kroków — najpierw wybierz restaurację i dodaj pozycje.';
                } else if (ivlReason?.includes('downgraded_to_find_nearby')) {
                    ivlReply = 'Nie znalazłam tej restauracji na liście. Szukam ponownie…';
                } else {
                    ivlReply = 'Nie jestem pewna tej akcji. Czy możesz powtórzyć lub doprecyzować?';
                }

                const clarify = buildClarifyResponse(sessionId, intent, ivlReason, trace);
                clarify.reply = ivlReply;
                clarify.text = ivlReply;
                clarify.meta = {
                    ...(clarify.meta || {}),
                    intentVerification: {
                        verified: ivlResult.verified,
                        confidence: ivlResult.confidence,
                        reason: ivlReason,
                        trace: ivlResult.trace,
                    },
                };

                return {
                    ok: true,
                    tool: toolName,
                    request_id: requestId,
                    response: clarify,
                    trace,
                };
            }

            // Jeśli IVL sugeruje inny tool/args — zastosuj korekty
            if (ivlResult.adjustedTool || ivlResult.adjustedArgs) {
                if (ivlResult.adjustedTool && ivlResult.adjustedTool !== toolName) {
                    trace.push(`ivl_adjusted_tool:${toolName}->${ivlResult.adjustedTool}`);
                    // Re-dispatch jako find_nearby (jedyne obsługiwane downgrade)
                    // Wywołujemy rekurencyjnie z nowym toolName i args
                    return this.executeToolCall({
                        sessionId,
                        toolName: ivlResult.adjustedTool,
                        args: ivlResult.adjustedArgs || {},
                        requestId,
                        turnId,
                        transcript,
                        userText,
                    });
                }
                if (ivlResult.adjustedArgs) {
                    Object.assign(args, ivlResult.adjustedArgs);
                    trace.push('ivl_adjusted_args:applied');
                }
            }
        }
        // ─────────────────────────────────────────────────────────────────────

        const isCartEditTool =
            toolName === 'update_cart_item_quantity'
            || toolName === 'remove_item_from_cart'
            || toolName === 'replace_cart_item';

        if (isCartEditTool) {
            return this._executeCartEditTool({
                sessionId,
                toolName,
                args,
                requestId,
                turnId,
                transcript,
                userText,
                trace,
            });
        }

        let runtimeIntent = intent;
        let runtimeDomain = getIntentDomain(runtimeIntent);

        const latArg = Number(args?.lat);
        const lngArg = Number(args?.lng);
        const hasGeoArgs = Number.isFinite(latArg) && Number.isFinite(lngArg);
        const locationCandidate = String(args?.location || '').trim();
        const locationLooksLikeRestaurant = locationCandidate
            ? findRestaurantInText(locationCandidate)
            : null;
        const canPromoteRestaurantSelection =
            runtimeIntent === 'find_nearby'
            && !!transcriptText
            && (!args?.location || !!locationLooksLikeRestaurant)
            && !hasGeoArgs;
        const transcriptRestaurantMatch = canPromoteRestaurantSelection
            ? (findRestaurantInText(transcriptText) || locationLooksLikeRestaurant)
            : null;
        if (transcriptRestaurantMatch) {
            runtimeIntent = 'select_restaurant';
            runtimeDomain = getIntentDomain(runtimeIntent);
            entities.restaurant = entities.restaurant || transcriptRestaurantMatch.name || null;
            entities.restaurantId = entities.restaurantId || transcriptRestaurantMatch.id || null;
            trace.push(`live_find_promoted:select_restaurant:${transcriptRestaurantMatch.id || 'unknown'}`);
            if (locationLooksLikeRestaurant) {
                entities.location = null;
                trace.push('live_find_location_rejected:restaurant_alias');
            }
        }

        // GPS-first guard for live discovery:
        // if we already have coordinates, drop noisy/hallucinated location payloads
        // that would incorrectly force CITY mode in findHandler.
        if (runtimeIntent === 'find_nearby' && hasGeoArgs) {
            const locationToCheck = String(entities?.location || args?.location || '').trim();
            const shouldDropLocation = shouldDropLocationForGps({
                locationCandidate: locationToCheck,
                cuisineCandidate: entities?.cuisine || args?.cuisine || '',
                transcriptText,
                locationLooksLikeRestaurant: !!locationLooksLikeRestaurant,
            });

            if (shouldDropLocation) {
                entities.location = null;
                if (Object.prototype.hasOwnProperty.call(args, 'location')) delete args.location;
                trace.push('live_find_location_dropped_for_gps');

                if (!textCameFromTranscript) {
                    if (entities.cuisine) {
                        mapped.text = `szukam ${entities.cuisine}`;
                    } else {
                        mapped.text = 'gdzie zamowic';
                    }
                }
            }
        }

        let sessionSnapshot = this.getSession(sessionId) || {};
        if (runtimeIntent === 'find_nearby' && entities?.location) {
            const rawLocation = entities.location;
            const sanitizedLocation = sanitizeLocation(rawLocation, sessionSnapshot);
            if (sanitizedLocation !== rawLocation) {
                entities.location = sanitizedLocation || null;
                trace.push(`live_find_location_sanitized:${sanitizedLocation || 'null'}`);

                // Keep fallback text aligned with sanitized entities when transcript is missing.
                if (!textCameFromTranscript) {
                    if (entities.location && entities.cuisine) {
                        mapped.text = `szukam ${entities.cuisine} w ${entities.location}`;
                    } else if (entities.location) {
                        mapped.text = `pokaz restauracje w ${entities.location}`;
                    } else if (entities.cuisine) {
                        mapped.text = `szukam ${entities.cuisine}`;
                    } else {
                        mapped.text = 'gdzie zamowic';
                    }
                }
            }
        }
        const stateCheck = checkRequiredState(runtimeIntent, sessionSnapshot, entities);

        trace.push(`icm_required_state:${stateCheck.met ? 'ok' : 'fail'}`);

        if (!stateCheck.met) {
            const fallbackIntent = getFallbackIntent(runtimeIntent);
            if (fallbackIntent) {
                runtimeIntent = fallbackIntent;
                runtimeDomain = getIntentDomain(runtimeIntent);
                trace.push(`icm_fallback_intent:${fallbackIntent}`);
            } else {
                // Fix #5: confirm_order with null fallback Ă˘â‚¬â€ť never redirect to find_nearby,
                // give a cart-aware message instead.
                if (runtimeIntent === 'confirm_order') {
                    const snap = this.getSession(sessionId) || {};
                    const cart = snap.cart || { items: [] };
                    const isEmpty = !Array.isArray(cart.items) || cart.items.length === 0;
                    const reply = isEmpty
                        ? 'Koszyk jest pusty. Najpierw dodaj coÄąâ€ş do zamÄ‚Ĺ‚wienia.'
                        : 'ProszĂ„â„˘ najpierw potwierdÄąĹź pozycje w koszyku, zanim zÄąâ€šoÄąÄ˝ysz zamÄ‚Ĺ‚wienie.';
                    trace.push('confirm_order:blocked:no_fallback');
                    const clarify = buildClarifyResponse(sessionId, 'confirm_order_failed', 'state_requirements_not_met', trace);
                    clarify.reply = reply;
                    clarify.text = reply;
                    return {
                        ok: true,
                        tool: toolName,
                        request_id: requestId,
                        response: clarify,
                        trace,
                    };
                }
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
                    nearbyCue: runtimeIntent === 'find_nearby' ? hasNearbyCue(transcriptText) : false,
                },
                ...(mapped.coords || {}),
            },
            domain: runtimeDomain,
            intent: runtimeIntent,
            source: `live_tool:${toolName}`,
            session: sessionSnapshot,
            meta: {
                requestId,
                turnId,
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

        const preCart = (sessionSnapshot && sessionSnapshot.cart) || {};
        const preCartItemCount = Array.isArray(preCart.items) ? preCart.items.length : 0;
        const preCartTotal = preCart.total ?? 0;
        context.meta.preCartItemCount = preCartItemCount;
        context.meta.preCartTotal = preCartTotal;
        console.log(`[CART_GUARD] preCount=${preCartItemCount}`);
        console.log(`[CART_GUARD] preTotal=${preCartTotal}`);

        const domainResponse = await HandlerDispatcher.executeTransactional({
            handler,
            context,
            applyContextUpdates,
        });

        sessionSnapshot = this.getSession(sessionId) || context.session || {};
        const postCart = (sessionSnapshot && sessionSnapshot.cart) || {};
        const postCartItemCount = Array.isArray(postCart.items) ? postCart.items.length : 0;
        const postCartTotal = postCart.total ?? 0;
        const cartChanged = postCartItemCount !== preCartItemCount || postCartTotal !== preCartTotal;
        const cartMutationPath = runtimeIntent === 'create_order' || mutatesCart(runtimeIntent);
        const isClarifyOrderResponse =
            String(domainResponse?.intent || '').toLowerCase() === 'clarify_order'
            || Boolean(domainResponse?.meta?.clarify);
        const responseSuggestsSuccess = domainResponse?.ok !== false && !isClarifyOrderResponse;
        const successDowngraded = cartMutationPath && responseSuggestsSuccess && !cartChanged;

        console.log(`[CART_GUARD] postCount=${postCartItemCount}`);
        console.log(`[CART_GUARD] postTotal=${postCartTotal}`);
        console.log(`[CART_GUARD] cartChanged=${cartChanged}`);
        console.log(`[CART_GUARD] successDowngraded=${successDowngraded}`);

        let guardedDomainResponse = domainResponse || { reply: '', intent: runtimeIntent };
        if (successDowngraded) {
            const guardedReply = 'Nie widze zmiany w koszyku. Powtorz prosze dodanie pozycji albo popros o pokazanie koszyka.';
            guardedDomainResponse = {
                ...guardedDomainResponse,
                ok: false,
                reply: guardedReply,
                text: guardedReply,
                should_reply: true,
                meta: {
                    ...(guardedDomainResponse.meta || {}),
                    cart_guard: 'mutation_not_observed',
                },
            };
            context.trace.push('cart_guard:success_downgraded');
        }

        const preOrderMode = sessionSnapshot?.orderMode || ORDER_MODE_STATE.NEUTRAL;
        const orderModeEvent = getOrderModeEvent(runtimeIntent, preOrderMode, guardedDomainResponse);
        const orderModeResult = transitionOrderMode(preOrderMode, orderModeEvent, {
            toolName,
            intent: runtimeIntent,
        });
        if (orderModeResult.changed) {
            this.updateSession(sessionId, { orderMode: orderModeResult.state });
            context.trace.push(`order_mode:${preOrderMode}->${orderModeResult.state}`);
            liveLog.orderModeTrace({ sessionId, toolName, from: preOrderMode, to: orderModeResult.state, fsm_event: orderModeEvent });
        } else {
            context.trace.push(`order_mode:${preOrderMode}(noop)`);
        }

        const speechText = guardedDomainResponse?.reply || '';
        const { response } = ResponseBuilder.build({
            domainResponse: guardedDomainResponse,
            activeSessionId: sessionId,
            speechText,
            speechPartForTTS: speechText,
            audioContent: null,
            intent: guardedDomainResponse?.intent || runtimeIntent,
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
                turnId,
                runtimeIntent,
                runtimeDomain,
                orderMode: orderModeResult.state,
                entitiesResolved: toEntitiesResolved(entities),
                cartBefore: {
                    items: preCartItemCount,
                    total: Number(preCartTotal) || 0,
                },
                cartAfter: {
                    items: postCartItemCount,
                    total: Number(postCartTotal) || 0,
                },
            },
            trace: context.trace,
        };

        const totalLatency = Date.now() - startedAt;
        const finalOk = guardedDomainResponse?.ok !== false;
        liveLog.toolComplete({
            sessionId,
            toolName,
            requestId,
            ok: finalOk,
            latencyMs: totalLatency,
            intent: runtimeIntent,
            orderMode: orderModeResult.state,
        });

        return {
            ok: finalOk,
            tool: toolName,
            request_id: requestId,
            response,
            trace: context.trace,
        };
    }
}


