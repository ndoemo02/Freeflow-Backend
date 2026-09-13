# FreeFlow TraceLab v1 — Phase A

Phase B adds a separately gated, single-session production capture capability and Vercel/browser merge. See `PHASE_B_CAPTURE.md` for the exact enable/export procedure. Production defaults remain OFF; no capture or deployment is performed by the local checkpoint. The Phase A local procedure below remains supported.

Local, offline diagnostic checkpoint. Reuses `recordLiveCartAudit` in both repositories; each existing call emits one envelope. No UI, database, Supabase persistence, application endpoint, auth bypass, prompt changes or Live refactor. Automatic persistent trace storage belongs to a later phase; Phase A persists only explicitly exported JSON/report files.

## Contract

The normative event schema is `event.schema.json`:

```json
{
  "run_id": "manual-20260913-01",
  "session_id": "sess_example",
  "turn_id": "turn-1",
  "request_id": "request-1",
  "source": "backend",
  "event": "mutation_result",
  "timestamp": 1789260000000,
  "payload": {
    "ok": true,
    "cart_changed": true,
    "cart": {"items": [{"id": "canonical-id", "qty": 2, "variant": "duża", "price": 39}], "total": 78},
    "duration_ms": 42
  }
}
```

`timestamp` is epoch milliseconds on the emitting source's clock. `run_id` is assigned by the operator to both local processes; never accepted from a normal application request. Session is exact-match gated. Existing turn/request IDs are preserved. Missing IDs are `null`, never fabricated. The analyzer isolates run/session/turn/request; a transcript with only a turn is associated only if exactly one request exists for that turn/session. Uncorrelated events produce UNKNOWN.

Frontend cart events reuse previously captured store/relay snapshots to find a unique exact match within the same run/session. This correlation is explicitly marked `payload.trace_correlation: unique_cart_snapshot`. Ambiguous snapshots keep null IDs. In particular, do not assign an event to the last request merely because it is recent.

Both collectors retain at most 300 in-memory events and mark truncated exports. Credential/audio keys are redacted recursively; raw PCM/base64 is not captured. Audio enqueue metadata is not proof of delivered or heard audio. Debug transcripts still contain user-provided text, so use controlled accounts/data.

## Existing stages

| Stage | Source | Evidence |
| --- | --- | --- |
| user_transcript | frontend | final user transcript and turn |
| tool_selected | frontend/backend | tool, arguments; backend also receives transcript |
| draft_resolved | backend | requested arguments and canonical pending IDs/variants, handler result |
| mutation_result | backend | mutation acknowledgement, changed flag, server cart, source-measured duration; includes edits |
| server_cart_snapshot | backend | authoritative get_cart_state snapshot, no mutation implied |
| durable_cart_saved / durable_cart_failed | backend | existing persistence outcome, session-scoped; no new persistence |
| tool_execution_result | frontend | complete relay result and relay duration_ms |
| gemini_tool_response | frontend | compact payload sent to Gemini |
| conversation_store_applied | frontend | actual store snapshot after application |
| cart_sync_attempt | frontend | incoming/visible snapshot and existing rejection guards |
| ui_cart_committed | frontend | React CartContext state consumed by UI, not a DOM screenshot |
| assistant_transcript / assistant_audio_enqueued | frontend | assistant text and audio enqueue metadata |

Duration values are measured within the emitting process. The analyzer does not subtract backend timestamps from browser timestamps. Durable-save events without turn/request remain uncorrelated instead of being assigned an invented request. Rejected resolution may have no canonical draft; missing resolution is UNKNOWN, not a fabricated variant.

## Enable locally

Backend PowerShell, before starting the local backend process:

```powershell
$env:FREEFLOW_TRACELAB_DEBUG='1'
$env:LIVE_CART_AUDIT_RUN_ID='manual-20260913-01'
$env:LIVE_CART_AUDIT_SESSION_ID='sess_example'
```

