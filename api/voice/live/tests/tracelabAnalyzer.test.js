import { describe, expect, it } from 'vitest';
import { analyzeRun, eventKeys, validateEvent, schema } from '../../../../tools/tracelab/analyze.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const cart = (id = 'ravioli', qty = 1, variant = null) => ({ items: [{ id, name: id, qty, variant, price: 39 }], total: qty * 39 });
function scenario(name, { requested = null, resolved = null, changed = true, claim = true, visible, query = false } = {}) {
  const server = cart(name === 'quantity' ? 'ravioli' : 'bianca', name === 'quantity' ? 2 : 1, resolved);
  const event = (event, source, payload, index) => ({ run_id: name, session_id: 'session', turn_id: 'turn', request_id: 'request', source, event, timestamp: 1000 + index * 10, payload });
  return { schema, run_id: name, events: [
    event('user_transcript', 'frontend', { text: 'controlled transcript', requested_variant: requested }, 0),
    event('tool_selected', 'backend', { tool: query ? 'get_cart_state' : 'add_item_to_cart', requested_variant: requested, args: { dish: 'Bianca' } }, 1),
    event('draft_resolved', 'backend', { resolved_variant: resolved }, 2),
    event(query ? 'server_cart_snapshot' : 'mutation_result', 'backend', { ok: true, cart_changed: changed, cart: server, duration_ms: 12 }, 3),
    event('gemini_tool_response', 'frontend', { response: { actionStatus: claim ? 'added' : 'not_added_clarify' } }, 4),
    event('conversation_store_applied', 'frontend', { cart: server }, 5),
    event('ui_cart_committed', 'frontend', { cart: visible || server }, 6),
    event('assistant_transcript', 'frontend', { text: claim ? 'Dodano pozycję.' : 'Czy chodzi o tę pozycję?' }, 7),
  ] };
}

