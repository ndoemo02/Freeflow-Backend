# Live Flow Contract — System Diff 2026-05-29

Checkpoint po 3 commitach: structured menu focus + cross-family dish guard + metadata pipeline.

---

## 1. Potwierdzone połączenia (kod/import)

### Backend → Response Meta

```
ToolRouter.search_menu_items                          → response.meta.focusedMenuItemId (L948→L975)
orderHandler (single autocommit)                      → meta.focusedMenuItemId = item.id (L2487)
orderHandler (multi autocommit)                       → meta.focusedMenuItemId = resolvedItems[0]?.id (L1890)
ConfirmAddToCartHandler.execute()                     → meta.focusedMenuItemId (L45→L90)
```

**Kontrakt ID**: `focusedMenuItemId` emitowany jest jako `item.id` (nie `menuItemId`, nie `menu_item_id`). Backend zawsze używa pierwotnego `id` pola z DB/ menuItems.

### Frontend — Kontrakt odbioru

```
useLiveEvents.ts (L716)                → store.lastFullResponse = response
useGeminiLiveSession.ts (L613)         → store.lastFullResponse = response
useConversationStore.ts (L286, L311)   → lastFullResponse: data (z /api/brain/v2)
```

### Frontend — Konsumpcja

```
MenuIsland.tsx (L42)              → const lastFullResponse = useConversationStore(s => s.lastFullResponse)
MenuIsland.tsx (L5)               → import { getMenuItemStableId, resolveStructuredFocusedMenuItemId } from '../lib/menuFocusContract'
menuFocusContract.ts (L11)        → response?.meta?.focusedMenuItemId
ContextualIsland.tsx (L6)         → import { getMenuItemStableId } from '../lib/menuFocusContract'
ContextualIsland.tsx (L59-61)     → stableId = getMenuItemStableId(item); _uiId = stableId ?? getItemId(item, index)
MenuFlowView.tsx (L23, L192)      → autoRevealRequest prop
```

---

## 2. Połączenia pośrednie (runtime contract, nie import)

### `focusedMenuItemId` przepływ przez store

```
backend response.meta.focusedMenuItemId
    → useLiveEvents / useGeminiLiveSession
        → useConversationStore.setState({ lastFullResponse: response })
            → MenuIsland.lastFullResponse (Zustand selector)
                → resolveStructuredFocusedMenuItemId(lastFullResponse, menuItems)
```

Brak bezpośredniego importu — kontrakt oparty na strukturze JSON `response.meta.focusedMenuItemId`.

### `autoRevealRequest` łańcuch

```
MenuIsland (L189)                 → setAutoRevealRequest({ id: backendFocusedId, seq: ++autoRevealSeqRef.current })
    → ContextualIsland (L268)     → autoRevealRequest={autoRevealRequest} (prop drilling)
        → MenuFlowView (L135)     → autoRevealRequest={autoRevealRequest} (prop drilling)
            → MenuFlowView (L373) → shouldReveal = autoRevealRequest.seq !== lastAutoRevealSeqRef.current && resolveUiId(autoRevealRequest.id) === matchedUiId
```

### `_uiId` kontrakt — ID bridging

```
ContextualIsland (L60)   → _uiId = getMenuItemStableId(item) ?? getItemId(item, index)
MenuFlowView (L354-359)  → resolveUiId() — exact match _uiId lub suffix match __${rawId}
```

`getMenuItemStableId` zwraca `item.id || item.menuItemId || item.menu_item_id` — ten sam priorytet co backend.

---

## 3. Happy Path

### Przypadek: Amber dodaje danie, backend zwraca `focusedMenuItemId`

