// Process-local serialization shared by WS, credential initialization and HTTP
// fallback. This is not a distributed lock across serverless workers.
const pending = new Map();

export function runLiveSessionOperation(sessionId, operation) {
    const previous = pending.get(sessionId) || Promise.resolve();
    const current = previous.catch(() => undefined).then(operation).finally(() => {
        if (pending.get(sessionId) === current) pending.delete(sessionId);
    });
    pending.set(sessionId, current);
    return current;
}