describe('TraceLab deterministic controlled contract scenarios (not Gemini E2E)', () => {
  it.each(['first-turn', 'category-search', 'quantity'])('%s preserves canonical cart and confirmed success', name => {
    const run = scenario(name, name === 'category-search' ? { changed: false, claim: false } : {});
    if (name === 'category-search') run.events[1].payload.tool = 'search_menu_items';
    expect(analyzeRun(run, name).status).toBe('PASS');
  });
  it('size variant detects large vs small', () => {
    const report = analyzeRun(scenario('size-variant', { requested: 'duża', resolved: 'mała' }), 'size-variant');
    expect(report.findings).toContainEqual(expect.objectContaining({ code: 'requested_variant_ne_resolved_variant', status: 'FAIL' }));
  });
  it('correction rejects a success claim with a known no-op', () => {
    const report = analyzeRun(scenario('correction', { changed: false }), 'correction');
    expect(report.findings).toContainEqual(expect.objectContaining({ code: 'success_claim_without_confirmed_mutation', status: 'FAIL' }));
  });
  it('authoritative cart query detects a stale visible item', () => {
    const report = analyzeRun(scenario('authoritative-query', { query: true, claim: false, visible: cart('old') }), 'authoritative-query');
    expect(report.findings).toContainEqual(expect.objectContaining({ code: 'server_cart_ne_visible_cart', status: 'FAIL' }));
  });
  it('confirmed mutation plus matching large variant passes', () => {
    expect(analyzeRun(scenario('large', { requested: 'duża', resolved: 'large' }), 'large').status).toBe('PASS');
  });
  it('does not invent a mapping between large and centimeters', () => {
    const report = analyzeRun(scenario('units', { requested: 'duża', resolved: '32 cm' }), 'units');
    expect(report.findings).toContainEqual(expect.objectContaining({ code: 'requested_variant_ne_resolved_variant', status: 'UNKNOWN' }));
  });
  it('a missing server result cannot borrow success from another run/session/turn', () => {
    const run = scenario('partial');
    const removed = run.events.splice(3, 1)[0];
    for (const patch of [{ run_id: 'other' }, { session_id: 'other' }, { turn_id: 'other' }]) run.events.push({ ...removed, ...patch });
    const report = analyzeRun(run, 'partial');
    expect(report.findings).toContainEqual(expect.objectContaining({ code: 'success_claim_without_confirmed_mutation', status: 'UNKNOWN' }));
  });
  it('missing acknowledgement or conflicting mutation evidence cannot pass a success claim', () => {
    const run = scenario('unknown-ack');
    delete run.events[3].payload.ok;
    expect(analyzeRun(run, 'unknown-ack').findings).toContainEqual(expect.objectContaining({ code: 'success_claim_without_confirmed_mutation', status: 'UNKNOWN' }));
    run.events[3].payload.ok = true;
    run.events.push({ ...run.events[3], payload: { ...run.events[3].payload, cart_changed: false } });
    expect(analyzeRun(run, 'unknown-ack').status).toBe('UNKNOWN');
  });
  it('ambiguous assistant turn and truncated/empty input are UNKNOWN', () => {
    const run = scenario('ambiguous');
    run.truncated = true;
    run.events.at(-1).request_id = null;
    run.events.push({ ...run.events[1], request_id: 'second' });
    expect(analyzeRun(run, 'ambiguous').findings).toContainEqual(expect.objectContaining({ code: 'uncorrelated_event' }));
    expect(analyzeRun({ events: [] }, 'empty').status).toBe('UNKNOWN');
  });
  it('does not classify a negated assistant claim as success', () => {
    const run = scenario('negation', { changed: false, claim: false });
    run.events.at(-1).payload.text = 'Nie dodałam pozycji.';
    expect(analyzeRun(run, 'negation').findings).toEqual([]);
  });
  it('does not reinterpret the assistant response as the user requested variant', () => {
    const run = scenario('assistant-is-not-user', { resolved: 'small' });
    run.events.at(-1).payload.text = 'Dodano dużą Biancę.';
    expect(analyzeRun(run, 'assistant-is-not-user').checks.some(c => c.code === 'requested_variant_ne_resolved_variant')).toBe(false);
  });
  it('records source-measured latency and validates the exact envelope', () => {
    const run = scenario('schema');
    expect(Object.keys(run.events[0]).sort()).toEqual([...eventKeys].sort());
    expect(JSON.parse(fs.readFileSync(new URL('../../../../tools/tracelab/event.schema.json', import.meta.url), 'utf8')).required).toEqual(eventKeys);
    expect(validateEvent({ ...run.events[0], request_id: undefined })).toBe(false);
    expect(() => analyzeRun({ events: [{ stage: 'old' }] }, 'schema')).toThrow('Invalid');
    expect(analyzeRun(run, 'schema').latencies[0]).toMatchObject({ source: 'backend', duration_ms: 12 });
  });
  it('waits for final committed UI instead of flagging an in-flight sync attempt', () => {
    const run = scenario('async');
    run.events.splice(6, 0, { ...run.events[5], event: 'cart_sync_attempt', payload: { incoming: cart('bianca'), visible: cart('old'), draft_active: false, owner_ready: true, session_matches: true } });
    expect(analyzeRun(run, 'async').status).toBe('PASS');
    run.events[6].payload.draft_active = true;
    expect(analyzeRun(run, 'async').status).toBe('PASS'); // later committed UI is authoritative
    run.events = run.events.filter(e => e.event !== 'ui_cart_committed');
    expect(analyzeRun(run, 'async').findings).toContainEqual(expect.objectContaining({ code: 'server_cart_ne_visible_cart', status: 'FAIL' }));
  });
  it('CLI exports only selected run, redacts credentials, and is disabled by default', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tracelab-test-'));
    try {
      const first = scenario('first-turn');
      first.events[0].payload.authorization = 'never-export';
      const file = path.join(dir, 'input.json');
      fs.writeFileSync(file, JSON.stringify([...first.events, ...scenario('other').events]));
      const args = ['tools/tracelab/cli.mjs', '--run', 'first-turn', '--out', path.join(dir, 'out'), file];
      expect(spawnSync(process.execPath, args, { env: { ...process.env, FREEFLOW_TRACELAB_DEBUG: '' } }).status).not.toBe(0);
      const result = spawnSync(process.execPath, args, { env: { ...process.env, FREEFLOW_TRACELAB_DEBUG: '1' }, encoding: 'utf8' });
      expect(result.status, result.stderr).toBe(0);
      const exported = fs.readFileSync(path.join(dir, 'out/run.json'), 'utf8');
      expect(exported).not.toContain('never-export');
      expect(JSON.parse(exported).events.every(e => e.run_id === 'first-turn')).toBe(true);
    } finally {
      if (path.dirname(path.resolve(dir)) !== path.resolve(os.tmpdir()) || !path.basename(dir).startsWith('tracelab-test-')) throw new Error('Unsafe cleanup path');
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
