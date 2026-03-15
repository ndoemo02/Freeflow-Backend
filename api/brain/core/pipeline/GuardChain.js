export function runGuardChain(guards, state) {
    for (const guard of guards) {
        state.intent = guard({
            intent: state.intent,
            session: state.session,
            entities: state.entities,
            state,
        });

        if (state.stopChain) {
            break;
        }
    }

    return state;
}
