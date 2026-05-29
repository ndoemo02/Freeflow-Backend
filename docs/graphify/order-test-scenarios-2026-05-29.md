# Order Test Scenarios — FreeFlow 2026-05-29

Checkpoint: structured menu focus + cross-family dish guard + metadata pipeline.
Bazuje na: `docs/graphify/live-flow-contract-2026-05-29.md`

---

## A) Manual Live Order Tests (głos na telefonie)

### A1 — Jednoznaczne danie z jednoznaczną restauracją

| Pole | Wartość |
|---|---|
| **Nazwa** | `live: unambiguous dish + restaurant → highlight + auto-reveal` |
| **Utterance** | "Dodaj pierogi ruskie z restauracji Stara Kamienica" |
| **Intent** | `create_order` |
| **FocusedMenuItemId** | ID pierogów (np. `menu-pierogi-1`) |
| **Cart delta** | +1 pierogi |
| **Assistant reply** | "Dodano pierogi ruskie z Restauracja Stara Kamienica do koszyka..." |
| **Aktywowane moduły** | ToolRouter → OrderHandler → DisambiguationService → (frontend) MenuIsland → ContextualIsland → MenuFlowView |
| **🚩 Red flags** | `focusedMenuItemId = null`, brak auto-reveal, karta niepodświetlona, dodane złe danie |

### A2 — Danie bez restauracji (discovery redirect)

| Pole | Wartość |
|---|---|
| **Nazwa** | `live: dish without restaurant → find_nearby fallback` |
| **Utterance** | "Poproszę kebaba" (bez wybranej restauracji) |
| **Intent** | `find_nearby` (przez ICM redirect) |
| **FocusedMenuItemId** | brak |
| **Cart delta** | 0 |
| **Assistant reply** | Amber pyta o lokalizację / proponuje restauracje |
| **Aktywowane moduły** | ToolRouter → ICM guard → find_nearby handler |
| **🚩 Red flags** | `create_order` bez restauracji, NullPointer w DisambiguationService, `focusedMenuItemId` mimo braku menu |

### A3 — Konflikt dań między restauracjami

| Pole | Wartość |
|---|---|
| **Nazwa** | `live: cross-restaurant dish conflict → clarify` |
| **Utterance** | "Dodaj pizzę margherita" (session.currentRestaurant = Stara Kamienica, margherita tylko w Callzone) |
| **Intent** | `clarify_order` |
| **FocusedMenuItemId** | brak |
| **Cart delta** | 0 |
| **Assistant reply** | Amber informuje, że margherita nie jest dostępna w Starej Kamienicy |
| **Aktywowane moduły** | ToolRouter → OrderHandler → DisambiguationService (hardLock → ITEM_NOT_FOUND) |
| **🚩 Red flags** | Dodanie margherity z Callzone mimo hardLock, cross-restaurant add, brak komunikatu |

### A4 — Lody vs naleśniki z bitą śmietaną

| Pole | Wartość |
|---|---|
| **Nazwa** | `live: ice cream vs pancakes — shared modifiers don't cause false match` |
| **Utterance** | "Puchar lodowy z owocami i bitą śmietaną" (menu ma tylko naleśniki z bitą śmietaną) |
| **Intent** | `clarify_order` |
| **FocusedMenuItemId** | brak |
| **Cart delta** | 0 |
| **Assistant reply** | Amber mówi, że nie znalazła lodów w menu (lub "nie ma takiego dania") |
| **Aktywowane moduły** | ToolRouter → OrderHandler (hasDishSignalCompatibility → FALSE) → DisambiguationService (hasFallbackDishSignalCompatibility → FALSE) |
| **🚩 Red flags** | Dodanie naleśników zamiast lodów, false positive przez wspólne modyfikatory ("bita", "smietana", "owocami") |

### A5 — `search_menu_items` zwraca `focusedMenuItemId`

| Pole | Wartość |
|---|---|
| **Nazwa** | `live: search_menu_items → focusedMenuItemId → UI highlight` |
| **Utterance** | "Znajdź pierogi w menu" (restauracja wybrana, menu załadowane) |
| **Intent** | `search_menu_items` |
| **FocusedMenuItemId** | ID pierwszego trafienia (np. `menu-pierogi-1`) |
| **Cart delta** | 0 (read-only) |
| **Assistant reply** | "Znalazłam X pasujących dań: Pierogi ruskie, ..." |
| **Aktywowane moduły** | ToolRouter → (frontend) MenuIsland (structured focus first) → ContextualIsland → MenuFlowView (autoReveal) |
| **🚩 Red flags** | `focusedMenuItemId` brak w meta, karta niepodświetlona, meta.source ≠ 'live_tool:search_menu_items' |

