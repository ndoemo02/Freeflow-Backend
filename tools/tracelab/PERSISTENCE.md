# Minimal optional TraceLab v1 persistence

Local implementation; no production SQL, env changes, deploy or capture performed.
SQL package: `supabase/pending_decisions/tracelab_persistence.sql`. It was executed
and tested on isolated PGlite PostgreSQL, with simulated Supabase roles/auth.uid.
The local Supabase CLI could not run (npm blocked its binary installation script),
and Docker was unavailable. Consequently this is a reviewed SQL migration candidate,
not a fabricated CLI migration-history entry or a production RLS/advisors result.
Before deployment, register/apply it through the project's migration workflow.

## Enable one run

All existing Phase B capture flags, exact run/session/window and frontend manual
start still apply. Additionally set backend `FREEFLOW_TRACELAB_PERSIST=1` and
frontend build `VITE_FREEFLOW_TRACELAB_PERSIST=1`. Both default OFF.
Using an operator/service connection, explicitly provision a `tracelab_runs` row:

```sql
insert into public.tracelab_runs
  (run_id, session_id, test_user_id, capture_enabled, starts_at, capture_expires_at)
values
  ('<same-run-id>', '<same-session-id>', '<verified-auth-user-uuid>', true,
   '<same-start-UTC>', '<same-end-UTC>');
```

Use the verified test user's Auth UUID, never email or user-editable metadata.
No application user can create, enable, extend or reassign a run. An authenticated
user can insert only frontend events for their operator-provisioned active run.
They cannot forge backend-source evidence, update/delete events, access another
user's run, or read expired data. Anonymous access is revoked. The backend uses
the existing lazy service client; an invoker trigger also enforces its exact
run/session, enabled flag, server time and event timestamp window. No new endpoint.

Collectors send the SAME redacted event object used for existing export/logs.
Eight v1 envelope fields are unchanged. Generated identity columns are storage
only; `ON CONFLICT DO NOTHING` retains the first event per source/collector/sequence.
Client events remain client assertions, not trusted backend mutation evidence.

Each source allows at most eight concurrent writes with a 2-second abort signal,
no retries and no await from Live. Network/DB errors are swallowed without logging
raw errors. Memory/log export continues regardless of persistence outcome.
Overflow, page close and serverless freeze can lose writes. There is no guaranteed
delivery/flush contract; missing evidence remains UNKNOWN in the existing analyzer.

## Export and retention

Select ONLY the original fields, scoped to one run and session:

```sql
select run_id, session_id, turn_id, request_id, source, event, timestamp, payload
from public.tracelab_events
where run_id = '<run>' and session_id = '<session>'
order by timestamp, source, collector_id, sequence;
```

Save results as a JSON array (timestamp remains a JSON number). The existing CLI
accepts that array and can merge it with browser/log exports without schema changes.
Do not export `select *` including generated storage identity columns.

Run retention defaults to 24 hours and cannot exceed creation + 24 hours. RLS hides
expired runs/events; the run expiry index supports an operator cleanup:

```sql
delete from public.tracelab_runs where expires_at <= now();
```

Events are deleted by FK cascade. This metadata does NOT schedule deletion.
No cron/analytics infrastructure was added. Arrange cleanup when enabling a run.

## Focused local validation

Backend: `node node_modules/vitest/vitest.mjs run api/voice/live/tests/tracelabPersistence.test.js api/voice/live/tests/liveCartAudit.trace.test.js api/voice/live/tests/tracelabCaptureMerge.test.js`.
Frontend: run `src/lib/tracelabPersistence.test.ts` and `src/lib/liveCartAudit.trace.test.ts`, plus `tsc --noEmit`.
SQL: install `@electric-sql/pglite@0.3.14` in a temporary directory, then
`node tools/tracelab/test-persistence-sql.mjs <absolute-path-to-pglite/dist/index.js>`.
This executes real PostgreSQL grants/RLS/constraints/trigger behavior, not regex assertions.
