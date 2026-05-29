# Live Flow Debugger / Turn Graph Replay Readiness - 2026-05-29

## Verdict

**READY_WITH_GAPS**

FreeFlow ma wystarczajace kotwice, zeby zbudowac 1-dniowe MVP Live Flow Debugger bez zmiany order flow: `turn_id`, `session_id`, `request_id`, backend `trace[]`, `live_perf_logs`, `liveTraceEvents.js`, frontend `interactionBridge.ts`, `lastFullResponse`, structured `focusedMenuItemId` i auto-reveal chain. Gaps sa glownie produktowo-obserwowalne: brak jednego wspolnego `turn_trace` ledger, brak frontendowego emitowania `menu_focus_applied`/`menu_reveal_triggered` oraz brak debug endpointu zabezpieczonego `DEBUG_LIVE_FLOW=true`.

## Minimal Event Schema

```json
{
  "id": "evt_...",
  "turn_id": "turn_session_1_...",
  "session_id": "amber-session-id",
  "request_id": "gemini-function-call-id-or-null",
  "ts": "2026-05-29T06:00:00.000Z",
  "seq": 12,
  "source": "frontend|backend",
  "stage": "tool_routed",
  "graph_node": "ToolRouter.executeToolCall",
  "status": "ok|blocked|error|info",
  "payload": {},
  "duration_ms": 14
}
```

Rules:
- `turn_id + seq` is the ordering key; timestamps are supporting evidence only.
- `payload` must be compact and sanitized: no raw audio, no base64, no full menu dumps, no secrets.
- Keep user/assistant text truncated, e.g. 240 chars, matching `liveTraceEvents.js` behavior.
- Event writes must be best-effort and never throw into live/order execution.

## Minimal Events

| Event | Required payload |
|---|---|
| `stt_received` | `text`, `source`, optional `lang`, `asr_confidence` |
| `session_init` | `has_gps`, optional `geo_soft_reset_applied` |
| `tool_call_received` | `tool_name`, `args_summary` |
| `tool_routed` | `runtime_intent`, `runtime_domain`, `mapped_text` |
| `guard_pass` / `guard_block` | `guard`, `reason`, `confidence`, `trace` |
| `order_decision` | `intent`, `restaurant_id`, `dish`, `added_to_cart` |
| `disambiguation_result` | `status`, `item_id`, `score`, `source`, `candidate_count` |
| `response_meta_focused` | `focusedMenuItemId`, `meta_source` |
| `cart_delta` | `before_items`, `after_items`, `before_total`, `after_total`, `changed` |
| `assistant_reply_text` | `text`, `intent` |
| `tts_sent_text` | `text`, `source` |
| `frontend_response_received` | `transport`, `tool_name`, `intent`, `has_focus` |
| `menu_focus_applied` | `focusedMenuItemId`, `matched_ui_id`, `seq` |
| `menu_reveal_triggered` | `matched_ui_id`, `auto_reveal_seq`, `revealed` |

## Lista Miejsc `trace.emit`

