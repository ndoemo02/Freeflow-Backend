import { updateSessionDurable, persistSessionDurable } from '../../brain/session/sessionStore.js';
import { buildDemoSessionPatch, DEMO_SCENARIOS, resolveDemoContext } from '../../demo/demoContext.js';
import { recordLiveCartAudit, auditCartSnapshot } from './liveCartAudit.js';
import { requireSessionAccess, sessionAccessError } from '../../brain/session/sessionAccess.js';

function boundaryError(code, statusCode, cause) {
    return Object.assign(new Error(code, { cause }), { code, statusCode });
}

function validatedContext(context) {
    try {
        if (!context || typeof context !== 'object' || Array.isArray(context)) {
            throw new TypeError('Demo context must be an object');
        }
        return resolveDemoContext(context);
    } catch (cause) {
        throw boundaryError('invalid_demo_context', 400, cause);
    }
}

function suppliedContext(body = {}) {
    for (const container of [body, body?.meta]) {
        for (const key of ['demo_context', 'demoContext']) {
            if (container && Object.hasOwn(container, key)) return { present: true, value: container[key] };
        }
    }
    return { present: false };
}

function persistedContext(session) {
    const datasetScenario = Object.values(DEMO_SCENARIOS).find(scenario => scenario.datasetId === session.demoDatasetId);
    if (session.demoDatasetId && !datasetScenario) throw new Error('invalid_persisted_demo_dataset');
    const resolved = validatedContext(session.demoContext || {
        scenarioId: session.demoScenarioId || datasetScenario?.id,
        preferredLocale: session.preferredLocale,
        source: session.demoScenarioId || datasetScenario ? 'persisted' : 'default',
    });
    if ((session.demoScenarioId && session.demoScenarioId !== resolved.scenarioId)
        || (session.demoDatasetId && session.demoDatasetId !== resolved.datasetId)) {
        throw new Error('inconsistent_persisted_demo_context');
    }
    return resolved;
}

/** All Live transports hydrate and persist scope before minting credentials or executing tools. */
export async function prepareLiveSession(sessionId, body = {}, req) {
    const supplied = suppliedContext(body);
    // Invalid client input must not even cause a persistence read/write.
    if (supplied.present) validatedContext(supplied.value);
    if (req) await requireSessionAccess(req, sessionId);
    try {
        return await updateSessionDurable(sessionId, session => {
            const previous = persistedContext(session);
            const input = supplied.value || {};
            const resolved = validatedContext({
                scenarioId: input.scenarioId ?? input.scenario_id ?? previous.scenarioId,
                preferredLocale: input.preferredLocale ?? input.preferred_locale ?? previous.preferredLocale,
                source: input.source ?? previous.source,
            });
            return buildDemoSessionPatch(resolved);
        });
    } catch (cause) {
        // Invalid persisted state is an unavailable session, not client input.
        throw boundaryError('live_session_unavailable', 503, cause);
    }
}

export async function persistLiveSession(sessionId) {
    try {
        const saved = await persistSessionDurable(sessionId);
        recordLiveCartAudit(sessionId, 'durable_cart_saved', { cart: auditCartSnapshot(saved?.cart) });
        return saved;
    } catch (cause) {
        recordLiveCartAudit(sessionId, 'durable_cart_failed', { error: 'live_session_unavailable' });
        throw boundaryError('live_session_unavailable', 503, cause);
    }
}

export function liveSessionErrorResponse(error) {
    const accessError = sessionAccessError(error);
    if (accessError) return accessError;
    if (!['invalid_demo_context', 'live_session_unavailable'].includes(error?.code)) return null;
    return { status: error.statusCode, body: { ok: false, error: error.code } };
}
