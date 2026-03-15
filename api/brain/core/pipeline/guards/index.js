function runNamedGuard(name, intentContext, pipelineState) {
    const guard = pipelineState?.guardImplementations?.[name];
    if (typeof guard !== 'function') return intentContext;

    const nextIntentContext = guard(intentContext, pipelineState);
    if (!nextIntentContext) return intentContext;
    return nextIntentContext;
}

export function preNluOverrideGuard(intentContext, pipelineState) {
    return runNamedGuard('preNluOverrideGuard', intentContext, pipelineState);
}

export function transactionLockGuard(intentContext, pipelineState) {
    return runNamedGuard('transactionLockGuard', intentContext, pipelineState);
}

export function orderingAffirmationGuard(intentContext, pipelineState) {
    return runNamedGuard('orderingAffirmationGuard', intentContext, pipelineState);
}

export function escapeOverrideGuard(intentContext, pipelineState) {
    return runNamedGuard('escapeOverrideGuard', intentContext, pipelineState);
}

export function expectedContextGuard(intentContext, pipelineState) {
    return runNamedGuard('expectedContextGuard', intentContext, pipelineState);
}

export function confidenceFloorGuard(intentContext, pipelineState) {
    return runNamedGuard('confidenceFloorGuard', intentContext, pipelineState);
}

export function smartUnlockGuard(intentContext, pipelineState) {
    return runNamedGuard('smartUnlockGuard', intentContext, pipelineState);
}

export function continuityGuard(intentContext, pipelineState) {
    return runNamedGuard('continuityGuard', intentContext, pipelineState);
}

export function strongContinuityGuard(intentContext, pipelineState) {
    return runNamedGuard('strongContinuityGuard', intentContext, pipelineState);
}

export function floatingOrderCleanupGuard(intentContext, pipelineState) {
    return runNamedGuard('floatingOrderCleanupGuard', intentContext, pipelineState);
}

export function cartMutationGuard(intentContext, pipelineState) {
    return runNamedGuard('cartMutationGuard', intentContext, pipelineState);
}

export function uxGuard1(intentContext, pipelineState) {
    return runNamedGuard('uxGuard1', intentContext, pipelineState);
}

export function uxGuard2(intentContext, pipelineState) {
    return runNamedGuard('uxGuard2', intentContext, pipelineState);
}

export function confirmGuard(intentContext, pipelineState) {
    return runNamedGuard('confirmGuard', intentContext, pipelineState);
}

export const GUARD_CHAIN = [
    preNluOverrideGuard,
    transactionLockGuard,
    orderingAffirmationGuard,
    escapeOverrideGuard,
    expectedContextGuard,
    confidenceFloorGuard,
    smartUnlockGuard,
    continuityGuard,
    strongContinuityGuard,
    floatingOrderCleanupGuard,
    cartMutationGuard,
    uxGuard1,
    uxGuard2,
    confirmGuard,
];
