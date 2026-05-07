/**
 * liveHealth.js — In-memory health tracker for Admin Panel Phase 1.
 *
 * Tracks two categories:
 *   Cognitive Load  — prompt size, compact payload size, tool response size
 *   Truth Consistency — GPS drops, cuisine hallucinations, cart desyncs, IVL blocks, tool results
 *
 * Pattern: same as liveMetrics.js — in-memory state, snapshot for admin endpoint.
 */

const state = {
  // --- Truth Consistency ---
  gpsLocationDropCount: 0,
  cuisineHallucinationCount: 0,
  cartDesyncCount: 0,
  cartSuccessDowngradeCount: 0,
  ivlBlockCount: 0,
  ivlTotalCount: 0,
  toolSuccessCount: 0,
  toolFailCount: 0,
  toolTotalCount: 0,
  // --- Cognitive Load ---
  lastPromptSize: 0,
  lastCompactPayloadSize: 0,
  promptSizeHistory: [],
  payloadSizeHistory: [],
  // --- Session-level ---
  lastUpdatedAt: null,
  lastSessionId: null,
};

const MAX_HISTORY = 50;

function nowISO() {
  return new Date().toISOString();
}

function pushCapped(arr, entry, maxLen = MAX_HISTORY) {
  arr.push(entry);
  if (arr.length > maxLen) arr.shift();
}

// ─── Truth Consistency recorders ───

export function recordGpsLocationDrop({ sessionId, reason }) {
  state.gpsLocationDropCount += 1;
  state.lastUpdatedAt = nowISO();
  if (sessionId) state.lastSessionId = sessionId;
  console.log(`[LIVE_HEALTH] gps_location_drop reason=${reason} total=${state.gpsLocationDropCount}`);
}

export function recordCuisineHallucination({ sessionId, cuisine }) {
  state.cuisineHallucinationCount += 1;
  state.lastUpdatedAt = nowISO();
  if (sessionId) state.lastSessionId = sessionId;
  console.log(`[LIVE_HEALTH] cuisine_hallucination cuisine="${cuisine}" total=${state.cuisineHallucinationCount}`);
}

export function recordCartDesync({ sessionId, preCount, postCount, preTotal, postTotal }) {
  state.cartDesyncCount += 1;
  state.lastUpdatedAt = nowISO();
  if (sessionId) state.lastSessionId = sessionId;
  console.log(`[LIVE_HEALTH] cart_desync pre=${preCount}/${preTotal} post=${postCount}/${postTotal} total=${state.cartDesyncCount}`);
}

export function recordCartSuccessDowngrade({ sessionId, reason }) {
  state.cartSuccessDowngradeCount += 1;
  state.lastUpdatedAt = nowISO();
  if (sessionId) state.lastSessionId = sessionId;
  console.log(`[LIVE_HEALTH] cart_success_downgrade reason="${reason}" total=${state.cartSuccessDowngradeCount}`);
}

export function recordIvlBlock({ sessionId, reason }) {
  state.ivlBlockCount += 1;
  state.lastUpdatedAt = nowISO();
  if (sessionId) state.lastSessionId = sessionId;
  console.log(`[LIVE_HEALTH] ivl_block reason=${reason} total=${state.ivlBlockCount}`);
}

export function recordIvlCheck({ sessionId, verified }) {
  state.ivlTotalCount += 1;
}

export function recordToolResult({ sessionId, ok }) {
  state.toolTotalCount += 1;
  if (ok) {
    state.toolSuccessCount += 1;
  } else {
    state.toolFailCount += 1;
  }
  state.lastUpdatedAt = nowISO();
  if (sessionId) state.lastSessionId = sessionId;
}

// ─── Cognitive Load recorders ───

export function recordPromptSize({ sessionId, sizeBytes }) {
  state.lastPromptSize = sizeBytes;
  state.lastUpdatedAt = nowISO();
  if (sessionId) state.lastSessionId = sessionId;
  pushCapped(state.promptSizeHistory, { ts: nowISO(), size: sizeBytes });
}

export function recordCompactPayloadSize({ sessionId, toolName, sizeBytes }) {
  state.lastCompactPayloadSize = sizeBytes;
  state.lastUpdatedAt = nowISO();
  if (sessionId) state.lastSessionId = sessionId;
  pushCapped(state.payloadSizeHistory, { ts: nowISO(), tool: toolName, size: sizeBytes });
}

// ─── Snapshot ───

export function getLiveHealthSnapshot() {
  const ivlBlockRate = state.ivlTotalCount > 0
    ? Number((state.ivlBlockCount / state.ivlTotalCount * 100).toFixed(1))
    : 0;
  const toolSuccessRate = state.toolTotalCount > 0
    ? Number((state.toolSuccessCount / state.toolTotalCount * 100).toFixed(1))
    : 100;

  return {
    truthConsistency: {
      gpsLocationDropCount: state.gpsLocationDropCount,
      cuisineHallucinationCount: state.cuisineHallucinationCount,
      cartDesyncCount: state.cartDesyncCount,
      cartSuccessDowngradeCount: state.cartSuccessDowngradeCount,
      ivlBlockCount: state.ivlBlockCount,
      ivlTotalCount: state.ivlTotalCount,
      ivlBlockRate,
      toolSuccessCount: state.toolSuccessCount,
      toolFailCount: state.toolFailCount,
      toolTotalCount: state.toolTotalCount,
      toolSuccessRate,
    },
    cognitiveLoad: {
      lastPromptSize: state.lastPromptSize,
      lastCompactPayloadSize: state.lastCompactPayloadSize,
      promptSizeHistory: state.promptSizeHistory,
      payloadSizeHistory: state.payloadSizeHistory,
    },
    meta: {
      lastUpdatedAt: state.lastUpdatedAt,
      lastSessionId: state.lastSessionId,
    },
  };
}