| Miejsce | Eventy | Dlaczego bezpieczne |
|---|---|---|
| `backend/api/voice/live/GeminiLiveGateway.js` przy `session_init` | `session_init` | Już obsluguje message type przed tool call; emit read-only obok GPS update/logu. |
| `GeminiLiveGateway.js` po `transcriptFinal` | `stt_received` | Istnieje `live_transcript_final` przez `logLiveEvent`; mozna rozszerzyc lub mirrorowac do turn ledger. |
| `GeminiLiveGateway.js` po walidacji tool call | `tool_call_received` | Ma `turnId`, `sessionId`, `requestId`, `toolName`, sanitized args. |
| `backend/api/voice/live/ToolRouter.js` na starcie `executeToolCall` | `tool_routed` | Centralny punkt dla WS i HTTP fallback, ma `turnId`, `sessionId`, mapped intent. |
| `ToolRouter.js` po IVL | `guard_pass` / `guard_block` | IVL zwraca `verified`, `confidence`, `reason`, `trace`; nie trzeba zmieniac decyzji. |
| `ToolRouter.js` po ICM/state check | `guard_pass` / `guard_block` | `icm_required_state` i fallback sa juz w `trace[]`. |
| `ToolRouter.js` przed/po `HandlerDispatcher.executeTransactional` | `cart_delta`, `assistant_reply_text`, `response_meta_focused` | Pre/post cart i final response meta sa juz liczone do `liveTool`. |
| `backend/api/brain/domains/food/orderHandler.js` przy `ORDER_RESOLVE_TRACE` | `order_decision` | Istniejace logi maja resolved item, category, fallback; emit jako side-channel. |
| `backend/api/brain/services/DisambiguationService.js` przy `DISAMBIGUATION_MIN` / return | `disambiguation_result` | Najlepsze miejsce na score/source/candidate_count; bez tego replay nie widzi czemu resolver wybral/odrzucil. |
| `backend/api/brain/domains/food/confirmAddToCartHandler.js` przed return | `response_meta_focused`, `cart_delta` | Handler realnie commitujacy pending order, ma focused id i cart. |
| `frontend/src/hooks/useGeminiLiveSession.ts` przy input transcript/toolcall/audio output | `stt_received`, `tool_call_received`, `tts_sent_text` | Juz uzywa `logBridge` i `turnId`; dopisac `trace.emit` obok, bez order state mutation. |
| `frontend/src/hooks/useLiveEvents.ts` po WS `tool_result` | `frontend_response_received` | Pierwszy frontend punkt z pelnym backend response dla WS. |
| `applyToolResultToStore` path w `useGeminiLiveSession.ts` | `frontend_response_received` | Pokrywa HTTP fallback, ktory kontrakt wskazuje jako ryzyko. |
| `frontend/src/components/MenuIsland.tsx` po structured focus | `menu_focus_applied` | Dokladnie tu `focusedMenuItemId` zmienia sie w `highlightedId` i `autoRevealRequest`. |
| `frontend/src/components/MenuFlowView.tsx` w `shouldReveal` branch | `menu_reveal_triggered` | Jedyny punkt potwierdzajacy realny scroll/reveal. |

## Proposed Files To Add

Backend:
- `api/voice/live/liveTurnTrace.js` - in-memory ring buffer + `emitTrace(event)` + sanitizer.
- `api/voice/live/liveTurnTraceEndpoint.js` or route in `api/voice/live/index.js` - `GET /api/dev/live-flow/turns`, `GET /api/dev/live-flow/turns/:turnId`, optional `POST /api/dev/live-flow/event` for frontend events.
- `api/voice/live/liveTurnTrace.test.js` - small sanitizer/flag/unit test only.

Frontend:
- `src/lib/liveFlowTrace.ts` - browser-side `emitLiveFlowTrace(event)` no-op unless enabled.
- `src/pages/dev/LiveFlowDebugger.tsx` - `/dev/live-flow` dashboard, isolated from consumer UI.
- `src/components/dev/TurnGraphReplay.tsx` - simple event list + graph-node highlighting from static mapping.
- Route constants under `src/app/routeConfig.ts`: `DEV_LIVE_FLOW`, gated by dev/debug flag.

Docs:
- `docs/graphify/live-flow-debugger-event-map-2026-05-29.md` if the event-to-node map grows beyond MVP.

## Files To Not Touch In MVP

- `graphify-out/*` and `graphify-out/.delta_info.json`
- `backend_graphify_out/*`, `frontend_graphify_out/*`
- Runtime order decision logic in `orderHandler.js` except adding side-effect-free trace emit beside existing trace logs.
- Matching/scoring behavior in `DisambiguationService.js`
- Cart mutation helpers/session cart semantics
- `ToolSchemas.js` and Gemini tool declarations, unless adding debug transport would otherwise require it (it should not)
- Production UI surfaces like `Home`, `Cart`, `RestaurantSheetContent`, checkout panels
- Debug artifacts: `nlu_test_results.json`, `check_supabase.mjs`, `query_perf.mjs`, `run_migration.mjs`

## SSE vs WebSocket Recommendation

**Use SSE for the debugger stream; keep existing WebSocket for live tool execution.**

