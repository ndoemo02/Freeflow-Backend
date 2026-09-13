// Isolated PostgreSQL verification. Pass an installed @electric-sql/pglite module path.
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { validateEvent } from './analyze.js';
import { readTraceInput, mergeTraceInputs } from './merge.js';
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const owner = '11111111-1111-4111-8111-111111111111';
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth; create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
  insert into auth.users values ('${owner}');`);
await db.exec(readFileSync(new URL('../../supabase/pending_decisions/tracelab_persistence.sql', import.meta.url), 'utf8'));
await db.exec(`insert into tracelab_runs(run_id, session_id, test_user_id, capture_enabled, starts_at, capture_expires_at)
  values ('run','session','${owner}',true,now()-interval '1 minute',now()+interval '19 minutes');`);
let sequence = 0;
const insert = (source = 'frontend', session = 'session', timestamp = Date.now(), run = 'run') => db.query(
  `insert into tracelab_events(run_id,session_id,source,event,timestamp,payload) values ($1,$2,$3,'mutation_result',$4,$5)`,
  [run, session, source, timestamp, { collector_id: 'collector', sequence: ++sequence, token: '[redacted]' }]);
const denied = async (operation) => { await assert.rejects(operation); };
await db.exec('set role anon'); await denied(() => insert());
await denied(() => db.query('select * from tracelab_events'));
await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);`);
await denied(() => insert()); assert.equal((await db.query('select * from tracelab_runs')).rows.length, 0);
await db.exec(`select set_config('request.jwt.claim.sub','${owner}',false)`);
await insert(); await denied(() => insert('backend')); await denied(() => insert('frontend','other'));
await denied(() => insert('frontend','session',Date.now()-3600000));
await denied(() => insert('frontend','session',Date.now(),'unknown'));
await denied(() => db.exec('update tracelab_runs set capture_enabled=true'));
await denied(() => db.exec('delete from tracelab_events'));
await denied(() => db.exec("update tracelab_events set event='forged'"));
// Same write is idempotent with the transport's ON CONFLICT DO NOTHING contract.
const row = (await db.query('select run_id,session_id,turn_id,request_id,source,event,timestamp,payload from tracelab_events')).rows[0];
await db.query(`insert into tracelab_events(run_id,session_id,source,event,timestamp,payload)
  values ($1,$2,$3,$4,$5,$6) on conflict (run_id,source,collector_id,sequence) do nothing`,
  [row.run_id,row.session_id,row.source,row.event,row.timestamp,row.payload]);
assert.equal((await db.query('select * from tracelab_events')).rows.length, 1);
assert.equal(Object.keys(row).length, 8);
assert.equal(validateEvent(row), true);
assert.equal(mergeTraceInputs([readTraceInput(JSON.stringify([row]))], 'run', 'session').events.length, 1);
await db.exec('reset role; set role service_role'); await insert('backend');
await db.exec('update tracelab_runs set capture_enabled=false'); await denied(() => insert('backend'));
await db.exec("update tracelab_runs set capture_enabled=true, starts_at=now()-interval '20 minutes',capture_expires_at=now()-interval '1 minute'");
await denied(() => insert('backend'));
await db.exec(`set role authenticated`); await denied(() => insert());
await db.exec("reset role; update tracelab_runs set expires_at=now()-interval '1 second'; set role authenticated");
assert.equal((await db.query('select * from tracelab_events')).rows.length, 0);
await db.exec('reset role; delete from tracelab_runs where expires_at <= now()');
assert.equal((await db.query('select * from tracelab_events')).rows.length, 0);
await db.close();
console.log('PASS: anon/consumer denied; owner frontend allowed; backend spoof denied; IDs/window/enabled gates; immutable rows; idempotency; eight-column export; backend gate; expired reads; retention cascade.');
