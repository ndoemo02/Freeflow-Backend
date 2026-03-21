import { describe, it, expect } from 'vitest';
import {
    ORDER_MODE_STATE,
    ORDER_MODE_EVENT,
    transitionOrderMode,
    canTransitionOrderMode,
} from '../core/pipeline/OrderModeFSM.js';

describe('OrderModeFSM', () => {
    it('starts in neutral by default', () => {
        const next = transitionOrderMode(undefined, ORDER_MODE_EVENT.NOOP);
        expect(next.state).toBe(ORDER_MODE_STATE.NEUTRAL);
        expect(next.changed).toBe(false);
    });

    it('transitions neutral -> restaurant_selected on SELECT_RESTAURANT', () => {
        const next = transitionOrderMode(ORDER_MODE_STATE.NEUTRAL, ORDER_MODE_EVENT.SELECT_RESTAURANT);
        expect(next.state).toBe(ORDER_MODE_STATE.RESTAURANT_SELECTED);
        expect(next.changed).toBe(true);
        expect(next.allowed).toBe(true);
    });

    it('transitions restaurant_selected -> building on START_ORDER', () => {
        const next = transitionOrderMode(ORDER_MODE_STATE.RESTAURANT_SELECTED, ORDER_MODE_EVENT.START_ORDER);
        expect(next.state).toBe(ORDER_MODE_STATE.BUILDING);
        expect(next.changed).toBe(true);
    });

    it('keeps building on ADD_ITEM', () => {
        const next = transitionOrderMode(ORDER_MODE_STATE.BUILDING, ORDER_MODE_EVENT.ADD_ITEM);
        expect(next.state).toBe(ORDER_MODE_STATE.BUILDING);
        expect(next.changed).toBe(false);
        expect(next.allowed).toBe(true);
    });

    it('transitions building -> checkout_form on OPEN_CHECKOUT', () => {
        const next = transitionOrderMode(ORDER_MODE_STATE.BUILDING, ORDER_MODE_EVENT.OPEN_CHECKOUT);
        expect(next.state).toBe(ORDER_MODE_STATE.CHECKOUT_FORM);
        expect(next.changed).toBe(true);
        expect(next.allowed).toBe(true);
    });

    it('keeps checkout_form on OPEN_CHECKOUT', () => {
        const next = transitionOrderMode(ORDER_MODE_STATE.CHECKOUT_FORM, ORDER_MODE_EVENT.OPEN_CHECKOUT);
        expect(next.state).toBe(ORDER_MODE_STATE.CHECKOUT_FORM);
        expect(next.changed).toBe(false);
        expect(next.allowed).toBe(true);
    });

    it('transitions building -> awaiting_confirmation on REQUEST_CONFIRM', () => {
        const next = transitionOrderMode(ORDER_MODE_STATE.BUILDING, ORDER_MODE_EVENT.REQUEST_CONFIRM);
        expect(next.state).toBe(ORDER_MODE_STATE.AWAITING_CONFIRMATION);
        expect(next.changed).toBe(true);
    });

    it('transitions awaiting_confirmation -> completed on CONFIRM_ORDER', () => {
        const next = transitionOrderMode(ORDER_MODE_STATE.AWAITING_CONFIRMATION, ORDER_MODE_EVENT.CONFIRM_ORDER);
        expect(next.state).toBe(ORDER_MODE_STATE.COMPLETED);
        expect(next.changed).toBe(true);
    });

    it('transitions awaiting_confirmation -> building on REJECT_CONFIRMATION', () => {
        const next = transitionOrderMode(ORDER_MODE_STATE.AWAITING_CONFIRMATION, ORDER_MODE_EVENT.REJECT_CONFIRMATION);
        expect(next.state).toBe(ORDER_MODE_STATE.BUILDING);
        expect(next.changed).toBe(true);
    });

    it('transitions building -> cancelled on CANCEL_ORDER', () => {
        const next = transitionOrderMode(ORDER_MODE_STATE.BUILDING, ORDER_MODE_EVENT.CANCEL_ORDER);
        expect(next.state).toBe(ORDER_MODE_STATE.CANCELLED);
        expect(next.changed).toBe(true);
    });

    it('blocks invalid transitions and keeps current state', () => {
        const next = transitionOrderMode(ORDER_MODE_STATE.NEUTRAL, ORDER_MODE_EVENT.CONFIRM_ORDER);
        expect(next.state).toBe(ORDER_MODE_STATE.NEUTRAL);
        expect(next.changed).toBe(false);
        expect(next.allowed).toBe(false);
    });

    it('supports RESET_TO_NEUTRAL from any state', () => {
        const states = Object.values(ORDER_MODE_STATE);
        for (const state of states) {
            const next = transitionOrderMode(state, ORDER_MODE_EVENT.RESET_TO_NEUTRAL);
            expect(next.state).toBe(ORDER_MODE_STATE.NEUTRAL);
            expect(next.allowed).toBe(true);
        }
    });

    it('is pure and does not mutate context input', () => {
        const ctx = { reason: 'manual_test', nested: { key: 'v' } };
        const before = JSON.stringify(ctx);
        const next = transitionOrderMode(ORDER_MODE_STATE.BUILDING, ORDER_MODE_EVENT.ADD_ITEM, ctx);

        expect(next.meta.context).toEqual(ctx);
        expect(JSON.stringify(ctx)).toBe(before);
    });

    it('canTransitionOrderMode mirrors transition allowance', () => {
        expect(canTransitionOrderMode(ORDER_MODE_STATE.BUILDING, ORDER_MODE_EVENT.REQUEST_CONFIRM)).toBe(true);
        expect(canTransitionOrderMode(ORDER_MODE_STATE.NEUTRAL, ORDER_MODE_EVENT.CONFIRM_ORDER)).toBe(false);
    });
});
