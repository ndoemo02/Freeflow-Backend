# Cleanup Snapshot — 2026-03-27

## Punkt powrotu

| Repozytorium | Branch źródłowy | Branch snapshot | Commit |
|---|---|---|---|
| backend | `codex/ordering-stabilization-snapshot` | `codex/cleanup-prep` | `f5b5a8a` |
| frontend | `codex/release-snapshot-ui` | `codex/cleanup-prep-ui` | `c2b0410` |

## Stash

| Repo | Stash label |
|---|---|
| backend | `wip: pre-cleanup` |
| frontend | `wip: pre-cleanup` |

Zawartość stasha (backend): `.env.example`, `api/_cors.js`, `api/_supabase.js`, `api/brain/ai/llmClient.js`, `api/brain/core/pipeline.js`, `api/brain/data/restaurantCatalog.js`, `api/brain/dialog/PhraseGenerator.js`, `api/brain/nlu/compoundOrderParser.js`, `api/brain/nlu/router.js`, `api/brain/session/sessionAdapter.js`, `api/brain/supabaseClient.js`, `api/brain/tts/ttsClient.js`, `server.js` + nowe pliki IntentFreeze, testy.

Zawartość stasha (frontend): `package.json`, `package-lock.json`, `src/components/ContextualIsland.tsx`, `src/components/RestaurantSheetContent.tsx`, `src/index.css`.

## Smoke — wyniki

| Test | Komenda | Status |
|---|---|---|
| node --check | `node --check api/server-vercel.js` | **PASS** |
| live cascade runner | `node api/brain/tests/live_tool_cascade_runner.js` | **PASS** |
| frontend build | `npm run build` | **PASS** (9.85s) |

### Live cascade runner — szczegóły
```
✅ A: discovery -> select -> menu
✅ B: select -> add item -> confirm add
✅ C: checkout bridge path
PASS: all live tool flows succeeded.
```

### Frontend build — uwagi
- Chunk size warning: `index-BVEuY3sf.js` 1218 kB (nie błąd — istniejące, niezwiązane z fazą 0)
- Build zakończony bez błędów

## Przywrócenie

Aby wrócić do stanu sprzed fazy 0:
```bash
# backend
cd backend
git checkout codex/ordering-stabilization-snapshot
git stash pop

# frontend
cd frontend
git checkout codex/release-snapshot-ui
git stash pop
```

## Faza 1 — Dead code archiwizacja (2026-03-27)

### Co przeniesiono do `_ARCHIVE_2026`

| Partia | Co | Commit |
|---|---|---|
| 1 | `debug_logs_check.js`, `probe_frontend.js`, `test-debug.js`, `FlowBackend/`, `tests_legacy/` | `87200b5` |
| 2 | `api/brain/LEGACY/brainRouter.js`, `api/brain/_legacy/brainRouter.js` | `94fa5e5` |
| 3 | `tests/legacy/` (10 plików + e2e subdir) | `498396a` |
| 4 (frontend) | `src/legacy/`, `PlaceholderBusiness.jsx`, `PlaceholderCustomer.jsx` | `48d1f89` |
| 5 (root, mv) | `_tmp_react_bits/` (115 MB) | untracked |

### Potwierdzenie — brak importów runtime

- `FlowBackend/` — brak referencji w jakimkolwiek pliku
- `api/brain/LEGACY/` + `_legacy/` — brak `require`/`import` poza folderem
- `tests_legacy/` — dane debugowania (JSON/TXT/MP3), nie kod runtime
- `tests/legacy/` — testy legacy odizolowane od aktywnego test suite (nie ma dedykowanego skryptu)
- `frontend/src/legacy/` — brak importów poza folderem
- `PlaceholderBusiness/Customer.jsx` — brak wpisów w routingu

### Testy końcowe fazy 1

| Test | Wynik |
|---|---|
| `node --check` (6 kluczowych plików) | **PASS** |
| `live_tool_cascade_runner.js` (A/B/C) | **PASS** |
| `npm run build` (frontend) | **PASS** 9.45s |
| `cascade_supabase_tests.js` | NIE WYKONANO (wymaga live serwera) |

## Następna faza

- **Faza 2:** `llmRefiner.js` → migracja z OpenAI na Gemini
