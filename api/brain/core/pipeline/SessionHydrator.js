export class SessionHydrator {
    static hydrate({
        sessionId,
        activeSessionId,
        isShadow,
        getOrCreateActiveSession,
        logger,
    }) {
        const sessionResult = getOrCreateActiveSession(sessionId);
        const nextActiveSessionId = sessionResult.sessionId;
        const session = sessionResult.session;

        if (sessionResult.isNew && sessionId !== nextActiveSessionId) {
            logger.pipeline(`NEW CONVERSATION: ${sessionId} was closed, using ${nextActiveSessionId}`);
        }

        const sessionContext = isShadow ? JSON.parse(JSON.stringify(session || {})) : session;

        return {
            sessionResult,
            activeSessionId: nextActiveSessionId || activeSessionId,
            session,
            sessionContext,
        };
    }
}
