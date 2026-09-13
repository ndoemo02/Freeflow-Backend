-- TraceLab v1 persistence. Operator provisions a run; clients cannot create/enable runs.
begin;
create table public.tracelab_runs (
  run_id text primary key check (length(run_id) between 1 and 160),
  session_id text not null check (length(session_id) between 1 and 160),
  test_user_id uuid not null references auth.users(id) on delete cascade,
  capture_enabled boolean not null default false,
  starts_at timestamptz not null,
  capture_expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  unique (run_id, session_id),
  check (capture_expires_at > starts_at and capture_expires_at <= starts_at + interval '30 minutes'),
  check (expires_at >= capture_expires_at and expires_at <= created_at + interval '24 hours')
);
create index tracelab_runs_retention on public.tracelab_runs(expires_at);
create index tracelab_runs_test_user on public.tracelab_runs(test_user_id);
create table public.tracelab_events (
  run_id text not null,
  session_id text not null,
  turn_id text,
  request_id text,
  source text not null check (source in ('frontend', 'backend')),
  event text not null check (length(event) between 1 and 160),
  timestamp bigint not null check (timestamp > 0),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 65536),
  -- Storage-only identity. Export selects the original eight envelope columns.
  collector_id text generated always as (payload->>'collector_id') stored not null,
  sequence bigint generated always as ((payload->>'sequence')::bigint) stored not null check (sequence > 0),
  primary key (run_id, source, collector_id, sequence),
  foreign key (run_id, session_id) references public.tracelab_runs(run_id, session_id) on delete cascade
);
create index tracelab_events_request on public.tracelab_events(run_id, request_id, timestamp);
create index tracelab_events_turn on public.tracelab_events(run_id, turn_id, timestamp);
alter table public.tracelab_runs enable row level security;
alter table public.tracelab_events enable row level security;
revoke all on public.tracelab_runs, public.tracelab_events from public, anon, authenticated;
grant select on public.tracelab_runs, public.tracelab_events to authenticated;
grant insert (run_id, session_id, turn_id, request_id, source, event, timestamp, payload)
  on public.tracelab_events to authenticated;
grant all on public.tracelab_runs, public.tracelab_events to service_role;
create policy tracelab_test_run_read on public.tracelab_runs for select to authenticated
  using (test_user_id = (select auth.uid()) and expires_at > now());
create policy tracelab_test_event_read on public.tracelab_events for select to authenticated
  using (exists (select 1 from public.tracelab_runs r where r.run_id = tracelab_events.run_id));
create policy tracelab_test_event_insert on public.tracelab_events for insert to authenticated
  with check (source = 'frontend' and exists (
    select 1 from public.tracelab_runs r where r.run_id = tracelab_events.run_id
      and r.session_id = tracelab_events.session_id and r.capture_enabled
      and now() >= r.starts_at and now() < r.capture_expires_at));
-- Enforce run/window for service-role writes too. No SECURITY DEFINER bypass.
create function public.tracelab_check_capture() returns trigger language plpgsql security invoker
set search_path = '' as $$
begin
  if not exists (select 1 from public.tracelab_runs r
    where r.run_id = new.run_id and r.session_id = new.session_id and r.capture_enabled
      and statement_timestamp() >= r.starts_at and statement_timestamp() < r.capture_expires_at
      and statement_timestamp() < r.expires_at
      and new.timestamp >= extract(epoch from r.starts_at) * 1000
      and new.timestamp < extract(epoch from r.capture_expires_at) * 1000) then
    raise exception 'TraceLab capture not enabled' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.tracelab_check_capture() from public, anon, authenticated;
create trigger tracelab_capture_gate before insert on public.tracelab_events
  for each row execute function public.tracelab_check_capture();
commit;
