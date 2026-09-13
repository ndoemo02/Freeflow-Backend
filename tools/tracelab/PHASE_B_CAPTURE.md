# Phase B: one explicitly enabled Live capture

Local implementation checkpoint only. No production configuration, deployment or capture was performed. The existing `freeflow.tracelab.v1` envelope and collectors are reused. There is no new endpoint, database, UI, log drain or persistence service. Backend events use existing console logs; frontend events remain in the current page's memory until explicitly exported.

## Scope and gates

The supported production procedure targets the existing browser Gemini Live → protected HTTP tool-call → backend → browser store/CartContext path. Capture adds diagnostics only; it does not change tool arguments, HTTP payloads, auth, business decisions, cart mutation or Gemini responses. The HTTP adapter's existing `debugLiveFlow.finalTranscript` is now included in the existing backend `tool_selected` audit event. Frontend audit IDs are copied before awaiting the tool so a later turn cannot relabel the result. Missing provider call IDs remain missing.

Normal production behavior is OFF. Capture requires all six backend settings and all six frontend build settings below, plus manual frontend start. A normal browser setting the old collector global alone cannot activate production collection. Target run/session IDs are non-secret selectors, not authorization credentials; existing session access checks remain unchanged. Only operators with existing Vercel project log access can export backend logs.

| Backend production environment | Frontend production build environment | Value |
| --- | --- | --- |
| FREEFLOW_TRACELAB_DEBUG | VITE_FREEFLOW_TRACELAB_DEBUG | `1` |
| FREEFLOW_TRACELAB_PRODUCTION_CAPTURE | VITE_FREEFLOW_TRACELAB_PRODUCTION_CAPTURE | `1` |
| LIVE_CART_AUDIT_RUN_ID | VITE_LIVE_CART_AUDIT_RUN_ID | same unique run ID |
| LIVE_CART_AUDIT_SESSION_ID | VITE_LIVE_CART_AUDIT_SESSION_ID | same exact existing test session ID |
| LIVE_CART_AUDIT_START_AT | VITE_LIVE_CART_AUDIT_START_AT | same UTC ISO timestamp |
| LIVE_CART_AUDIT_EXPIRES_AT | VITE_LIVE_CART_AUDIT_EXPIRES_AT | same UTC ISO timestamp, > start and ≤30 minutes later |

Missing flags, mismatched session, invalid/oversized window, time before start or at/after expiry prevent recording. Local DEV debug use remains supported. Expiry stops recording but still allows exporting the already collected, pinned run from page memory. Audio/PCM/inlineData/credential keys and Bearer/JWT strings are redacted at recording and merge boundaries; only audio enqueue metadata is retained, not audio content.

## Exact future enable/export procedure

1. **Choose the existing controlled account/session**, without altering its ID to satisfy capture. On the production origin, `localStorage.getItem('amber-session-id')` is a candidate ID; verify it agrees with the actual session_id used by the existing Live token/tool request. Keep the same account and session. If the app starts a new session, stop: do not broaden the capture selector.
2. Choose one unique run ID and a future UTC window. Example PowerShell preparation, not an environment mutation:

   ```powershell
   $traceRun = 'live-' + [guid]::NewGuid().ToString('N')
   $traceSession = '<verified-existing-test-session-id>'
   $traceStart = (Get-Date).ToUniversalTime().AddMinutes(10)
   $traceEnd = $traceStart.AddMinutes(20)
   $traceStart.ToString('o')
   $traceEnd.ToString('o')
   ```

3. **After separate deployment authorization**, set the table's values in the backend and frontend Vercel production environments. Deploy backend, then rebuild/deploy frontend and verify READY. Frontend VITE values are compiled into its bundle: setting env without a rebuild does not enable capture. If the window is missed, capture remains OFF; arrange a new explicitly scoped deployment/window. This deliberately avoids a remote enable endpoint or a mutable browser-wide production flag.
4. Open the deployed frontend with the same test account/session. Within the window, before the first test utterance, use DevTools:

   ```js
   window.__FREEFLOW_TRACELAB__.start('<run-id>', '<verified-session-id>')
   // Must return true. Undefined API or false means do not proceed with capture.
   ```

   The backend starts recording only matching-session operations in the configured time window. Frontend also requires the manual start above. Do not refresh or call start again during the run: the page buffer is intentionally not persistent. Exercise only the agreed test conversation using the normal Live controls. Production conversation execution is not authorized/performed by this local implementation checkpoint.