The debug flag alone cannot enable production capture. Production additionally requires the pinned run/session, bounded time window and separate override documented in `PHASE_B_CAPTURE.md`. No production env was modified for this checkpoint.

Frontend: start the local Vite development process with `VITE_FREEFLOW_TRACELAB_DEBUG=1`. In its DevTools initialize a fresh existing collector for each run:

```js
window.__FREEFLOW_CART_AUDIT__ = {
  run_id: 'manual-20260913-01', sessionId: 'sess_example', events: []
};
```

The local procedure additionally requires `import.meta.env.DEV`; a production consumer setting the global cannot enable tracing. Only the separately pinned production build/window and manual start in `PHASE_B_CAPTURE.md` permit one production test capture.

## Export and analyze one run

From local frontend DevTools (Vite development only):

```js
const audit = await import('/src/lib/liveCartAudit.ts');
copy(audit.exportLiveCartAuditRun('manual-20260913-01'));
```

Save that JSON as `frontend-run.json`. The backend exports the same wrapper through `exportLiveCartAuditRun(runId)` within its running process, or reuse its existing `[LIVE_CART_AUDIT]` console lines saved to a local log. There is no HTTP export route. Both must use the same run ID; keep the wrapper when available to preserve the truncation flag.

From the backend repository:

```powershell
$env:FREEFLOW_TRACELAB_DEBUG='1'
node tools/tracelab/cli.mjs --run manual-20260913-01 --out C:/Temp/tracelab-run-01 backend-console.log frontend-run.json
```

CLI accepts v1 wrapper JSON, event arrays, raw JSONL/console audit lines and Vercel request-log wrappers. It selects exactly one run (and optionally `--session`), merges/deduplicates events and writes `run.json`, `report.json`, `report.md`; existing output files are not overwritten. It has no network or database access. CLI itself requires the debug flag. Exit codes: 0 PASS, 2 FAIL, 3 UNKNOWN, 1 invalid input/operation error. Raw console log completeness cannot be guaranteed; a truncated wrapper or collector sequence gap records missing evidence explicitly.

## Deterministic invariants

- `requested_variant_ne_resolved_variant`: compares a requested named size or explicit variant with the resolved canonical variant. Small/medium/large Polish and English aliases are normalized. No guessed relationship between `duża` and `32 cm`; this is UNKNOWN without a menu-specific contract.
- `success_claim_without_confirmed_mutation`: detects compact `added`/`success` or a conservative explicit assistant success prefix. PASS requires consistent successful mutation acknowledgement, changed=true and a cart snapshot in the same request group. Known no-op/failure is FAIL. Missing/conflicting evidence is UNKNOWN. This is not a semantic LLM judge for arbitrary speech.
- `server_cart_ne_visible_cart`: compares canonical IDs, quantities, variants, prices and available totals. Uses authoritative backend snapshots where present, otherwise the captured relay result. Only final committed UI or an actually rejected sync attempt is considered; an intermediate in-flight sync is not a divergence. Missing/ambiguous UI correlation is UNKNOWN.

PASS means these recorded contract checks passed, not authenticated production E2E. Missing stages, empty runs and truncation cannot produce whole-run PASS. A backend-only replay intentionally reports UNKNOWN because it cannot prove store/UI/assistant stages.

## Tests and boundary

Related tests: `api/voice/live/tests/tracelabAnalyzer.test.js`, `liveCartAudit.trace.test.js`, existing `liveCartAudit.replay.test.js`, cart edit and variant audit. Frontend: `src/lib/liveCartAudit.trace.test.ts`, existing compact/checkout controls.

Controlled analyzer scenarios cover first turn, category search, quantity, size mismatch, correction no-op and authoritative cart query. These are explicitly synthetic event-contract fixtures. Real router replay remains a separate backend-only check. The replay can write a v1 export with `TRACELAB_RUN_OUTPUT` set to an absolute local filename.

No Phase B persistence/service, dashboard, UI polish or automatic production monitoring is included. Phase A is a separate local package after truth/variant release backend a463f77 / frontend 10a0332 READY; it is not deployed to production.
