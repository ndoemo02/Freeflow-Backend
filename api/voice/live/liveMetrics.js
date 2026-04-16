const DEFAULT_MODEL = process.env.GEMINI_LIVE_MODEL || process.env.LIVE_MODEL || 'gemini-2.5-flash-native-audio-preview-12-2025';

export const livePricingConfig = {
    model: DEFAULT_MODEL,
    audioInputPricePer1MUnits: Number(process.env.LIVE_AUDIO_INPUT_PRICE_PER_1M || 0.8),
    audioOutputPricePer1MUnits: Number(process.env.LIVE_AUDIO_OUTPUT_PRICE_PER_1M || 0),
    textInputPricePer1MUnits: Number(process.env.LIVE_TEXT_INPUT_PRICE_PER_1M || 0),
    textOutputPricePer1MUnits: Number(process.env.LIVE_TEXT_OUTPUT_PRICE_PER_1M || 0),
    estimationUnit: 'bytes',
    note: 'Operational estimate only. Not a billing source of truth.',
};

const state = {
    sessionsOpened: 0,
    sessionsClosed: 0,
    reconnects: 0,
    toolCalls: 0,
    toolCallsByName: {},
    audioFramesSent: 0,
    audioBytesSent: 0,
    sessionDurationMs: 0,
    currentLiveModel: livePricingConfig.model,
    lastSessionId: null,
    lastStartedAt: null,
    lastClosedAt: null,
    lastSessionEstimatedCost: 0,
    activeSessions: new Map(),
    seenSessionIds: new Set(),
    dailyBuckets: new Map(),
    monthlyBuckets: new Map(),
    costDeltas: [],
};

function logMetric(event, payload = {}) {
    console.log(`[LIVE_METRICS] ${event}`, payload);
}

function toNonNegativeNumber(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, parsed);
}

function dayKey(ts = Date.now()) {
    return new Date(ts).toISOString().slice(0, 10);
}

function monthKey(ts = Date.now()) {
    return new Date(ts).toISOString().slice(0, 7);
}

function ensureBucket(map, key) {
    if (!map.has(key)) {
        map.set(key, {
            sessionsOpened: 0,
            audioBytesSent: 0,
            costEstimate: 0,
            sessionDurationMs: 0,
        });
    }
    return map.get(key);
}

function estimateCostFromBytes(bytes) {
    const safeBytes = toNonNegativeNumber(bytes);
    const per1M = toNonNegativeNumber(livePricingConfig.audioInputPricePer1MUnits);
    return (safeBytes / 1_000_000) * per1M;
}

function pruneOldCostDeltas(nowTs) {
    const cutoff = nowTs - (60 * 60 * 1000);
    state.costDeltas = state.costDeltas.filter((entry) => entry.ts >= cutoff);
}

function recordCostDelta(costDelta, ts) {
    if (costDelta <= 0) return;
    state.costDeltas.push({ ts, costDelta });
    pruneOldCostDeltas(ts);

    const dKey = dayKey(ts);
    const mKey = monthKey(ts);
    ensureBucket(state.dailyBuckets, dKey).costEstimate += costDelta;
    ensureBucket(state.monthlyBuckets, mKey).costEstimate += costDelta;
}

function getOrCreateSession(sessionId) {
    if (!state.activeSessions.has(sessionId)) {
        state.activeSessions.set(sessionId, {
            startedAt: Date.now(),
            audioFramesSent: 0,
            audioBytesSent: 0,
            toolCalls: 0,
            lastReportedFrames: 0,
            lastReportedBytes: 0,
        });
    }
    return state.activeSessions.get(sessionId);
}

function incrementReconnect(sessionId) {
    state.reconnects += 1;
    logMetric('reconnect', { sessionId, reconnects: state.reconnects });
}

export function liveMetricsSessionStart({ sessionId, model }) {
    if (!sessionId) return;
    const nowTs = Date.now();
    const resolvedModel = model || state.currentLiveModel || livePricingConfig.model;

    if (state.seenSessionIds.has(sessionId)) {
        incrementReconnect(sessionId);
    } else {
        state.seenSessionIds.add(sessionId);
    }

    state.sessionsOpened += 1;
    state.currentLiveModel = resolvedModel;
    state.lastSessionId = sessionId;
    state.lastStartedAt = new Date(nowTs).toISOString();
    state.activeSessions.set(sessionId, {
        startedAt: nowTs,
        audioFramesSent: 0,
        audioBytesSent: 0,
        toolCalls: 0,
        lastReportedFrames: 0,
        lastReportedBytes: 0,
    });

    ensureBucket(state.dailyBuckets, dayKey(nowTs)).sessionsOpened += 1;
    ensureBucket(state.monthlyBuckets, monthKey(nowTs)).sessionsOpened += 1;
    pruneOldCostDeltas(nowTs);

    logMetric('session start', {
        sessionId,
        model: resolvedModel,
        sessionsOpened: state.sessionsOpened,
    });
}

