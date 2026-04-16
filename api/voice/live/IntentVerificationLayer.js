/**
 * IntentVerificationLayer.js
 * ═══════════════════════════════════════════════════════════════════════════
 * State Machine Verifier dla live pipeline FreeFlow.
 * Dziala miedzy ToolValidator (pre) a ToolRouter.executeToolCall (main).
 *
 * Filozofia:
 *   Gemini Live dostaje audio chunks (nie STT) — transcript jest niedostepny
 *   lub czesciowy w momencie tool call. Dlatego IVL NIE opiera sie na
 *   analizie transkryptu, tylko na twardej weryfikacji:
 *     - session state vs tool requirements
 *     - args coherence vs session data
 *     - allowed transitions (FSM)
 *     - rapid-fire duplicate protection
 *     - escalation detection (skip-state jumps)
 *
 * Zasady:
 *   - Czyste funkcje, zero side effects, zero DB/LLM.
 *   - Jezyk trace: angielski (maszynowy). Komunikaty user-facing: polski.
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ─── constants ─────────────────────────────────────────────────────────────

const RAPID_FIRE_DEFAULT_MS = 1500;
const RAPID_FIRE_PER_TOOL_MS = Object.freeze({
    // Discovery tends to be retried by live models; allow a wider duplicate window.
    find_nearby: 3000,
});

function getRapidFireWindowMs(toolName) {
    return RAPID_FIRE_PER_TOOL_MS[toolName] || RAPID_FIRE_DEFAULT_MS;
}

/**
 * Mapowanie tool → intent (musi byc zsynchronizowane z ToolRouter.TOOL_TO_INTENT).
 * Trzymamy lokalna kopie zeby IVL nie importowal z ToolRouter (circular).
 */
const TOOL_INTENT = Object.freeze({
    find_nearby:        'find_nearby',
    select_restaurant:  'select_restaurant',
    show_menu:          'menu_request',
    show_more_options:  'show_more_options',
    add_item_to_cart:   'create_order',
    add_items_to_cart:  'create_order',
    update_cart_item_quantity: 'create_order',
    remove_item_from_cart: 'create_order',
    replace_cart_item: 'create_order',
    confirm_add_to_cart:'confirm_add_to_cart',
    open_checkout:      'open_checkout',
    confirm_order:      'confirm_order',
    cancel_order:       'cancel_order',
    get_cart_state:     'get_cart_state',
});

/**
 * Dozwolone przejscia orderMode → tool.
 * Klucz = orderMode state, wartosc = Set dozwolonych toolNames.
 * Jesli tool NIE jest na liscie → obnizona confidence (ale nie hard block,
 * bo ToolRouter ma wlasne guardy ktore i tak zlapia).
 */
const ALLOWED_TOOLS_BY_ORDER_MODE = Object.freeze({
    neutral: new Set([
        'find_nearby', 'select_restaurant', 'show_menu', 'show_more_options',
        'update_cart_item_quantity', 'remove_item_from_cart', 'replace_cart_item',
        'get_cart_state', 'cancel_order',
    ]),
    restaurant_selected: new Set([
        'find_nearby', 'select_restaurant', 'show_menu', 'show_more_options',
        'add_item_to_cart', 'add_items_to_cart', 'confirm_add_to_cart',
        'update_cart_item_quantity', 'remove_item_from_cart', 'replace_cart_item',
        'get_cart_state', 'cancel_order',
    ]),
    building: new Set([
        'add_item_to_cart', 'add_items_to_cart', 'confirm_add_to_cart',
        'update_cart_item_quantity', 'remove_item_from_cart', 'replace_cart_item',
        'open_checkout', 'confirm_order', 'cancel_order',
        'get_cart_state', 'show_menu',
    ]),
    checkout_form: new Set([
        'confirm_order', 'cancel_order', 'add_item_to_cart', 'add_items_to_cart',
        'update_cart_item_quantity', 'remove_item_from_cart', 'replace_cart_item',
        'get_cart_state', 'open_checkout',
    ]),
    awaiting_confirmation: new Set([
        'confirm_order', 'cancel_order', 'get_cart_state',
    ]),
    completed: new Set([
        'find_nearby', 'select_restaurant', 'show_menu', 'show_more_options',
        'get_cart_state',
    ]),
    cancelled: new Set([
        'find_nearby', 'select_restaurant', 'show_menu', 'show_more_options',
        'get_cart_state',
    ]),
});

