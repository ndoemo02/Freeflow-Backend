import fs from 'node:fs';
import path from 'node:path';
import { analyzeRun, markdownReport, schema } from './analyze.js';

// Explicit offline operation only. No application route, account bypass or DB access.
if (process.env.FREEFLOW_TRACELAB_DEBUG !== '1') throw new Error('Set FREEFLOW_TRACELAB_DEBUG=1 for offline debug export');
const args = process.argv.slice(2);
const take = flag => { const i = args.indexOf(flag); if (i < 0) throw new Error(`Missing ${flag}`); return args.splice(i, 2)[1]; };
const runId = take('--run');
const out = take('--out');
if (!runId || !out || !args.length) throw new Error('Usage: --run ID --out DIRECTORY input.json [input.jsonl ...]');
let events = [], truncated = false;
for (const file of args) {
  const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  let parsed;
  try { parsed = JSON.parse(text); } catch { /* existing console JSONL */ }
  if (parsed) {
    if (!Array.isArray(parsed) && parsed.schema !== schema) throw new Error('Unsupported trace schema');
    events.push(...(Array.isArray(parsed) ? parsed : parsed.events));
    if ((!parsed.run_id || parsed.run_id === runId) && parsed.truncated) truncated = true;
  } else {
    for (const line of text.split(/\r?\n/)) {
      const prefix = '[LIVE_CART_AUDIT]';
      const start = line.indexOf(prefix);
      if (start >= 0) events.push(JSON.parse(line.slice(start + prefix.length).trim()));
      else if (line.trim().startsWith('{')) events.push(JSON.parse(line));
    }
  }
}
events = events.filter(e => e.run_id === runId);
// Reapply redaction at the export boundary, including imported browser events.
events = JSON.parse(JSON.stringify(events, (key, value) => /token|authorization|cookie|secret|password|base64|pcm/i.test(key) ? '[redacted]' : value));
const run = { schema, run_id: runId, truncated, events };
const report = analyzeRun(run, runId);
fs.mkdirSync(out, { recursive: true });
for (const [name, content] of [['run.json', JSON.stringify(run, null, 2)], ['report.json', JSON.stringify(report, null, 2)], ['report.md', markdownReport(report)]]) {
  fs.writeFileSync(path.join(out, name), content, { flag: 'wx' });
}
console.log(JSON.stringify({ run_id: runId, status: report.status, event_count: events.length, out }));
process.exitCode = report.status === 'FAIL' ? 2 : report.status === 'UNKNOWN' ? 3 : 0;