### A6 — `confirm_add_to_cart` emituje `focusedMenuItemId`

| Pole | Wartość |
|---|---|
| **Nazwa** | `live: confirm_add_to_cart → focusedMenuItemId from pendingOrder` |
| **Utterance** | Po dodaniu pierogów: "Tak, potwierdzam" |
| **Intent** | `confirm_add_to_cart` |
| **FocusedMenuItemId** | ID pierogów z `pendingOrder.items[0].id` |
| **Cart delta** | +1 (commit pendingOrder → cart) |
| **Assistant reply** | "Dodano pierogi ruskie z [restauracja] do koszyka. Czy chcesz zamówić coś jeszcze?" |
| **Aktywowane moduły** | ToolRouter → ConfirmAddToCartHandler → (frontend) MenuIsland (structured focus) |
| **🚩 Red flags** | `focusedMenuItemId = null` mimo pendingOrder, karta niepodświetlona po confirm |

### A7 — `confirm_order` bez pending order — blokada IVL

| Pole | Wartość |
|---|---|
| **Nazwa** | `live: confirm_order without pendingOrder → IVL block` |
| **Utterance** | "Zamawiam" (bez wcześniejszego dodania dań) |
| **Intent** | blokada IVL → `confirm_order_state_missing` |
| **FocusedMenuItemId** | brak |
| **Cart delta** | 0 |
| **Assistant reply** | Amber prosi o sprecyzowanie zamówienia ("Nie widzę Twojego zamówienia...") |
| **Aktywowane moduły** | ToolRouter → IVL (block) |
| **🚩 Red flags** | IVL przepuszcza, create_order bez cart, undefined access na pendingOrder |

### A8 — "To drugie" po liście wyników (ordinal selection)

| Pole | Wartość |
|---|---|
| **Nazwa** | `live: ordinal selection "to drugie" after multi-result disambiguation` |
| **Utterance** | "Dodaj pierogi" → Amber: "Mam pierogi ruskie i pierogi z mięsem, które wybierasz?" → "To drugie" |
| **Intent** | `create_order` (z ordinal=2) |
| **FocusedMenuItemId** | ID drugiego trafienia (pierogi z mięsem) |
| **Cart delta** | +1 pierogi z mięsem |
| **Assistant reply** | "Dodano pierogi z mięsem..." |
| **Aktywowane moduły** | ToolRouter → OrderHandler → DisambiguationService (DISAMBIGUATION_REQUIRED → ordinal resolve) |
| **🚩 Red flags** | Dodanie pierwszego zamiast drugiego, brak obsługi ordinal, clarify zamiast add |

### A9 — Użytkownik zmienia zdanie po focused item

| Pole | Wartość |
|---|---|
| **Nazwa** | `live: change mind after focused item — second dish replaces first focus` |
| **Utterance** | "Dodaj pierogi" → (focus na pierogach) → "Jednak poproszę pizzę" |
| **Intent** | `create_order` (drugie) |
| **FocusedMenuItemId** | ID pizzy (nadpisuje poprzedni focus) |
| **Cart delta** | +1 pierogi, +1 pizza (lub zamiana — zależnie od implementacji) |
| **Assistant reply** | "Dodano pizzę..." |
| **Aktywowane moduły** | ToolRouter → OrderHandler (×2) → (frontend) MenuIsland (highlightedId zmienia się dwukrotnie) |
| **🚩 Red flags** | Focus zostaje na pierogach mimo nowego dodatku, autoRevealRequest nie aktualizuje się, seq nie rośnie |

### A10 — Backend `focusedMenuItemId` podświetla kartę w UI

| Pole | Wartość |
|---|---|
| **Nazwa** | `live: backend focusedMenuItemId → UI card highlight end-to-end` |
| **Utterance** | "Dodaj rosół z makaronem" (menu ma rosół, pierogi, naleśniki) |
| **Intent** | `create_order` |
| **FocusedMenuItemId** | ID rosołu |
| **Cart delta** | +1 rosół |
| **Assistant reply** | "Dodano rosół z makaronem..." |
| **Aktywowane moduły** | ToolRouter → OrderHandler → DisambiguationService → store.lastFullResponse → MenuIsland (setHighlightedId + setAutoRevealRequest) → ContextualIsland (_uiId) → MenuFlowView (resolveUiId + revealMenuRow) |
| **🚩 Red flags** | Podświetlona inna karta niż rosół, brak auto-reveal, `_uiId` mismatch, `resolveUiId` zwraca null |

