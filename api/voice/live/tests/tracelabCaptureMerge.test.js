import { expect, it } from 'vitest';
import { mergeTraceInputs, readTraceInput } from '../../../../tools/tracelab/merge.js';
import { analyzeRun, schema } from '../../../../tools/tracelab/analyze.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// Controlled transport fixture, not a captured production session.
const cart = { items: [{ id: 'bianca-large', qty: 1, variant: 'duża', price: 40 }], total: 40 };
function captures() {
  const make = (source, list) => list.map(([event, payload], i) => ({ run_id: 'capture', session_id: 'session', turn_id: 'turn', request_id: 'req',
    source, event, timestamp: 1000 + i, payload: { ...payload, collector_id: source, sequence: i + 1 } }));
  const backend = make('backend', [
    ['tool_selected', { tool: 'add_item_to_cart', transcript: 'Dodaj dużą Biancę', args: { dish: 'Bianca duża' } }],
    ['draft_resolved', { canonical_draft: cart }],
    ['mutation_result', { ok: true, cart_changed: true, cart, duration_ms: 7 }],
  ]);
  const frontend = make('frontend', [
    ['user_transcript', { text: 'Dodaj dużą Biancę' }],
    ['tool_execution_result', { response: { ok: true, cart, meta: { liveTool: { cartChanged: true } } }, duration_ms: 15 }],
    ['gemini_tool_response', { response: { actionStatus: 'added' } }],
    ['conversation_store_applied', { cart }],
    ['cart_sync_attempt', { incoming: cart, visible: { items: [] }, owner_ready: true, session_matches: true }],
    ['ui_cart_committed', { cart }],
    ['assistant_transcript', { text: 'Dodano dużą Biancę.' }],
  ]);
  return { backend, frontend };
}
it('merges Vercel nested console records and browser export into the existing analyzer without duplicating events', () => {
  const { backend, frontend } = captures();
  const logs = [...backend, backend[0]].map(e => JSON.stringify({ message: '', logs: [{ message: `[LIVE_CART_AUDIT] ${JSON.stringify(e)}` }] })).join('\n');
  const browser = JSON.stringify({ schema, run_id: 'capture', events: frontend, truncated: false });
  const merged = mergeTraceInputs([readTraceInput(logs), readTraceInput(browser)], 'capture', 'session');
  expect(merged.events).toHaveLength(10); expect(merged.merge.duplicates_removed).toBe(1);
  expect(analyzeRun(merged, 'capture').status).toBe('PASS');
  expect(analyzeRun(merged, 'capture').latencies.map(l => l.duration_ms).sort()).toEqual([15, 7]);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tracelab-capture-'));
  try {
    fs.writeFileSync(path.join(dir, 'backend.jsonl'), logs);
    fs.writeFileSync(path.join(dir, 'frontend.json'), browser);
    const result = spawnSync(process.execPath, ['tools/tracelab/cli.mjs', '--run', 'capture', '--session', 'session', '--out', path.join(dir, 'out'),
      path.join(dir, 'backend.jsonl'), path.join(dir, 'frontend.json')], { env: { ...process.env, FREEFLOW_TRACELAB_DEBUG: '1' }, encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
    const exported = JSON.parse(fs.readFileSync(path.join(dir, 'out/run.json'), 'utf8'));
    expect(exported.events).toHaveLength(10);
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'out/report.json'), 'utf8')).status).toBe('PASS');
  } finally {
    if (path.dirname(path.resolve(dir)) !== path.resolve(os.tmpdir()) || !path.basename(dir).startsWith('tracelab-capture-')) throw new Error('Unsafe cleanup');
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
it('retains UNKNOWN for missing stages, gaps or truncated sources and isolates the selected session', () => {
  const { backend, frontend } = captures();
  const missing = { events: frontend.filter(e => e.event !== 'assistant_transcript') };
  const merged = mergeTraceInputs([{ events: backend }, missing], 'capture', 'session');
  expect(analyzeRun(merged, 'capture').status).toBe('UNKNOWN');
  const gap = mergeTraceInputs([{ events: backend.slice(1) }, { events: frontend }], 'capture', 'session');
  expect(gap.truncated).toBe(true); expect(analyzeRun(gap, 'capture').status).toBe('UNKNOWN');
  const mixed = [{ events: [...backend, ...backend.map(e => ({ ...e, session_id: 'other' }))] }];
  expect(() => mergeTraceInputs(mixed, 'capture')).toThrow('Multiple sessions');
  expect(mergeTraceInputs(mixed, 'capture', 'session').events).toHaveLength(3);
});
it('does not borrow assistant evidence from a different request and rejects conflicting duplicate capture sequences', () => {
  const { backend, frontend } = captures();
  const extra = { ...frontend.at(-1), request_id: 'other', payload: { ...frontend.at(-1).payload, sequence: 8 } };
  const run = mergeTraceInputs([{ events: backend }, { events: [...frontend.slice(0, -1), extra] }], 'capture', 'session');
  expect(analyzeRun(run, 'capture').findings).toContainEqual(expect.objectContaining({ code: 'missing_request_stages', status: 'UNKNOWN' }));
  expect(() => mergeTraceInputs([{ events: [...backend, { ...backend[0], payload: { ...backend[0].payload, args: { changed: true } } }] }], 'capture', 'session')).toThrow('Conflicting');
});
it('raw console noise is ignored, malformed audit is rejected, imported credentials/audio are redacted', () => {
  const { backend } = captures();
  backend[0].payload.inlineData = { data: 'raw-pcm' }; backend[0].payload.note = 'Bearer sensitive';
  backend[0].payload.apiKey = 'api-sensitive';
  const input = readTraceInput(`[CART_GUARD] harmless log\n[LIVE_CART_AUDIT] ${JSON.stringify(backend[0])}`);
  const serialized = JSON.stringify(mergeTraceInputs([input], 'capture', 'session'));
  expect(serialized).not.toContain('raw-pcm'); expect(serialized).not.toContain('sensitive');
  expect(() => readTraceInput('[LIVE_CART_AUDIT] {truncated')).toThrow();
});