Why:
- Existing Live WS is part of the product flow and carries tool calls/results. Debugger traffic should not share backpressure or reconnect semantics with order execution.
- SSE is one-way, simpler, safe for a passive dashboard, and easier to gate behind `DEBUG_LIVE_FLOW=true`.
- The dashboard mostly needs append-only events and snapshot replay, not bidirectional commands.
- A separate `GET /api/dev/live-flow/events?session_id=...` SSE stream can be disabled in production without touching Gemini Live WS.

Use WebSocket only if MVP later needs interactive replay controls that talk back to a running session. For day-one MVP, polling + SSE is enough.

## Env / Security Guard

Backend guard:
- All new debug endpoints return `404` or `403` unless `process.env.DEBUG_LIVE_FLOW === 'true'`.
- Require existing origin validation via `validateLiveOrigin(req.headers.origin)` for browser access.
- If `LIVE_INTERNAL_KEY` is configured, require `x-live-internal-key` or a query token for non-browser/manual access.
- Never expose raw audio, full prompts, API keys, service role config, or full user history.

Frontend guard:
- Add `VITE_DEBUG_LIVE_FLOW=true` and hide `/dev/live-flow` route otherwise.
- Keep route out of normal nav; direct URL only.
- In production builds, dashboard should render a short "disabled" page unless both frontend and backend flags are enabled.

Retention:
- In-memory ring buffer default: last 50 turns or last 1000 events.
- Optional Supabase persistence only after schema review; do not write raw traces to `live_perf_logs` forever without TTL.

## Mapping Trace Event To Graph Node

| Trace event | Live Flow Graph node |
|---|---|
| `stt_received` | `GeminiLive.inputTranscription` / `useGeminiLiveSession.transcript_received` |
| `session_init` | `GeminiLiveGateway.session_init` |
| `tool_call_received` | `GeminiLiveGateway.tool_call` |
| `tool_routed` | `ToolRouter.executeToolCall` |
| `guard_pass` | `IntentVerificationLayer.verifyToolCall` or `ICM.checkRequiredState` |
| `guard_block` | `IVL_BLOCK` / `ICM_BLOCK` |
| `order_decision` | `OrderHandler.execute` |
| `disambiguation_result` | `DisambiguationService.resolveMenuItemConflict` |
| `response_meta_focused` | `response.meta.focusedMenuItemId` |
| `cart_delta` | `ToolRouter.cart_guard` / `session.cart` |
| `assistant_reply_text` | `ResponseBuilder.build` |
| `tts_sent_text` | `GeminiLive.toolResponse -> model audio` / frontend first audio output |
| `frontend_response_received` | `useLiveEvents.tool_result` or HTTP fallback `applyToolResultToStore` |
| `menu_focus_applied` | `MenuIsland.setHighlightedId` |
| `menu_reveal_triggered` | `MenuFlowView.revealMenuRow` |

Implementation detail: keep a static map like `src/dev/liveFlowGraphMap.ts` with `{ eventStage, graphNodeId, label, layer }`. Do not parse `graphify-out/graph.json` at runtime for MVP.

## Export To Obsidian / Turn Graph Replay

MVP export formats:
- `turn_trace.json` - exact event list, stable schema.
- `turn_trace.md` - Obsidian-friendly table with frontmatter:

```md
---
turn_id: turn_...
session_id: amber-...
verdict: ok
created_at: 2026-05-29T06:00:00.000Z
---

| seq | stage | graph_node | status | summary |
|---:|---|---|---|---|
```

For graph replay:
- Use `graph_node` as the join key to static node ids.
- Mark node status: `hit`, `blocked`, `error`, `missing`.
- Derive edge activation by adjacent ordered events in the same `turn_id`.
- Export should be client-side download first; backend persistence can come later.

## Runtime Risks Not Covered By Contract Tests

### P0

- Debug emit accidentally changes live flow latency or throws inside `ToolRouter`/handlers. Mitigation: `try/catch`, async best-effort, bounded payload, no awaits in hot path.
- Debug endpoint leaks user text/session/order data in production. Mitigation: `DEBUG_LIVE_FLOW=true`, origin/internal-key guard, redaction, short retention.