### A11 — Dwa razy to samo danie pod rząd

| Pole | Wartość |
|---|---|
| **Nazwa** | `live: same dish twice → seq increments, auto-reveal fires again` |
| **Utterance** | "Dodaj pierogi" → (focus + reveal) → "Dodaj pierogi" (drugi raz) |
| **Intent** | `create_order` (×2) |
| **FocusedMenuItemId** | ID pierogów (oba razy) |
| **Cart delta** | +2 pierogi (qty może się zsumować) |
| **Assistant reply** | Drugie potwierdzenie dodania |
| **Aktywowane moduły** | ToolRouter → OrderHandler (×2) → MenuIsland (seq: 1 → 2) → MenuFlowView (lastAutoRevealSeqRef: null → 1 → 2) |
| **🚩 Red flags** | Drugi reveal nie odpala (seq się nie zmienia), `lastAutoRevealSeqRef` blokuje niesłusznie |

### A12 — `add_items_to_cart` multi-item z focus na pierwszym

| Pole | Wartość |
|---|---|
| **Nazwa** | `live: multi-item add → focusedMenuItemId = first resolved item` |
| **Utterance** | "Dodaj pierogi i rosół" |
| **Intent** | `create_order` (multi) |
| **FocusedMenuItemId** | ID pierwszego rozwiązanego dania (`resolvedItems[0]?.id`) |
| **Cart delta** | +1 pierogi, +1 rosół |
| **Assistant reply** | "Dodano pierogi ruskie i rosół..." |
| **Aktywowane moduły** | ToolRouter → OrderHandler (multi path) → DisambiguationService (×2) → MenuIsland |
| **🚩 Red flags** | `focusedMenuItemId` pomimo `unresolvedItems`, focus na nierozwiązanym daniu |

---

## B) Automated Backend Tests (propozycje do vitest)

### B1 — `focusedMenuItemId` w orderHandler single autocommit

| Pole | Wartość |
|---|---|
| **Nazwa** | `emits focusedMenuItemId in single-item autocommit meta` |
| **Utterance** | "pierogi ruskie" |
| **Intent** | `create_order` |
| **FocusedMenuItemId** | `item.id` z dopasowanego rekordu |
| **Cart delta** | +1 |
| **Assistant reply** | zawiera `meta.focusedMenuItemId` |
| **Aktywowane moduły** | OrderHandler (single path L2487) |
| **🚩 Red flags** | `meta.focusedMenuItemId` brak, `focusedMenuItemId = null` mimo ADD_ITEM |
| **Plik** | `api/brain/tests/orderHandler.focusMetadata.test.js` (nowy) |

### B2 — `focusedMenuItemId` w orderHandler multi autocommit

| Pole | Wartość |
|---|---|
| **Nazwa** | `emits focusedMenuItemId for first resolved item in multi-item autocommit` |
| **Utterance** | "pierogi i rosół" |
| **Intent** | `create_order` (multi) |
| **FocusedMenuItemId** | `resolvedItems[0]?.id` |
| **Cart delta** | +2 |
| **Assistant reply** | zawiera `meta.focusedMenuItemId` = ID pierwszego |
| **Aktywowane moduły** | OrderHandler (multi path L1890) |
| **🚩 Red flags** | `focusedMenuItemId` wskazuje na `unresolvedItems`, ID drugiego zamiast pierwszego |
| **Plik** | `api/brain/tests/orderHandler.focusMetadata.test.js` |

### B3 — `search_menu_items` bez trafień — brak `focusedMenuItemId`

| Pole | Wartość |
|---|---|
| **Nazwa** | `search_menu_items returns no focusedMenuItemId when no matches` |
| **Utterance** | `search_menu_items(query="xyz123")` |
| **Intent** | `search_menu_items` |
| **FocusedMenuItemId** | `null` (brak w meta lub null) |
| **Cart delta** | 0 |
| **Assistant reply** | "Nie znalazłam dań pasujących do..." |
| **Aktywowane moduły** | ToolRouter |
| **🚩 Red flags** | `focusedMenuItemId = undefined` (brak klucza), crash na `matches[0]` gdy pusta tablica |
| **Plik** | `api/brain/tests/liveToolRouter.test.js` (dodać) |

### B4 — Dish head family: pizza vs burger — nie krzyżują się

