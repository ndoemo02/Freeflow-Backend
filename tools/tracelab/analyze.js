// Phase A: offline deterministic checks. Missing evidence is UNKNOWN, never PASS.
export const schema = 'freeflow.tracelab.v1';
export const eventKeys = ['run_id', 'session_id', 'turn_id', 'request_id', 'source', 'event', 'timestamp', 'payload'];
const clean = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').toLowerCase();
export function variant(value) {
  const text = clean(value);
  if (/(^|\s)(duza|duzy|duze|large|l)(\s|$)/.test(text)) return 'large';
  if (/(^|\s)(mala|maly|male|small|s)(\s|$)/.test(text)) return 'small';
  if (/(^|\s)(srednia|sredni|medium|m)(\s|$)/.test(text)) return 'medium';
  return text.trim() || null;
}
function requestedVariant(payload) {
  if (payload.requested_variant) return variant(payload.requested_variant);
  // Only known size words; never interpret an arbitrary dish as a size.
  for (const text of [payload.transcript, payload.text, payload.args?.dish, payload.requested?.dish]) {
    const found = variant(text);
    if (['large', 'small', 'medium'].includes(found)) return found;
  }
  return null;
}
export function validateEvent(e) {
  if (!e || typeof e !== 'object' || eventKeys.some(k => !(k in e))
    || Object.keys(e).some(k => !eventKeys.includes(k))) return false;
  return ['run_id', 'session_id', 'source', 'event'].every(k => typeof e[k] === 'string' && e[k].length > 0)
    && ['turn_id', 'request_id'].every(k => e[k] === null || (typeof e[k] === 'string' && e[k].length > 0))
    && ['backend', 'frontend'].includes(e.source) && Number.isFinite(e.timestamp)
    && e.payload && typeof e.payload === 'object' && !Array.isArray(e.payload);
}
function cartSignature(cart) {
  const items = Array.isArray(cart) ? cart : cart?.items;
  if (!Array.isArray(items)) return null;
  const rows = items.map(i => ({ id: i.id || i.menu_item_id, qty: Number(i.qty ?? i.quantity),
    variant: variant(i.variant ?? i.size_or_variant), price: (i.price ?? i.price_pln) == null ? NaN : Number(i.price ?? i.price_pln) }));
  if (rows.some(i => !i.id || !Number.isFinite(i.qty))) return null;
  return rows.sort((a, b) => String(a.id).localeCompare(String(b.id)));
}
function compareCart(a, b) {
  const left = cartSignature(a), right = cartSignature(b);
  if (!left || !right) return null;
  if (left.length !== right.length) return false;
  if (typeof a?.total === 'number' && typeof b?.total === 'number' && a.total !== b.total) return false;
  let unknown = false;
  for (let n = 0; n < left.length; n++) {
    const x = left[n], y = right[n];
    if (x.id !== y.id || x.qty !== y.qty) return false;
    if (x.variant && y.variant && x.variant !== y.variant) return false;
    if (!!x.variant !== !!y.variant) unknown = true;
    if (Number.isFinite(x.price) && Number.isFinite(y.price) && x.price !== y.price) return false;
    if (Number.isFinite(x.price) !== Number.isFinite(y.price)) unknown = true;
  }
  return unknown ? null : true;
}
const resultPayload = e => e.event === 'tool_execution_result' ? e.payload.response : null;
function mutation(e) {
  if (e.event === 'mutation_result') return { ok: e.payload.ok, changed: e.payload.cart_changed, cart: e.payload.cart };
  const r = resultPayload(e);
  if (r) return { ok: r.ok, changed: r.meta?.liveTool?.cartChanged, cart: r.cart };
  return null;
}
function successClaim(e) {
  if (e.event === 'gemini_tool_response') return ['added', 'success'].includes(e.payload.response?.actionStatus);
  if (e.event !== 'assistant_transcript') return false;
  if (e.payload.success_claim === true) return true;
  // Conservative literal rule, not an LLM judge. Other phrasings remain unclassified.
  return /^(dodano|dodalam|dodalem|zamienilam|zamienilem)\b/.test(clean(e.payload.transcript || e.payload.text).trim());
}
export function analyzeRun(input, runId) {
  if (!runId || !Array.isArray(input.events)) throw new Error('run_id and events are required');
  if (input.events.some(e => !validateEvent(e))) throw new Error('Invalid TraceLab v1 event');
  const events = input.events.filter(e => e.run_id === runId);
  const findings = [], checks = [], groups = new Map(), latencies = [];
  const add = (code, status, key, evidence) => {
    checks.push({ code, status, key });
    if (status !== 'PASS') findings.push({ code, status, key, evidence });
  };
  if (!events.length) add('empty_run', 'UNKNOWN', runId, 'No events for selected run');
  if (input.truncated) add('truncated_run', 'UNKNOWN', runId, 'Collector dropped events');
  for (const e of events) {
    if (!e.request_id) continue;
    const key = JSON.stringify([e.session_id, e.turn_id, e.request_id]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }
  // Attach transcript-only turns only when exactly one request belongs to that turn/session.
  for (const e of events.filter(e => !e.request_id)) {
    const candidates = e.turn_id ? [...groups.entries()].filter(([, g]) => g.some(x => x.session_id === e.session_id && x.turn_id === e.turn_id)) : [];
    if (candidates.length === 1) candidates[0][1].push(e);
    else add('uncorrelated_event', 'UNKNOWN', `${e.session_id}/${e.event}`, 'Missing or ambiguous request/turn ID');
  }
  for (const [key, group] of groups) {
    const requested = group.filter(e => ['user_transcript', 'tool_selected', 'draft_resolved'].includes(e.event))
      .map(e => requestedVariant(e.payload)).find(Boolean);
    const resolution = group.find(e => e.event === 'draft_resolved');
    const resolved = variant(resolution?.payload.resolved_variant ?? resolution?.payload.canonical_draft?.items?.[0]?.variant)
      || requestedVariant({ text: resolution?.payload.canonical_draft?.items?.[0]?.name });
    const namedSize = value => ['large', 'small', 'medium'].includes(value);
    const comparable = requested && resolved && namedSize(requested) === namedSize(resolved);
    if (requested) add('requested_variant_ne_resolved_variant', comparable ? (requested === resolved ? 'PASS' : 'FAIL') : 'UNKNOWN', key, { requested, resolved });
    const mutations = group.map(mutation).filter(Boolean);
    for (const claim of group.filter(successClaim)) {
      const confirmed = mutations.length > 0 && mutations.every(m => m.ok === true && m.changed === true && cartSignature(m.cart) !== null);
      const knownFailure = mutations.length > 0 && mutations.every(m => m.ok === false || m.changed === false);
      add('success_claim_without_confirmed_mutation', confirmed ? 'PASS' : knownFailure ? 'FAIL' : 'UNKNOWN', key, { event: claim.event, confirmed, knownFailure });
    }
    const newest = list => [...list].sort((a, b) => a.timestamp - b.timestamp).at(-1);
    const authoritative = newest(group.filter(e => e.source === 'backend' && ['mutation_result', 'server_cart_snapshot'].includes(e.event)));
    const server = authoritative?.payload.cart ?? resultPayload(newest(group.filter(e => e.event === 'tool_execution_result')) || {})?.cart;
    const finalVisible = newest(group.filter(e => e.source === 'frontend' && (e.event === 'ui_cart_committed' || (e.event === 'cart_sync_attempt' &&
      (e.payload.draft_active || e.payload.checkout_error || e.payload.auth_loading || e.payload.owner_ready === false
        || e.payload.session_matches === false || e.payload.session_blocked)))));
    const visible = finalVisible?.event === 'cart_sync_attempt' ? finalVisible.payload.visible : finalVisible?.payload.cart;
    if (server || visible) {
      const equal = compareCart(server, visible);
      add('server_cart_ne_visible_cart', equal === null ? 'UNKNOWN' : equal ? 'PASS' : 'FAIL', key, { server: cartSignature(server), visible: cartSignature(visible) });
    }
    for (const e of group) {
      if (Number.isFinite(e.payload.duration_ms) && e.payload.duration_ms >= 0) latencies.push({ key, source: e.source, event: e.event, duration_ms: e.payload.duration_ms });
    }
  }
  const stages = [...new Set(events.map(e => e.event))].sort();
  const missingStages = ['user_transcript', 'tool_selected', 'draft_resolved', 'mutation_result', 'gemini_tool_response', 'conversation_store_applied', 'ui_cart_committed', 'assistant_transcript'].filter(e => !stages.includes(e));
  if (missingStages.length) add('missing_stages', 'UNKNOWN', runId, missingStages);
  return { schema, run_id: runId, status: findings.some(f => f.status === 'FAIL') ? 'FAIL' : findings.length ? 'UNKNOWN' : 'PASS',
    event_count: events.length, stages, checks, findings, latencies };
}

export function markdownReport(report) {
  return `# TraceLab ${report.run_id}\n\nStatus: ${report.status}; events: ${report.event_count}.\n\n`
    + report.checks.map(c => `- ${c.status}: ${c.code} (${c.key})`).join('\n') + '\n';
}
