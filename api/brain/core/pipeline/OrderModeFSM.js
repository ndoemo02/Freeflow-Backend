/**
 * OrderModeFSM
 * Pure state machine for ordering lifecycle.
 * No side effects, no session mutation, no pipeline coupling.
 */

export const ORDER_MODE_STATE = Object.freeze({
    NEUTRAL: 'neutral',
    RESTAURANT_SELECTED: 'restaurant_selected',
    BUILDING: 'building',
    AWAITING_CONFIRMATION: 'awaiting_confirmation',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
});

export const ORDER_MODE_EVENT = Object.freeze({
    NOOP: 'NOOP',
    SELECT_RESTAURANT: 'SELECT_RESTAURANT',
    START_ORDER: 'START_ORDER',
    ADD_ITEM: 'ADD_ITEM',
    REQUEST_CONFIRM: 'REQUEST_CONFIRM',
    CONFIRM_ORDER: 'CONFIRM_ORDER',
    REJECT_CONFIRMATION: 'REJECT_CONFIRMATION',
    CANCEL_ORDER: 'CANCEL_ORDER',
    RESET_TO_NEUTRAL: 'RESET_TO_NEUTRAL',
});

const DEFAULT_STATE = ORDER_MODE_STATE.NEUTRAL;

const TRANSITIONS = Object.freeze({
    [ORDER_MODE_STATE.NEUTRAL]: Object.freeze({
        [ORDER_MODE_EVENT.NOOP]: ORDER_MODE_STATE.NEUTRAL,
        [ORDER_MODE_EVENT.SELECT_RESTAURANT]: ORDER_MODE_STATE.RESTAURANT_SELECTED,
        [ORDER_MODE_EVENT.START_ORDER]: ORDER_MODE_STATE.BUILDING,
        [ORDER_MODE_EVENT.RESET_TO_NEUTRAL]: ORDER_MODE_STATE.NEUTRAL,
    }),
    [ORDER_MODE_STATE.RESTAURANT_SELECTED]: Object.freeze({
        [ORDER_MODE_EVENT.NOOP]: ORDER_MODE_STATE.RESTAURANT_SELECTED,
        [ORDER_MODE_EVENT.SELECT_RESTAURANT]: ORDER_MODE_STATE.RESTAURANT_SELECTED,
        [ORDER_MODE_EVENT.START_ORDER]: ORDER_MODE_STATE.BUILDING,
        [ORDER_MODE_EVENT.CANCEL_ORDER]: ORDER_MODE_STATE.CANCELLED,
        [ORDER_MODE_EVENT.RESET_TO_NEUTRAL]: ORDER_MODE_STATE.NEUTRAL,
    }),
    [ORDER_MODE_STATE.BUILDING]: Object.freeze({
        [ORDER_MODE_EVENT.NOOP]: ORDER_MODE_STATE.BUILDING,
        [ORDER_MODE_EVENT.ADD_ITEM]: ORDER_MODE_STATE.BUILDING,
        [ORDER_MODE_EVENT.REQUEST_CONFIRM]: ORDER_MODE_STATE.AWAITING_CONFIRMATION,
        [ORDER_MODE_EVENT.CANCEL_ORDER]: ORDER_MODE_STATE.CANCELLED,
        [ORDER_MODE_EVENT.RESET_TO_NEUTRAL]: ORDER_MODE_STATE.NEUTRAL,
    }),
    [ORDER_MODE_STATE.AWAITING_CONFIRMATION]: Object.freeze({
        [ORDER_MODE_EVENT.NOOP]: ORDER_MODE_STATE.AWAITING_CONFIRMATION,
        [ORDER_MODE_EVENT.CONFIRM_ORDER]: ORDER_MODE_STATE.COMPLETED,
        [ORDER_MODE_EVENT.REJECT_CONFIRMATION]: ORDER_MODE_STATE.BUILDING,
        [ORDER_MODE_EVENT.CANCEL_ORDER]: ORDER_MODE_STATE.CANCELLED,
        [ORDER_MODE_EVENT.RESET_TO_NEUTRAL]: ORDER_MODE_STATE.NEUTRAL,
    }),
    [ORDER_MODE_STATE.COMPLETED]: Object.freeze({
        [ORDER_MODE_EVENT.NOOP]: ORDER_MODE_STATE.COMPLETED,
        [ORDER_MODE_EVENT.SELECT_RESTAURANT]: ORDER_MODE_STATE.RESTAURANT_SELECTED,
        [ORDER_MODE_EVENT.START_ORDER]: ORDER_MODE_STATE.BUILDING,
        [ORDER_MODE_EVENT.RESET_TO_NEUTRAL]: ORDER_MODE_STATE.NEUTRAL,
    }),
    [ORDER_MODE_STATE.CANCELLED]: Object.freeze({
        [ORDER_MODE_EVENT.NOOP]: ORDER_MODE_STATE.CANCELLED,
        [ORDER_MODE_EVENT.SELECT_RESTAURANT]: ORDER_MODE_STATE.RESTAURANT_SELECTED,
        [ORDER_MODE_EVENT.START_ORDER]: ORDER_MODE_STATE.BUILDING,
        [ORDER_MODE_EVENT.RESET_TO_NEUTRAL]: ORDER_MODE_STATE.NEUTRAL,
    }),
});

function sanitizeState(state) {
    return Object.values(ORDER_MODE_STATE).includes(state) ? state : DEFAULT_STATE;
}

function resolveTransition(state, event) {
    const current = sanitizeState(state);
    const edges = TRANSITIONS[current] || {};
    if (Object.prototype.hasOwnProperty.call(edges, event)) {
        return { allowed: true, nextState: edges[event] };
    }
    return { allowed: false, nextState: current };
}

export function canTransitionOrderMode(currentState, event) {
    return resolveTransition(currentState, event).allowed;
}

export function transitionOrderMode(currentState, event, context = null) {
    const fromState = sanitizeState(currentState);
    const { allowed, nextState } = resolveTransition(fromState, event);

    return {
        state: nextState,
        previousState: fromState,
        event,
        changed: nextState !== fromState,
        allowed,
        meta: {
            reason: allowed ? 'transition_applied' : 'transition_blocked',
            context,
        },
    };
}