| Pole | Wartość |
|---|---|
| **Nazwa** | `pizza query does not match burger candidate via shared modifier tokens` |
| **Utterance** | "pizza z sosem" (menu ma tylko burgera z sosem) |
| **Intent** | `clarify_order` |
| **FocusedMenuItemId** | brak |
| **Cart delta** | 0 |
| **Assistant reply** | clarify |
| **Aktywowane moduły** | OrderHandler (hasCompatibleDishHeadFamily: pizza ≠ burger) |
| **🚩 Red flags** | Dodanie burgera, false positive przez token "sosem" |
| **Plik** | `api/brain/tests/orderHandler.mainResolution.test.js` (dodać) |

### B5 — Dish head family: burger vs pancake — nie krzyżują się

| Pole | Wartość |
|---|---|
| **Nazwa** | `burger query does not match pancake candidate` |
| **Utterance** | "burger z sosem" (menu ma tylko naleśniki z sosem) |
| **Intent** | `clarify_order` |
| **FocusedMenuItemId** | brak |
| **Cart delta** | 0 |
| **Assistant reply** | clarify |
| **Aktywowane moduły** | OrderHandler, DisambiguationService |
| **🚩 Red flags** | Dodanie naleśnika zamiast burgera |
| **Plik** | `api/brain/tests/orderHandler.mainResolution.test.js` (dodać) |

### B6 — `confirm_add_to_cart` bez id w pendingOrder items

| Pole | Wartość |
|---|---|
| **Nazwa** | `confirm_add_to_cart emits null focusedMenuItemId when pending item has no id` |
| **Utterance** | confirm przy `pendingOrder.items[0] = { name: "pierogi" }` (bez id) |
| **Intent** | `confirm_add_to_cart` |
| **FocusedMenuItemId** | `null` |
| **Cart delta** | +1 |
| **Assistant reply** | dodanie potwierdzone |
| **Aktywowane moduły** | ConfirmAddToCartHandler |
| **🚩 Red flags** | Crash na `items[0]?.id`, `undefined` zamiast `null` |
| **Plik** | `api/brain/tests/confirmAddToCartHandler.focus.test.js` (dodać) |

### B7 — DisambiguationService: hardLock + family mismatch → ITEM_NOT_FOUND

| Pole | Wartość |
|---|---|
| **Nazwa** | `hardLock + cross-family dish → ITEM_NOT_FOUND without false positive` |
| **Utterance** | "lody waniliowe" (hardLock do restauracji, która ma tylko pizzę) |
| **Intent** | `clarify_order` |
| **FocusedMenuItemId** | brak |
| **Cart delta** | 0 |
| **Assistant reply** | "Nie znalazłam lodów waniliowych w [restauracja]" |
| **Aktywowane moduły** | OrderHandler → DisambiguationService (hardLock + hasFallbackDishSignalCompatibility) |
| **🚩 Red flags** | ITEM_NOT_FOUND nie zwrócone, pizza dodana zamiast lodów |
| **Plik** | `api/brain/tests/orderHandler.explicitRestaurantLock.test.js` (dodać) |

### B8 — `focusedMenuItemId` w response przy ITEM_NOT_FOUND

| Pole | Wartość |
|---|---|
| **Nazwa** | `focusedMenuItemId is absent when dish not found (ITEM_NOT_FOUND)` |
| **Utterance** | "nieistniejące danie" (restauracja wybrana) |
| **Intent** | `clarify_order` |
| **FocusedMenuItemId** | brak (null lub nieobecny) |
| **Cart delta** | 0 |
| **Assistant reply** | clarify |
| **Aktywowane moduły** | OrderHandler |
| **🚩 Red flags** | `focusedMenuItemId` ustawiony mimo ITEM_NOT_FOUND, garbage ID |
| **Plik** | `api/brain/tests/orderHandler.focusMetadata.test.js` |

---

## C) Runtime Graph / Turn Ledger Tests

### C1 — Full happy path trace: utterance → add → focus → reveal

| Pole | Wartość |
|---|---|
| **Nazwa** | `turn_trace: single dish add → full pipeline activation` |
| **Utterance** | "Dodaj pierogi ruskie z restauracji Stara Kamienica" |
| **Oczekiwane aktywowane nody** | `gemini_live` → `tool_call:add_item_to_cart` → `ToolRouter.executeToolCall` → `IVL.verify` → `OrderHandler.execute` → `DisambiguationService.resolve` → `response.meta.focusedMenuItemId` → `useConversationStore.lastFullResponse` → `MenuIsland:setHighlightedId` → `MenuIsland:setAutoRevealRequest` → `ContextualIsland:getMenuItemStableId` → `MenuFlowView:resolveUiId` → `MenuFlowView:revealMenuRow` |
| **🚩 Red flags** | Przerwany łańcuch, brak nody `revealMenuRow`, `autoRevealRequest` nie dotarł do MenuFlowView |

