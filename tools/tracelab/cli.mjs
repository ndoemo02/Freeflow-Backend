import fs from 'node:fs';
import path from 'node:path';
import { analyzeRun, markdownReport } from './analyze.js';
import { readTraceInput, mergeTraceInputs } from './merge.js';

// Explicit offline operation only. No application route, account bypass or DB access.
if (process.env.FREEFLOW_TRACELAB_DEBUG !== '1') throw new Error('Set FREEFLOW_TRACELAB_DEBUG=1 for offline debug export');
const args = process.argv.slice(2);
const take = flag => { const i = args.indexOf(flag); if (i < 0) throw new Error(`Missing ${flag}`); return args.splice(i, 2)[1]; };
const runId = take('--run');
const out = take('--out');
const sessionId = args.includes('--session') ? take('--session') : undefined;
if (!runId || !out || !args.length) throw new Error('Usage: --run ID --out DIRECTORY input.json [input.jsonl ...]');
const run = mergeTraceInputs(args.map(file => readTraceInput(fs.readFileSync(file, 'utf8'))), runId, sessionId);
const report = analyzeRun(run, runId);
fs.mkdirSync(out, { recursive: true });
for (const [name, content] of [['run.json', JSON.stringify(run, null, 2)], ['report.json', JSON.stringify(report, null, 2)], ['report.md', markdownReport(report)]]) {
  fs.writeFileSync(path.join(out, name), content, { flag: 'wx' });
}
console.log(JSON.stringify({ run_id: runId, status: report.status, event_count: run.events.length, out }));
process.exitCode = report.status === 'FAIL' ? 2 : report.status === 'UNKNOWN' ? 3 : 0;
