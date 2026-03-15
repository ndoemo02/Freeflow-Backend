export class MenuHydrationService {
    static async hydrate({
        sessionContext,
        activeSessionId,
        handlers,
        context,
        isShadow,
        updateSession,
        logger,
    }) {
        if (!sessionContext?.currentRestaurant || (sessionContext?.last_menu && sessionContext.last_menu.length > 0)) {
            return;
        }

        logger.pipeline('PRE-NLU LAZY LOAD: last_menu is empty. Running MenuHandler to hydrate sessionContext.');
        const menuHandler = handlers?.food?.menu_request;
        if (!menuHandler) {
            return;
        }

        try {
            if (!sessionContext.lastRestaurant) {
                sessionContext.lastRestaurant = sessionContext.currentRestaurant;
            }

            const handlerResult = await menuHandler.execute(context);
            if (handlerResult?.contextUpdates) {
                Object.assign(sessionContext, handlerResult.contextUpdates);
                if (!isShadow) {
                    updateSession(activeSessionId, handlerResult.contextUpdates);
                }
                logger.pipeline(`PRE-NLU LAZY LOAD: Menu hydrated successfully (${sessionContext.last_menu.length} items).`);
            }
        } catch (err) {
            logger.pipeline(`PRE-NLU LAZY LOAD failed: ${err.message}`);
        }
    }
}