```
1. User: "Dodaj pierogi ruskie"
2. Gemini Live → tool call add_item_to_cart
3. ToolRouter → orderHandler.execute()
4. orderHandler → DisambiguationService → ADD_ITEM
5. orderHandler → meta.focusedMenuItemId = "menu-123"
6. Response → useGeminiLiveSession → store.lastFullResponse
7. MenuIsland useEffect [menuItems, lastFullResponse]:
   - resolveStructuredFocusedMenuItemId(lastFullResponse, menuItems) → "menu-123"
   - setHighlightedId("menu-123")
   - setAutoRevealRequest({ id: "menu-123", seq: 1 })
8. ContextualIsland:
   - normalizedItems: _uiId = getMenuItemStableId(item) → "menu-123"
   - highlightedId = "menu-123" → activeIndex = index karty
9. MenuFlowView:
   - resolveUiId("menu-123") → "menu-123" (exact match na _uiId)
   - shouldReveal: seq 1 !== lastAutoRevealSeqRef (null) && resolveUiId match → TRUE
   - revealMenuRow(el) → przewija do karty
   - lastAutoRevealSeqRef.current = 1
```

**Efekt**: Karta z pierogami jest podświetlona i auto-przewinięta w MenuFlowView.

### Przypadek: `search_menu_items` przez ToolRouter

```
1. User: "Znajdź pierogi w menu"
2. Gemini Live → tool call search_menu_items(query="pierogi")
3. ToolRouter → filtruje session.menuItems → matches[0].id = "menu-123"
4. response.meta.focusedMenuItemId = "menu-123"
5. Response → store.lastFullResponse
6. MenuIsland → resolveStructuredFocusedMenuItemId → "menu-123"
7. Highlight + auto-reveal jak wyżej
```

### Przypadek: `confirm_add_to_cart`

```
1. User: "Tak, dodaj do koszyka"
2. Gemini Live → tool call confirm_add_to_cart
3. ConfirmAddToCartHandler → focusedMenuItemId = pendingOrder.items[0]?.id
4. meta.focusedMenuItemId = "menu-123"
5. Frontend odbiera → MenuIsland structured focus → highlight
```

---

## 4. Guard Path — Cross-Family Dish False Positive Prevention

### Problem (przed fixem)

"Puchar lodowy z owocami i bitą śmietaną" matchował "Naleśniki z serem na słodko z bitą śmietaną" — wspólne tokeny modyfikatorów: `bita`, `smietana`, `owocami`.

### Fix — dwuwarstwowy

**Warstwa 1: orderHandler — `hasDishSignalCompatibility()`**

```
collectDishHeadFamilies("puchar lodowy z owocami i bita smietana") → { ice_cream }
collectDishHeadFamilies("nalesniki z serem na slodko z bita smietana") → { pancake }
hasCompatibleDishHeadFamily → FALSE (różne rodziny)
→ hasDishSignalCompatibility → FALSE
```

Tokeny modyfikatorów (`bita`, `smietana`, `owocami`) są wykluczone z `extractFallbackCoreTokens()`.

**Warstwa 2: DisambiguationService — `scoreMenuCandidate()`**

```
hasFallbackDishSignalCompatibility(query, candidateText)
→ collectDishHeadFamilies: ice_cream vs pancake → FALSE
→ scoreMenuCandidate → return 0
```

### Przepływ guarda

```
1. User: "Puchar lodowy z owocami i bitą śmietaną"
2. orderHandler.execute()
3. hasDishSignalCompatibility("puchar lodowy...", "Naleśniki z serem...")
   → hasCompatibleDishHeadFamily → FALSE (ice_cream ≠ pancake)
   → return FALSE
4. scoreMenuCandidate → hasFallbackDishSignalCompatibility → FALSE
   → return 0
5. DisambiguationResult: ITEM_NOT_FOUND
6. Response: clarify_order (nic nie dodane do koszyka)
```

### Rodziny dań (DISH_HEAD_FAMILY_GROUPS)

| Rodzina | Warianty PL |
|---|---|
| `ice_cream` | lody, lodow, lodowy, lodowa, lodowe, puchar |
| `pancake` | nalesnik, nalesniki, nalesnika, nalesnikiem |
| `pizza` | pizza, pizze, pizzy |
| `burger` | burger, burgera, burgery |

### Tokeny wykluczone z core matchingu