export function liveMetricsSessionClose({ sessionId }) {
    if (!sessionId) return;
    const nowTs = Date.now();
    const session = state.activeSessions.get(sessionId);
    const durationMs = session ? Math.max(0, nowTs - session.startedAt) : 0;

    state.sessionsClosed += 1;
    state.sessionDurationMs += durationMs;
    state.lastSessionId = sessionId;
    state.lastClosedAt = new Date(nowTs).toISOString();

    ensureBucket(state.dailyBuckets, dayKey(nowTs)).sessionDurationMs += durationMs;
    ensureBucket(state.monthlyBuckets, monthKey(nowTs)).sessionDurationMs += durationMs;

    if (session) {
        state.lastSessionEstimatedCost = estimateCostFromBytes(session.audioBytesSent);
        state.activeSessions.delete(sessionId);
    } else {
        state.lastSessionEstimatedCost = 0;
    }

    pruneOldCostDeltas(nowTs);

    logMetric('session close', {
        sessionId,
        durationMs,
        sessionsClosed: state.sessionsClosed,
    });
}

export function liveMetricsRegisterToolCall({ sessionId, toolName }) {
    const name = String(toolName || 'unknown_tool');
    state.toolCalls += 1;
    state.toolCallsByName[name] = (state.toolCallsByName[name] || 0) + 1;

    if (sessionId) {
        const session = getOrCreateSession(sessionId);
        session.toolCalls += 1;
    }
}

export function liveMetricsRegisterReconnect({ sessionId }) {
    incrementReconnect(sessionId || 'unknown_session');
}

export function liveMetricsRegisterClientStats({ sessionId, payload = {} }) {
    if (!sessionId) return;
    const nowTs = Date.now();
    const session = getOrCreateSession(sessionId);
    const clientModel = String(payload.liveModel || payload.model || '').trim();

    if (clientModel) {
        state.currentLiveModel = clientModel;
    }

    const explicitFramesDelta = toNonNegativeNumber(payload.audioFramesDelta ?? payload.framesDelta);
    const explicitBytesDelta = toNonNegativeNumber(payload.audioBytesDelta ?? payload.bytesDelta);
    const absoluteFrames = toNonNegativeNumber(payload.audioFramesSent);
    const absoluteBytes = toNonNegativeNumber(payload.audioBytesSent);

    let framesDelta = explicitFramesDelta;
    let bytesDelta = explicitBytesDelta;

    if (!framesDelta && absoluteFrames) {
        const prev = toNonNegativeNumber(session.lastReportedFrames);
        framesDelta = Math.max(0, absoluteFrames - prev);
        session.lastReportedFrames = absoluteFrames;
    }
    if (!bytesDelta && absoluteBytes) {
        const prev = toNonNegativeNumber(session.lastReportedBytes);
        bytesDelta = Math.max(0, absoluteBytes - prev);
        session.lastReportedBytes = absoluteBytes;
    }

    if (!framesDelta && !bytesDelta) return;

    state.audioFramesSent += framesDelta;
    state.audioBytesSent += bytesDelta;
    session.audioFramesSent += framesDelta;
    session.audioBytesSent += bytesDelta;

    ensureBucket(state.dailyBuckets, dayKey(nowTs)).audioBytesSent += bytesDelta;
    ensureBucket(state.monthlyBuckets, monthKey(nowTs)).audioBytesSent += bytesDelta;

    const costDelta = estimateCostFromBytes(bytesDelta);
    recordCostDelta(costDelta, nowTs);

    logMetric('estimate update', {
        sessionId,
        liveModel: state.currentLiveModel,
        framesDelta,
        bytesDelta,
        costDelta: Number(costDelta.toFixed(6)),
    });
}

export function getLiveMetricsSnapshot() {
    const nowTs = Date.now();
    const dBucket = ensureBucket(state.dailyBuckets, dayKey(nowTs));
    const mBucket = ensureBucket(state.monthlyBuckets, monthKey(nowTs));
    pruneOldCostDeltas(nowTs);

    const burnRateLastHour = state.costDeltas.reduce((sum, item) => sum + item.costDelta, 0);
    const active = state.lastSessionId ? state.activeSessions.get(state.lastSessionId) : null;
    const estimatedCostSession = active
        ? estimateCostFromBytes(active.audioBytesSent)
        : state.lastSessionEstimatedCost;

    return {
        liveModel: state.currentLiveModel || livePricingConfig.model,
        sessionsOpened: state.sessionsOpened,
        sessionsClosed: state.sessionsClosed,
        reconnects: state.reconnects,
        toolCalls: state.toolCalls,
        toolCallsByName: state.toolCallsByName,
        audioFramesSent: state.audioFramesSent,
        audioBytesSent: state.audioBytesSent,
        avgSessionDurationSec: state.sessionsClosed > 0
            ? Number((state.sessionDurationMs / state.sessionsClosed / 1000).toFixed(2))
            : 0,
        estimatedCostSession: Number(estimatedCostSession.toFixed(6)),
        estimatedCostToday: Number((dBucket.costEstimate || 0).toFixed(6)),
        estimatedCostMonth: Number((mBucket.costEstimate || 0).toFixed(6)),
        burnRateLastHour: Number(burnRateLastHour.toFixed(6)),
        currentLiveModel: state.currentLiveModel || livePricingConfig.model,
        lastSessionId: state.lastSessionId,
        lastStartedAt: state.lastStartedAt,
        lastClosedAt: state.lastClosedAt,
        pricingAssumptions: livePricingConfig,
    };
}