### C2 — Guard trace: cross-family block

| Pole | Wartość |
|---|---|
| **Nazwa** | `turn_trace: ice cream vs pancake block → clarify path` |
| **Utterance** | "Puchar lodowy z owocami i bitą śmietaną" (menu: tylko naleśniki) |
| **Oczekiwane aktywowane nody** | `OrderHandler.hasDishSignalCompatibility` → `collectDishHeadFamilies(ice_cream)` → `collectDishHeadFamilies(pancake)` → `hasCompatibleDishHeadFamily=FALSE` → `DisambiguationService.hasFallbackDishSignalCompatibility=FALSE` → `scoreMenuCandidate=0` → `ITEM_NOT_FOUND` → `clarify_order` |
| **🚩 Red flags** | `hasCompatibleDishHeadFamily=TRUE`, `scoreMenuCandidate > 0`, `ADD_ITEM` zamiast `ITEM_NOT_FOUND` |

### C3 — Trace: `search_menu_items` → UI focus (read-only path)

| Pole | Wartość |
|---|---|
| **Nazwa** | `turn_trace: search_menu_items read-only focus path` |
| **Utterance** | "Znajdź pierogi" (restauracja wybrana) |
| **Oczekiwane aktywowane nody** | `ToolRouter.search_menu_items` → `session.menuItems.filter` → `focusedMenuItemId=matches[0].id` → `response.meta` → `MenuIsland.structuredFocus` → `highlightedId` → `autoRevealRequest` |
| **🚩 Red flags** | `search_menu_items` brak w trace, `focusedMenuItemId` nie przechodzi do frontendu |

### C4 — Trace: IVL block path

| Pole | Wartość |
|---|---|
| **Nazwa** | `turn_trace: confirm_order blocked by IVL state machine` |
| **Utterance** | "Zamawiam" (bez pendingOrder) |
| **Oczekiwane aktywowane nody** | `ToolRouter.executeToolCall` → `IVL.verify(toolName=confirm_order)` → `confidence=0, reason=confirm_order_state_missing` → `IVL_BLOCK` → `clarify response` |
| **🚩 Red flags** | IVL przepuszcza, OrderHandler wywołany mimo blokady, crash |

### C5 — Trace: zmiana zdania (dwa turny)

| Pole | Wartość |
|---|---|
| **Nazwa** | `turn_trace: two turns — second dish overrides first focus` |
| **Utterance** | Turn 1: "Dodaj pierogi" → Turn 2: "Jednak poproszę pizzę" |
| **Oczekiwane aktywowane nody** | Turn1: `OrderHandler` → `focusedMenuItemId=pierogi` → `MenuIsland(seq=1)` → Turn2: `OrderHandler` → `focusedMenuItemId=pizza` → `MenuIsland(seq=2)` → `autoRevealRequest.seq 1→2` |
| **🚩 Red flags** | Turn2 nie aktualizuje `highlightedId`, seq nie rośnie, focus zostaje na pierogach |

---

## Podsumowanie

| Grupa | Liczba scenariuszy |
|---|---|
| **A — Manual live tests** | 12 |
| **B — Automated backend tests (propozycje)** | 8 |
| **C — Turn Ledger tests** | 5 |
| **Razem** | **25** |

### Nowe pliki testowe do utworzenia (B):

| Plik | Testy |
|---|---|
| `api/brain/tests/orderHandler.focusMetadata.test.js` | B1, B2, B8 |
| `api/brain/tests/liveToolRouter.test.js` (dopisać) | B3 |
| `api/brain/tests/orderHandler.mainResolution.test.js` (dopisać) | B4, B5 |
| `api/brain/tests/confirmAddToCartHandler.focus.test.js` (dopisać) | B6 |
| `api/brain/tests/orderHandler.explicitRestaurantLock.test.js` (dopisać) | B7 |

### Pokrycie ryzyk z live-flow-contract:

| Ryzyko | Pokryte przez |
|---|---|
| R1: `focusedMenuItemId` ginie | A5, A6, A10, B3, B6, C3 |
| R2: różne formaty ID | A10, B1, B2 |
| R3: ToolRouter meta informacyjny | A5, B3, C3 |
| R4: autoRevealRequest wielokrotnie/brak | A11, C5 |
| R5: brak turn trace | C1–C5 (propozycja rozwiązania) |