5. Stop and export the frontend before refreshing/closing the page:

   ```js
   window.__FREEFLOW_TRACELAB__.stop('<run-id>')
   copy(window.__FREEFLOW_TRACELAB__.exportRun('<run-id>'))
   ```

   Save the copied v1 JSON as `frontend-run.json`. `copy` is the browser DevTools helper. Do not export browser storage, JWTs, network credentials, audio or a full HAR.
6. Export only the selected backend deployment/window through existing Vercel CLI log access. CLI options were checked with local `vercel logs --help`; no production log request was made for Phase B. Substitute the new backend deployment ID and the exact values from step 2:

   ```powershell
   $env:NODE_OPTIONS = (($env:NODE_OPTIONS + ' --use-system-ca').Trim())
   vercel logs --deployment '<backend-deployment-id>' --project backend --scope freeflow-build --environment production --no-branch --no-follow --expand --json --since '<start-UTC-ISO>' --until '<end-UTC-ISO>' --limit 1000 --query '<run-id>' > backend-run.jsonl
   ```

   Never disable TLS checking. The importer accepts raw `[LIVE_CART_AUDIT]` lines and Vercel JSON request records containing `logs[].message`/`text`. Ordinary request metadata is ignored. A provider returning empty/truncated messages is missing evidence, not a reason to synthesize events or broaden capture. Multiple backend instances are expected; each has its own collector ID/sequence.
7. From the backend repository merge/export using the existing CLI:

   ```powershell
   $env:FREEFLOW_TRACELAB_DEBUG='1'
   node tools/tracelab/cli.mjs --run '<run-id>' --session '<verified-session-id>' --out 'C:/Temp/freeflow-one-run' backend-run.jsonl frontend-run.json
   ```

   The output is one merged `run.json` plus `report.json` and `report.md`. Existing files are not overwritten. Matching run/session only; identical duplicates are removed. Conflicting collector sequence records are rejected. Truncation or observed sequence gaps produce UNKNOWN. Source timestamps/durations are preserved; timestamps do not establish cross-source latency. Exit codes remain 0 PASS, 2 FAIL, 3 UNKNOWN, 1 invalid input/export failure.
8. Recording expires automatically. Remove/disable both production debug flags and production-capture flags in the next explicitly authorized cleanup deployment; rebuild the frontend to remove the controls. Frontend stop freezes its buffer immediately but does not remotely disable backend logging; exact-session backend logging stops at expiry or an authorized config redeploy.

## Evidence and limits

The analyzer now checks missing stages per request as well as per run. Evidence from a different request cannot turn an incomplete request into PASS. Existing ambiguous snapshot correlation remains UNKNOWN; new merge logic never assigns request IDs or manufactures stages. Durable-save events without request IDs and provider paths without store events may remain UNKNOWN. Log-provider limits can hide a tail or an entire request without a detectable sequence gap: PASS describes observed evidence, not a guarantee of transport completeness.

Available stages reuse user_transcript, tool_selected/args, draft_resolved, mutation_result, gemini_tool_response, conversation_store_applied, cart_sync_attempt/ui_cart_committed and assistant_transcript. Backend tool result and frontend relay duration fields remain source-measured. The visible-cart event is React CartContext evidence, not a screenshot. No PCM or spoken-audio verification is claimed.

Minimum controls cover production default OFF, explicit session/window/manual start/stop, post-expiry export, redaction, Vercel/browser merge, duplicates, gaps, conflicting records, session isolation and missing-request UNKNOWN. These are controlled local capture/transport tests, not a production session. Stop at local commits before deploy.