`bita`, `smietana`, `owoc`, `owoce`, `owocami`, `owocowy`, `owocowa`, `sos`, `sosy`, `sosem`, `sosu`

---

## 5. Ryzyka

### R1: `focusedMenuItemId` ginie po drodze

**Ścieżki utraty**:
- `ToolRouter.search_menu_items` wysyła `focusedMenuItemId`, ale tylko Gemini może to przekazać dalej. Jeśli model nie użyje `search_menu_items`, tylko `add_item_to_cart` bezpośrednio — focus nie jest emitowany aż do response z orderHandler.
- `useLiveEvents` vs `useGeminiLiveSession` — oba zapisują `lastFullResponse`, ale w trybie HTTP fallback, response przechodzi przez `relayViaHttp()` → `applyToolResultToStore()`. Trzeba zweryfikować, czy `focusedMenuItemId` przechodzi przez ten most.

**Mitygacja**: MenuIsland używa `resolveStructuredFocusedMenuItemId()` która bezpiecznie zwraca null gdy `meta.focusedMenuItemId` brak — fallback do text matching.

### R2: Różne formaty ID wracają

Backend emituje `item.id` (pierwotne pole). Frontend oczekuje:
- `getMenuItemStableId`: `item.id ?? item.menuItemId ?? item.menu_item_id`
- `resolveStructuredFocusedMenuItemId`: porównuje `focusedMenuItemId` z `getMenuItemStableId(item)`

**Zgodność**: ✅ Backend używa `item.id` (najwyższy priorytet w `getMenuItemStableId`). Dopóki `menuItems` w store mają to samo `id` co backend — kontrakt jest spójny.

**Ryzyko**: Jeśli `menuItems` w store pochodzą z innego źródła (np. `show_menu` vs `find_nearby`) i mają inny format ID (np. tylko `menu_item_id`), `resolveStructuredFocusedMenuItemId` może nie znaleźć matchu.

### R3: ToolRouter meta focus jest informacyjny

`ToolRouter.search_menu_items` zwraca `focusedMenuItemId` tylko w `response.meta`. Nie zmienia stanu sesji. To tylko read-path — poleganie na tym, że frontend odbierze i skonsumuje.

### R4: `autoRevealRequest` — wielokrotne odpalenie / brak odpalenia

**Wielokrotne**: `lastAutoRevealSeqRef` (useRef) blokuje powtórki tego samego `seq`. Ale:
- `seq` rośnie tylko w `MenuIsland` useEffect (L189). Jeśli ten sam efekt odpali się dwa razy z tym samym `lastFullResponse`, dostanie ten sam `seq` — OK, ref zablokuje.
- Jeśli `MenuIsland` się odmontuje i zamontuje — `autoRevealSeqRef` resetuje się do 0, `lastAutoRevealSeqRef` też → pierwsze odpalenie przejdzie ponownie. Akceptowalne.

**Brak odpalenia**: Jeśli `highlightedId` zmieni się bez `autoRevealRequest` (np. text matching zamiast structured focus), reveal nie nastąpi — to zamierzone zachowanie (auto-reveal tylko dla structured focus z backendu).

### R5: Brak runtime turn trace

Brak mechanizmu śledzenia: "co się stało z `focusedMenuItemId` między ToolRouter a MenuFlowView". Debugowanie wymaga manualnego łączenia logów backend [ORDER_RESOLVE_TRACE], [DISAMBIGUATION_MIN] z frontend [LIVE_MENU].

---

## 6. Minimalne testy live do ręcznego przejścia

