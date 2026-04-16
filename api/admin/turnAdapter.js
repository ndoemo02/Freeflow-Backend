function safeString(value, fallback = '') {
    if (value == null) return fallback;
    const out = String(value).trim();
    return out || fallback;
}

function toNumberOrNull(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function toIso(value) {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
}

function compactText(value, max = 240) {
    const text = safeString(value);
    if (!text) return '';
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function normalizeEvent(event = {}) {
    return {
        id: event.id ?? null,
        eventType: event.event_type || event.type || 'unknown',
        status: event.event_status || event.status || 'success',
        workflowStep: event.workflow_step || event.step || null,
        payload: event.payload && typeof event.payload === 'object' ? event.payload : {},
        timestamp: toIso(event.created_at || event.timestamp) || new Date().toISOString(),
    };
}

function createTurn(turnId, turnIndex, source, startedAt) {
    return {
        turnId,
        turnIndex,
        source,
        startedAt,
        endedAt: null,
        status: 'ok',
        userInput: {},
        understanding: {
            entitiesResolved: [],
        },
        action: {
            summary: '',
            workflowStep: null,
        },
        tools: [],
        assistant: {},
        stateChange: {},
        raw: {
            eventIds: [],
            payloadsExpandable: [],
        },
    };
}

function pushRaw(turn, event) {
    if (event.id != null) turn.raw.eventIds.push(event.id);
    turn.raw.payloadsExpandable.push({
        event_type: event.eventType,
        status: event.status,
        workflow_step: event.workflowStep,
        timestamp: event.timestamp,
        payload: event.payload,
    });
}

function extractEntitiesResolved(payload = {}) {
    if (Array.isArray(payload.entities_resolved)) {
        return payload.entities_resolved
            .map((item) => ({
                key: safeString(item?.key),
                value: item?.value,
                resolvedLabel: item?.resolvedLabel || item?.label || null,
            }))
            .filter((item) => Boolean(item.key));
    }

    if (payload.entities && typeof payload.entities === 'object' && !Array.isArray(payload.entities)) {
        return Object.entries(payload.entities)
            .filter(([, value]) => value !== null && value !== undefined && value !== '')
            .map(([key, value]) => ({ key, value, resolvedLabel: null }));
    }

    if (Array.isArray(payload.entities)) {
        return payload
            .map((key) => safeString(key))
            .filter(Boolean)
            .map((key) => ({ key, value: null, resolvedLabel: null }));
    }

    return [];
}

function setCartDelta(turn, before, after) {
    if (!before || !after) return;
    const itemsBefore = Number(before.items || 0);
    const itemsAfter = Number(after.items || 0);
    const totalBefore = Number(before.total || 0);
    const totalAfter = Number(after.total || 0);
    turn.stateChange.cartBefore = { items: itemsBefore, total: totalBefore };
    turn.stateChange.cartAfter = { items: itemsAfter, total: totalAfter };
    turn.stateChange.cartDelta = {
        itemsDelta: itemsAfter - itemsBefore,
        totalDelta: Number((totalAfter - totalBefore).toFixed(2)),
    };
}

function upsertTool(turn, payload = {}) {
    const requestId = safeString(payload.request_id || payload.requestId);
    const toolName = safeString(payload.tool_name || payload.tool || payload.name, 'unknown_tool');
    const existing = turn.tools.find((tool) => tool.requestId && tool.requestId === requestId);
    if (existing) return existing;

    const tool = {
        requestId: requestId || null,
        name: toolName,
        args: payload.args_summary || null,
    };
    turn.tools.push(tool);
    return tool;
}

function finalizeActionSummary(turn) {
    if (turn.action.summary) return;
    if (turn.tools.length > 0) {
        turn.action.summary = `Wykonano narzędzie: ${turn.tools[turn.tools.length - 1].name}`;
        return;
    }
    if (turn.understanding.intent) {
        turn.action.summary = `Rozpoznano intencję: ${turn.understanding.intent}`;
        return;
    }
    turn.action.summary = 'Wykonano krok konwersacji';
}

export function buildUnifiedTurns(events = []) {
    const normalizedEvents = (Array.isArray(events) ? events : [])
        .map((event) => normalizeEvent(event))
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    const turns = [];
    const liveTurnMap = new Map();
    let openDetTurn = null;
    let turnCounter = 0;

    const closeOpenDeterministicTurn = (endedAt) => {
        if (!openDetTurn) return;
        openDetTurn.endedAt = endedAt;
        finalizeActionSummary(openDetTurn);
        openDetTurn = null;
    };

    const ensureLiveTurn = (event, sourceTurnId) => {
        const turnId = safeString(sourceTurnId || event.payload?.turn_id || event.payload?.request_id);
        if (turnId && liveTurnMap.has(turnId)) return liveTurnMap.get(turnId);

        const nextTurnId = turnId || `live_turn_${++turnCounter}`;
        const turn = createTurn(nextTurnId, turns.length + 1, 'live', event.timestamp);
        turns.push(turn);
        liveTurnMap.set(nextTurnId, turn);
        return turn;
    };

    for (const event of normalizedEvents) {
        const type = event.eventType;
        const payload = event.payload || {};
        const isLiveEvent = type.startsWith('live_');

        if (isLiveEvent) {
            const turn = ensureLiveTurn(event, payload.turn_id || payload.request_id);
            pushRaw(turn, event);

            if (type === 'live_transcript_final') {
                turn.userInput.text = compactText(payload.text);
                turn.userInput.transcript = compactText(payload.text);
                turn.userInput.locale = safeString(payload.lang) || null;
            }

            if (type === 'live_tool_call') {
                const tool = upsertTool(turn, payload);
                tool.args = payload.args_summary || tool.args || null;
                turn.action.workflowStep = event.workflowStep || turn.action.workflowStep || 'live_tool';
                if (!turn.action.summary && tool.name) {
                    turn.action.summary = `Wywołano narzędzie: ${tool.name}`;
                }
            }

            if (type === 'live_tool_result') {
                const tool = upsertTool(turn, payload);
                tool.ok = payload.ok !== false;
                tool.latencyMs = toNumberOrNull(payload.latency_ms);
                tool.resultSummary = compactText(payload.action_summary || payload.assistant_text || payload.reply);
                turn.understanding.intent = safeString(payload.intent) || turn.understanding.intent || null;
                turn.understanding.entitiesResolved = extractEntitiesResolved(payload);
                turn.action.summary = compactText(payload.action_summary || turn.action.summary);
                turn.assistant.text = compactText(payload.assistant_text || payload.reply || payload.text);
                setCartDelta(turn, payload.cart_before, payload.cart_after);
                turn.status = payload.ok === false ? 'clarify' : 'ok';
                turn.endedAt = event.timestamp;
            }

            if (type === 'live_tool_error' || type === 'live_turn_timeout') {
                const tool = upsertTool(turn, payload);
                tool.ok = false;
                tool.latencyMs = toNumberOrNull(payload.latency_ms);
                tool.error = compactText(payload.error_message || payload.error_code || type);
                turn.status = 'error';
                turn.action.summary = compactText(payload.error_message || payload.error_code || 'Błąd LIVE');
                turn.endedAt = event.timestamp;
            }

            continue;
        }

        // deterministic / NLU branch
        if (type === 'request_received') {
            closeOpenDeterministicTurn(event.timestamp);
            openDetTurn = createTurn(`det_turn_${++turnCounter}`, turns.length + 1, 'deterministic', event.timestamp);
            turns.push(openDetTurn);
            openDetTurn.userInput.text = compactText(payload.text || payload.user_text);
            pushRaw(openDetTurn, event);
            continue;
        }

        if (!openDetTurn) {
            openDetTurn = createTurn(`det_turn_${++turnCounter}`, turns.length + 1, 'deterministic', event.timestamp);
            turns.push(openDetTurn);
        }

        pushRaw(openDetTurn, event);

        if (type === 'nlu_result') {
            openDetTurn.understanding.intent = safeString(payload.intent) || openDetTurn.understanding.intent || null;
            openDetTurn.understanding.domain = safeString(payload.domain) || openDetTurn.understanding.domain || null;
            openDetTurn.understanding.confidence = toNumberOrNull(payload.confidence);
            openDetTurn.understanding.sourceLabel = safeString(payload.source) || null;
            openDetTurn.understanding.entitiesResolved = extractEntitiesResolved(payload);
            openDetTurn.action.workflowStep = event.workflowStep || 'nlu';
        }

        if (type === 'intent_resolved') {
            openDetTurn.understanding.intent = safeString(payload.intent) || openDetTurn.understanding.intent || null;
            openDetTurn.understanding.confidence = toNumberOrNull(payload.confidence) ?? openDetTurn.understanding.confidence ?? null;
        }

        if (type === 'cart_updated') {
            const cartAfter = {
                items: Number(payload.totalItems || 0),
                total: Number(payload.totalPrice || 0),
            };
            if (!openDetTurn.stateChange.cartBefore && openDetTurn.stateChange.cartAfter) {
                openDetTurn.stateChange.cartBefore = { ...openDetTurn.stateChange.cartAfter };
            }
            openDetTurn.stateChange.cartAfter = cartAfter;
            if (openDetTurn.stateChange.cartBefore) {
                setCartDelta(openDetTurn, openDetTurn.stateChange.cartBefore, cartAfter);
            }
        }

        if (type === 'response_sent') {
            openDetTurn.assistant.text = compactText(payload.reply || payload.replyPreview || payload.text, 500);
            openDetTurn.endedAt = event.timestamp;
            finalizeActionSummary(openDetTurn);
            openDetTurn = null;
            continue;
        }

        if (type === 'icm_blocked') {
            openDetTurn.status = 'blocked';
        }

        if (type === 'order_completed') {
            openDetTurn.action.summary = 'Zamówienie zostało potwierdzone.';
        }
    }

    if (openDetTurn) {
        closeOpenDeterministicTurn(normalizedEvents[normalizedEvents.length - 1]?.timestamp || new Date().toISOString());
    }

    for (const turn of turns) {
        if (!turn.endedAt) turn.endedAt = turn.startedAt;
        finalizeActionSummary(turn);
    }

    return turns;
}

