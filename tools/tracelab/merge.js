import { schema, validateEvent } from './analyze.js';

// Accept the existing console transport, including Vercel request-log wrappers.
// Never crawl arbitrary payload objects or ingest unrelated application logs.
export function readTraceInput(text) {
  const result = { events: [], truncated: false };
  const visit = value => {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!value || typeof value !== 'object') return;
    if (value.run_id && value.event) { result.events.push(value); return; }
    if (value.schema === schema) {
      if (!Array.isArray(value.events)) throw new Error('Missing trace events');
      result.events.push(...value.events);
      result.truncated ||= !!value.truncated;
      return;
    }
    if (value.schema && value.events) throw new Error('Unsupported trace schema');
    if (Array.isArray(value.logs)) value.logs.forEach(visit);
    for (const message of [value.message, value.text]) {
      if (typeof message === 'string') parseMessage(message);
    }
    result.truncated ||= !!value.truncated;
  };
  const parseMessage = line => {
    const marker = '[LIVE_CART_AUDIT]';
    const index = line.indexOf(marker);
    if (index >= 0) visit(JSON.parse(line.slice(index + marker.length).trim()));
  };
  const normalized = text.replace(/^\uFEFF/, '');
  let document;
  try { document = JSON.parse(normalized); } catch { /* JSONL or raw console */ }
  if (document) visit(document);
  else for (const line of normalized.split(/\r?\n/)) {
    let value;
    try { value = JSON.parse(line); } catch { parseMessage(line); continue; }
    visit(value);
  }
  return result;
}

const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
const redact = (key, value) => /token|authorization|cookie|secret|password|api.?key|access.?key|private.?key|credential|base64|pcm|audio|inlineData/i.test(key) ? '[redacted]'
  : typeof value === 'string' ? value.replace(/Bearer\s+[^\s"']+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[redacted]') : value;

export function mergeTraceInputs(inputs, runId, sessionId) {
  if (!runId) throw new Error('run_id required');
  const selected = inputs.flatMap(i => i.events).filter(e => e.run_id === runId && (!sessionId || e.session_id === sessionId));
  if (selected.some(e => !validateEvent(e))) throw new Error('Invalid TraceLab v1 event');
  const sessions = [...new Set(selected.map(e => e.session_id))];
  if (sessions.length > 1) throw new Error('Multiple sessions: specify --session');
  const seen = new Map(), sequences = new Map();
  let duplicates = 0;
  for (const raw of selected) {
    const event = JSON.parse(JSON.stringify(raw, redact));
    const fingerprint = JSON.stringify(stable(event));
    const { collector_id, sequence } = event.payload;
    const scopedCollector = JSON.stringify([event.source, event.session_id, collector_id]);
    const key = collector_id && Number.isInteger(sequence) && sequence > 0 ? `${scopedCollector}/${sequence}` : fingerprint;
    if (seen.has(key)) {
      if (seen.get(key).fingerprint !== fingerprint) throw new Error('Conflicting collector sequence');
      duplicates++; continue;
    }
    seen.set(key, { event, fingerprint });
    if (collector_id && Number.isInteger(sequence) && sequence > 0) {
      if (!sequences.has(scopedCollector)) sequences.set(scopedCollector, []);
      sequences.get(scopedCollector).push(sequence);
    }
  }
  const sequenceGaps = [...sequences].filter(([, values]) => {
    values.sort((a, b) => a - b);
    return values.some((n, i) => n !== i + 1);
  }).map(([collector]) => collector);
  return { schema, run_id: runId, session_id: sessionId || sessions[0] || null,
    truncated: inputs.some(i => i.truncated) || sequenceGaps.length > 0,
    merge: { input_count: inputs.length, duplicates_removed: duplicates, sequence_gaps: sequenceGaps },
    // Timestamps are retained for display. Cross-source order is not a measured latency.
    events: [...seen.values()].map(v => v.event).sort((a, b) => a.timestamp - b.timestamp || a.source.localeCompare(b.source)) };
}