### P1

- Turn correlation breaks between Gemini frontend `turnId`, Gateway fallback `turnId`, and HTTP fallback. Existing IDs are usable, but MVP must normalize missing IDs.
- Frontend response received before menu items are ready, so `menu_focus_applied` is missing even though backend emitted focus.
- `tts_sent_text` mismatch: backend reply and model-spoken/audio transcript can diverge after compact tool response.
- `DisambiguationService` decisions are still partly inferred from existing logs unless an explicit event is emitted at return points.

### P2

- Multi-tool calls in one model turn need either one parent `turn_id` plus per-tool `request_id`, or child sequence grouping.
- Remount/reconnect can duplicate frontend events unless `seq` and `(turn_id, stage, request_id)` de-dupe are defined.
- Static graph node ids may drift after future graphify runs; keep a manual MVP map first.

## MVP Scope Na 1 Dzien

1. Add `liveTurnTrace.js` ring buffer with `emitTrace`, `getTurns`, `getTurn`, sanitizer, env guard helper.
2. Add backend endpoints:
   - `GET /api/dev/live-flow/turns`
   - `GET /api/dev/live-flow/turns/:turnId`
   - optional `GET /api/dev/live-flow/events` SSE
   - optional `POST /api/dev/live-flow/event` for frontend-only events
3. Emit backend events at Gateway + ToolRouter + OrderHandler/Disambiguation/ConfirmAddToCart side-channel points.
4. Add frontend `emitLiveFlowTrace` and emit only:
   - `frontend_response_received`
   - `menu_focus_applied`
   - `menu_reveal_triggered`
   - `tts_sent_text` from first audio/output text path
5. Add `/dev/live-flow` route hidden behind `VITE_DEBUG_LIVE_FLOW=true`.
6. Dashboard v1: session filter, turn list, event timeline, graph-node status list, JSON/Markdown export.

## Czego Nie Robic W MVP

- Nie budowac pelnego edytora grafu.
- Nie modyfikowac order flow, matching, cart mutation ani tool schemas.
- Nie odpalac graphify ani nie czytac runtime z `graphify-out` jako zrodla prawdy.
- Nie wrzucac trace do produkcyjnej nawigacji.
- Nie przechowywac raw audio/base64/pelnych promptow.
- Nie laczyc debugger WS z produkcyjnym Gemini Live WS.
- Nie robic replayu deterministycznego, ktory ponownie wykonuje narzedzia; MVP ma byc read-only replayem zdarzen.

## Kolejny Prompt Implementacyjny

```txt
CEL:
Zaimplementuj MVP Live Flow Debugger / Turn Graph Replay jako debug-only, bez zmiany order flow.

TRYB:
Nie ruszaj graphify-out.
Nie zmieniaj matching/order/cart semantics.
Nie dodawaj debug route do normalnej nawigacji.
Wszystko gated przez DEBUG_LIVE_FLOW=true i VITE_DEBUG_LIVE_FLOW=true.

ZAKRES:
Backend:
- api/voice/live/liveTurnTrace.js
- endpointy /api/dev/live-flow/turns, /turns/:turnId, opcjonalnie /events SSE
- trace.emit w GeminiLiveGateway, ToolRouter, OrderHandler, DisambiguationService, ConfirmAddToCartHandler

Frontend:
- src/lib/liveFlowTrace.ts
- /dev/live-flow route hidden by VITE_DEBUG_LIVE_FLOW
- dashboard: turn list, event timeline, graph node status, JSON/Markdown export
- emit frontend_response_received, menu_focus_applied, menu_reveal_triggered, tts_sent_text

TESTY:
- male unit tests dla sanitizer/ring buffer/env guard
- nie uruchamiaj pelnego suite

OUTPUT:
- diff summary
- commands run
- manual smoke steps
```

## Notes

- Audyt wykonany read-only dla kodu runtime.
- Nie uruchamiano pelnego test suite.
- Nie ruszano `graphify-out` ani debug artifacts.
- Raport zapisany w `backend/docs/graphify`, obok aktualnych dokumentow live-flow.