/**
 * Narzedzia ktore oznaczaja "skok o wiecej niz 1 krok" w FSM.
 * np. z neutral prosto do confirm_order (skip discovery+selection+menu+order).
 * Escalation = hard reject.
 */
const ESCALATION_MAP = Object.freeze({
    neutral: new Set(['confirm_order', 'open_checkout']),
    restaurant_selected: new Set(['confirm_order']),
});

// ─── helpers ────────────────────────────────────────────────────────────────

function normalize(text) {
    if (!text || typeof text !== 'string') return '';
    return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function restaurantIdInList(restaurantId, list) {
    if (!restaurantId || !Array.isArray(list) || list.length === 0) return false;
    return list.some(
        (r) => String(r?.id || r?.restaurant_id || '') === String(restaurantId),
    );
}

function restaurantNameFuzzyMatch(name, list) {
    if (!name || !Array.isArray(list) || list.length === 0) return false;
    const norm = normalize(name);
    return list.some((r) => {
        const rName = normalize(r?.name || r?.restaurant_name || '');
        if (!rName) return false;
        if (rName.includes(norm) || norm.includes(rName)) return true;
        // 4-char stem match
        const stem = norm.substring(0, 4);
        return stem.length >= 3 && rName.startsWith(stem);
    });
}

function dishInMenu(dishName, menu) {
    if (!dishName || !Array.isArray(menu) || menu.length === 0) return false;
    const norm = normalize(dishName);
    return menu.some((item) => {
        const n = normalize(item?.name || item?.dish || '');
        return n.length > 0 && (n.includes(norm) || norm.includes(n));
    });
}

// ─── main ───────────────────────────────────────────────────────────────────

/**
 * Weryfikuje tool call wzgledem session state, args i FSM transitions.
 *
 * @param {object} params
 * @param {string}  params.toolName                — nazwa narzedzia
 * @param {object}  [params.args]                  — argumenty wywolania
 * @param {object}  [params.session]               — snapshot sesji
 * @param {number}  [params.lastToolCallTimestamp]  — timestamp poprzedniego wywolania tego toola
 * @param {string}  [params.lastToolCallArgsKey]    — JSON.stringify(args) poprzedniego wywolania
 *
 * @returns {{
 *   verified: boolean,
 *   confidence: number,
 *   adjustedTool?: string,
 *   adjustedArgs?: object,
 *   reason?: string,
 *   trace: string[]
 * }}
 */
export function verifyToolCall({ toolName, args = {}, session, lastToolCallTimestamp, lastToolCallArgsKey } = {}) {
    const trace = [];
    let confidence = 1.0;
    let verified = true;
    let reason;
    let adjustedTool;
    let adjustedArgs;
    const rapidFireMs = getRapidFireWindowMs(toolName);

    // ─── Rule 1: Rapid-fire Protection ──────────────────────────────────
    if (
        typeof lastToolCallTimestamp === 'number' &&
        Number.isFinite(lastToolCallTimestamp) &&
        typeof lastToolCallArgsKey === 'string' &&
        (Date.now() - lastToolCallTimestamp) < rapidFireMs
    ) {
        const currentArgsKey = JSON.stringify(args || {});
        if (currentArgsKey === lastToolCallArgsKey) {
            trace.push(`rapid_fire:duplicate_within_${rapidFireMs}ms`);
            return { verified: false, confidence: 0, reason: 'duplicate_rapid_fire', trace };
        }
        // Rozne args ale szybko — lekkie obnizenie, nie blokada
        confidence -= 0.1;
        trace.push('rapid_fire:different_args:minor_penalty');
    }

    // ─── Rule 2: OrderMode FSM Transition Check ─────────────────────────
    const orderMode = session?.orderMode || 'neutral';
    const allowedSet = ALLOWED_TOOLS_BY_ORDER_MODE[orderMode];

    if (allowedSet && !allowedSet.has(toolName)) {
        // Sprawdz czy to escalation (hard reject) czy soft violation
        const escalationSet = ESCALATION_MAP[orderMode];
        if (escalationSet && escalationSet.has(toolName)) {
            trace.push(`fsm_escalation:${orderMode}→${toolName}`);
            return {
                verified: false,
                confidence: 0,
                reason: 'fsm_escalation_blocked',
                trace,
            };
        }
        // Soft: tool niedozwolony w tym stanie, ale nie escalation
        confidence -= 0.35;
        trace.push(`fsm_transition_warn:${orderMode}:tool_${toolName}_not_expected`);
    } else {
        trace.push(`fsm_transition_ok:${orderMode}:${toolName}`);
    }

    // ─── Rule 3: Args-Session State Coherence ───────────────────────────
    const lastList = Array.isArray(session?.last_restaurants_list)
        ? session.last_restaurants_list
        : [];

    // 3a: select_restaurant — restaurant must exist in session list
    if (toolName === 'select_restaurant') {
        const { restaurant_id, restaurant_name } = args || {};

        if (restaurant_id) {
            if (lastList.length > 0 && !restaurantIdInList(restaurant_id, lastList)) {
                trace.push(`args_mismatch:restaurant_id_not_in_list:${restaurant_id}`);
                return {
                    verified: false,
                    confidence: 0,
                    reason: 'restaurant_id_not_in_session_list',
                    trace,
                };
            }
            trace.push('args_ok:restaurant_id_in_list');
        } else if (restaurant_name) {
            if (lastList.length > 0 && !restaurantNameFuzzyMatch(restaurant_name, lastList)) {
                trace.push(`args_downgrade:restaurant_name_no_match:${restaurant_name}`);
                adjustedTool = 'find_nearby';
                adjustedArgs = { cuisine: restaurant_name };
                confidence = Math.min(confidence, 0.45);
                reason = 'restaurant_name_not_matched:downgraded_to_find_nearby';
            } else {
                trace.push('args_ok:restaurant_name_matched');
            }
        } else {
            // Brak ID i nazwy — nie ma czego wybrac
            trace.push('args_warn:select_restaurant_no_identifier');
            confidence -= 0.15;
        }
    }

    // 3b: confirm_order — pendingOrder + expectedContext must exist
    if (toolName === 'confirm_order') {
        const hasPending = !!(session?.pendingOrder);
        const isExpected = session?.expectedContext === 'confirm_order';

        if (!hasPending || !isExpected) {
            const missing = [];
            if (!hasPending) missing.push('no_pendingOrder');
            if (!isExpected) missing.push(`expectedContext=${session?.expectedContext || 'null'}`);
            trace.push(`args_mismatch:confirm_order:${missing.join(',')}`);
            return {
                verified: false,
                confidence: 0,
                reason: 'confirm_order_state_missing',
                trace,
            };
        }
        trace.push('args_ok:confirm_order_state_present');
    }

    // 3c: add_item — dish should exist in lastMenu (soft check)
    if ((toolName === 'add_item_to_cart' || toolName === 'add_items_to_cart') && session?.lastMenu) {
        const menu = Array.isArray(session.lastMenu) ? session.lastMenu : [];
        if (menu.length > 0) {
            const dishes = toolName === 'add_item_to_cart'
                ? [args?.dish].filter(Boolean)
                : (Array.isArray(args?.items) ? args.items.map((i) => i?.dish).filter(Boolean) : []);

            const allFound = dishes.length > 0 && dishes.every((d) => dishInMenu(d, menu));
            const someFound = dishes.length > 0 && dishes.some((d) => dishInMenu(d, menu));

            if (dishes.length === 0) {
                trace.push('args_warn:add_item_no_dish_provided');
                confidence -= 0.1;
            } else if (!someFound) {
                trace.push(`args_warn:dish_not_in_menu:${dishes.join(',')}`);
                confidence -= 0.2;
            } else if (!allFound) {
                trace.push(`args_warn:some_dishes_not_in_menu:${dishes.join(',')}`);
                confidence -= 0.1;
            } else {
                trace.push('args_ok:dish_in_menu');
            }
        }
    }

    // 3d: add_item/create_order — must have restaurant context.
    // restaurant_name or restaurant_id in args counts as explicit context (P1 fix:
    // do not warn when Gemini provides restaurant_name even without session restaurant).
    if (
        (toolName === 'add_item_to_cart' || toolName === 'add_items_to_cart') &&
        !session?.currentRestaurant && !session?.lastRestaurant &&
        !args?.restaurant_name && !args?.restaurant_id
    ) {
        trace.push('args_warn:add_item_no_restaurant_context');
        confidence -= 0.25;
    }

    // 3e: show_menu — must have restaurant context
    if (toolName === 'show_menu' && !session?.currentRestaurant && !args?.restaurant_id) {
        trace.push('args_warn:show_menu_no_restaurant');
        confidence -= 0.2;
    }

    // ─── Rule 4: Cart Sanity ────────────────────────────────────────────
    // confirm_order z pustym koszykiem+pustym pendingOrder
    if (toolName === 'confirm_order') {
        const cart = session?.cart;
        const pending = session?.pendingOrder;
        const cartEmpty = !cart || !Array.isArray(cart.items) || cart.items.length === 0;
        const pendingEmpty = !pending || (Array.isArray(pending.items) && pending.items.length === 0);
        if (cartEmpty && pendingEmpty) {
            trace.push('cart_sanity:confirm_with_empty_cart_and_pending');
            confidence -= 0.3;
        }
    }

    // open_checkout z pustym koszykiem
    if (toolName === 'open_checkout') {
        const cart = session?.cart;
        const cartEmpty = !cart || !Array.isArray(cart.items) || cart.items.length === 0;
        const hasPending = !!(session?.pendingOrder);
        if (cartEmpty && !hasPending) {
            trace.push('cart_sanity:checkout_with_empty_cart');
            confidence -= 0.3;
        }
    }

    // ─── Rule 5: Sequence Coherence ─────────────────────────────────────
    // Jesli last intent = find_nearby a teraz confirm_order (bez select/menu/order w miedzyczasie)
    const lastIntent = session?.lastIntent;
    if (lastIntent && toolName === 'confirm_order' && lastIntent === 'find_nearby') {
        trace.push('sequence_warn:confirm_order_directly_after_find_nearby');
        confidence -= 0.3;
    }
    // select_restaurant bez wczesniejszego find_nearby (i brak listy)
    if (toolName === 'select_restaurant' && lastList.length === 0 && !args?.restaurant_id) {
        trace.push('sequence_warn:select_without_prior_discovery');
        confidence -= 0.2;
    }

    // ─── Finalize ───────────────────────────────────────────────────────
    confidence = Math.round(Math.max(0, Math.min(1, confidence)) * 100) / 100;

    if (confidence < 0.4) {
        verified = false;
        if (!reason) reason = 'low_confidence';
        trace.push(`final:rejected:confidence=${confidence}`);
    } else {
        trace.push(`final:ok:confidence=${confidence}`);
    }

    const result = { verified, confidence, trace };
    if (reason) result.reason = reason;
    if (adjustedTool) result.adjustedTool = adjustedTool;
    if (adjustedArgs) result.adjustedArgs = adjustedArgs;

    return result;
}
