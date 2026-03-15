export class HandlerDispatcher {
    static resolve({ handlers, context }) {
        const domainHandlers = handlers[context.domain] || {};
        const handler = domainHandlers[context.intent] || handlers.system.fallback;

        return {
            domainHandlers,
            handler,
        };
    }

    static async execute({ handler, context }) {
        return handler.execute(context);
    }

    static async executeTransactional({ handler, context, applyContextUpdates }) {
        const result = await handler.execute(context);

        if (result?.contextUpdates && typeof applyContextUpdates === 'function') {
            applyContextUpdates(result.contextUpdates);
        }

        return result;
    }
}