| # | Scenariusz | Oczekiwane zachowanie | Weryfikacja |
|---|---|---|---|
| T1 | "Dodaj pierogi ruskie z restauracji Stara Kamienica" | Karta pierogów podświetlona + auto-przewinięta w MenuFlowView | Sprawdź `meta.focusedMenuItemId` w response, `highlightedId` w MenuIsland |
| T2 | "Znajdź coś dobrego" (bez restauracji) | Discovery flow, brak menu → MenuIsland nie renderuje się | Brak błędu, brak undefined access |
| T3 | "Dodaj pierogi i pizzę" (dwa dania) | Pierwsze dopasowane danie dostaje focus | `focusedMenuItemId = resolvedItems[0]?.id` |
| T4 | "Puchar lodowy z owocami i bitą śmietaną" (menu ma tylko naleśniki) | `clarify_order`, nic nie dodane do koszyka | Sprawdź `[ORDER_RESOLVE_TRACE] resolvedItemId=null`, `[CLARIFY_REASON_TRACE] reason=item_not_found` |
| T5 | Dodaj danie, potem powiedz "tak, potwierdzam" | `confirm_add_to_cart` → `focusedMenuItemId` z pendingOrder | Karta dodanego dania podświetlona po confirm |
| T6 | Dwa razy to samo danie pod rząd | Drugie dodanie — autoRevealRequest z nowym seq → reveal | `lastAutoRevealSeqRef` przepuszcza nowy seq |

---

## 7. Propozycja: Turn Graph Replay

### Koncepcja

Static graph (graph.json z graphify) + `turn_trace.json` = wizualizacja aktywowanych ścieżek dla pojedynczego turnu.

### `turn_trace.json` — struktura

```json
{
  "turn_id": "turn_2026-05-29_001",
  "user_input": "Dodaj pierogi ruskie z restauracji Stara Kamienica",
  "trace": [
    {
      "stage": "gemini_live",
      "tool_call": "add_item_to_cart",
      "args": { "dish_name": "pierogi ruskie", "restaurant_name": "Stara Kamienica" }
    },
    {
      "stage": "tool_router",
      "intent": "create_order",
      "ivl_verified": true,
      "confidence": 1.0
    },
    {
      "stage": "order_handler",
      "dish_family": "pierogi",
      "resolved_item_id": "menu-123",
      "restaurant_lock": { "restaurant": "Stara Kamienica", "id": "sk1" }
    },
    {
      "stage": "disambiguation",
      "result": "ADD_ITEM",
      "score": 1.4,
      "source": "scoped_restaurant"
    },
    {
      "stage": "response_meta",
      "focusedMenuItemId": "menu-123"
    },
    {
      "stage": "frontend_store",
      "lastFullResponse": "{ meta: { focusedMenuItemId: 'menu-123' } }"
    },
    {
      "stage": "menu_island",
      "structured_focus": "menu-123",
      "auto_reveal_seq": 1
    },
    {
      "stage": "contextual_island",
      "ui_id": "menu-123",
      "highlighted": true
    },
    {
      "stage": "menu_flow_view",
      "auto_reveal": true,
      "scroll_target": "menu-123"
    }
  ]
}
```

### Implementacja (szkic)

1. Backend: middleware logujące `turn_trace` do Supabase `live_perf_logs` (rozszerzenie istniejącego `InteractionBridge`)
2. Frontend: `useLiveEvents` / `useGeminiLiveSession` dopisuje frontend stages po `setState`
3. Narzędzie: `TurnReplay.tsx` — czyta `turn_trace` i podświetla aktywowane node'y/edge'y na static graph

**Priorytet**: P2 (nice-to-have, nie blokuje).

---

## Summary

| Warstwa | Co się zmieniło | Pliki |
|---|---|---|
| Backend: focus emit | `focusedMenuItemId` w `meta` | ToolRouter, orderHandler (×2), confirmAddToCartHandler |
| Backend: guard | Dish head family + modifier token filtering | orderHandler, DisambiguationService |
| Frontend: kontrakt ID | `getMenuItemStableId()`, `resolveStructuredFocusedMenuItemId()` | menuFocusContract.ts |
| Frontend: structured focus | Priorytet structured nad text matching | MenuIsland.tsx (3 handlery) |
| Frontend: auto-reveal | `autoRevealRequest` + `seq` guard | ContextualIsland, MenuFlowView |
| Frontend: _uiId bridge | `getMenuItemStableId` zamiast inline fallback | ContextualIsland.tsx |

**Testy**: backend 109/109 PASS, frontend 6/6 PASS.
