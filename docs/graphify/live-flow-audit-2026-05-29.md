# Live Flow Audit - 2026-05-29

## Verdict

**PASS_WITH_GAPS**

`orderContract.liveFlow.test.js` jest wartościowym kontraktem regresyjnym dla backendowego kształtu odpowiedzi, blokad cart/IVL i propagacji `focusedMenuItemId`, ale nie jest pełnym testem realnego live/order flow. Test wykonuje prawdziwe klasy `OrderHandler`, `ToolRouter` i `ConfirmAddToCartHandler`, jednak kluczowe rozstrzygnięcia NLU/disambiguation są w większości ustawiane przez mock `resolveMenuItemConflictMock`, a frontendowy highlight/auto-reveal nie jest wykonywany w runtime.

Rekomendacja: **commit**. Test powinien wejść jako kontrakt backendowy, z jasną etykietą, że nie zastępuje Turn Ledger/runtime replay.

## Coverage Matrix

| Scenariusz | Pokrycie | Ocena |
|---|---:|---|
| happy path `add_to_cart` | A1/A1b wykonują realny `OrderHandler`, mutują `session.cart`, sprawdzają `meta.focusedMenuItemId` i shape kontraktu | Dobre, ale wynik dopasowania dania jest mockowany |
| missing restaurant clarify | B1/B2 sprawdzają brak cart mutation przy `ITEM_NOT_FOUND`; G2 sprawdza `ToolRouter` redirect do `find_nearby` bez restauracji | Dobre dla side-effect, średnie dla live routing |
| cross-restaurant conflict | C1 wymusza `ITEM_NOT_FOUND` przy locked restaurant | Słabe jako dowód guarda, dobre jako kontrakt no-add |
| lody vs naleśniki false positive | D1 sprawdza brak dodania naleśników | Słabe dla realnego algorytmu, bo cross-family wynik jest mockowany; mocniej pokryte w `orderHandler.mainResolution.test.js` |
| `search_menu_items` `focusedMenuItemId` | E1/E2 wykonują realny `ToolRouter.search_menu_items` na `session.menuItems` | Dobre backendowo, bez frontendu |
| `confirm_add_to_cart` `focusedMenuItemId` | F1/F2 wykonują realny `ConfirmAddToCartHandler` i realną mutację pending order -> cart | Dobre |
| `confirm_order` bez pending order block | G1 wykonuje realny `ToolRouter` + IVL i sprawdza brak mutacji sesji | Dobre |
| ordinal "to drugie" | H1/H2 modelują dwa kroki przez mockowane wyniki disambiguation | Częściowe; nie testuje parsowania ordinal ani wyboru z pending candidates |
| change mind / stale focus | I1 wykonuje dwa realne wywołania `OrderHandler` z mockowanymi dopasowaniami | Częściowe; sprawdza nowy response focus, nie frontend seq/reveal |
| `focusedMenuItemId` info-only no side-effect | J1/J2 sprawdzają response-scoped meta i brak focus dla unresolved dish | Dobre dla backend meta, ale J1 nie asertuje pełnego braku zapisu do session poza cart |

## Mock Realism Assessment

| Komponent | Realizm | Uwagi |
|---|---:|---|
| `ToolRouter` | Wysoki dla `search_menu_items`, IVL block i ICM redirect; średni dla domenowych handlerów | Klasa jest realna, ale `makeFakeHandlers()` zastępuje większość handlerów odpowiedziami stubowymi. To wystarcza do kontraktu routing/meta, nie do full live flow. |
| `OrderHandler` | Średni | Klasa jest realna i mutuje cart, ale `DisambiguationService.resolveMenuItemConflict` oraz `canonicalizeDish` są mockowane. Test nie dowodzi, że realny resolver znajdzie lub odrzuci danie. |
| `DisambiguationService` | Niski w tym pliku | Kluczowe statusy `ADD_ITEM`, `ITEM_NOT_FOUND`, `DISAMBIGUATION_REQUIRED` są ustawiane ręcznie. Realny cross-family scoring jest lepiej sprawdzany w `orderHandler.mainResolution.test.js`, nie tutaj. |
| `ConfirmAddToCartHandler` | Wysoki | Handler jest realny, używa realnego `commitPendingOrder`, sprawdza `focusedMenuItemId` i null fallback. |
| IVL / guardy | Dobry dla `confirm_order_state_missing`; częściowy dla cart guard | G1 sprawdza realny IVL block. Cart guard jest szerzej w referencyjnym `liveToolRouter.test.js`; ten plik nie stresuje timing/rapid-fire. |
| session cart mutation | Dobry dla `OrderHandler` i `ConfirmAddToCartHandler`; dobry no-op dla clarify | Testy patrzą na `session.cart` i `contextUpdates.cart`, więc łapią najważniejszy side-effect. |
| `focusedMenuItemId` propagation | Dobry backendowo, brak frontend runtime | Pokrywa `OrderHandler`, `ToolRouter.search_menu_items`, `ConfirmAddToCartHandler`; nie wykonuje store, `MenuIsland`, `_uiId`, `MenuFlowView.revealMenuRow`. |

## Missing Tests

### P0

Brak nowych P0 blokujących commit. Najgroźniejsze side-effecty - dodanie przy clarify, `confirm_order` bez pending order, cross-restaurant no-add - są pokryte przynajmniej kontraktowo lub przez referencyjne testy.

### P1

- Realny `DisambiguationService` nie jest wykonywany w `orderContract.liveFlow.test.js`, więc test lody vs naleśniki może przejść nawet po regresji scoringu, jeśli mock dalej zwraca `ITEM_NOT_FOUND`.
- Ordinal "to drugie" nie testuje realnego rozpoznania ordinal ani wykorzystania poprzedniej listy kandydatów; H2 jest de facto drugim jednoznacznym addem.
- Brak backend testu multi-item `focusedMenuItemId = resolvedItems[0]?.id` w nowym kontrakcie, mimo że dokument kontraktu wskazuje tę ścieżkę.

### P2

- Brak testu ID bridging `id` vs `menuItemId` vs `menu_item_id` dla frontendowego `resolveStructuredFocusedMenuItemId`.
- Brak testu repeated same dish -> nowy `autoRevealRequest.seq`.
- Brak asercji, że `search_menu_items` read-only nie zmienia sesji.

## Runtime-Only Risks

Tych ryzyk aktualny backendowy suite nie złapie bez Turn Ledger/runtime trace:

- **STT drift** - rozpoznany tekst może przesunąć danie/restaurację zanim trafi do ToolRoutera.
- **Gemini Live tool call drift** - model może wybrać inny tool albo wypełnić złe argumenty mimo poprawnego backend contract.
- **Frontend actual render/reveal** - test nie wykonuje Zustand store, `MenuIsland`, `ContextualIsland`, `_uiId` ani `MenuFlowView.revealMenuRow`.
- **WebSocket/SSE timing** - response meta może dotrzeć przed menu items albo po remount, co zmienia highlight/reveal.
- **TTS mismatch** - odpowiedź głosowa może sugerować dodanie mimo `clarify_order` albo odwrotnie, jeśli downstream użyje innego tekstu niż guardowany response.

## Next 3 Actions

1. Dodać jeden test bez mockowania `DisambiguationService`: lody vs naleśniki na realnym resolverze, z asercją `ITEM_NOT_FOUND`/`clarify_order` i `cart_delta = 0`.
2. Dodać test ordinal replay: po `DISAMBIGUATION_REQUIRED` zapisać candidates w sesji, potem wejście "to drugie" ma wybrać drugi element bez ręcznego podmieniania tekstu na pełną nazwę.
3. Dodać lekki frontend/unit contract test dla `resolveStructuredFocusedMenuItemId` + `_uiId` bridging: `id`, `menuItemId`, `menu_item_id`, no match, stale focus.

## Recommendation

**commit**

Warunek semantyczny: commitować jako **backend contract/regression test**, nie jako dowód pełnego live E2E. Nazwa i nagłówek testu powinny pozostać jednoznaczne: testuje transcript/tool-flow/order-contract bez audio, STT, Gemini Live runtime i realnego renderowania frontendu.

## Notes

- Nie uruchamiano testów w ramach audytu, zgodnie z trybem read-only i zakazem pełnego suite.
- Nie ruszano `graphify-out`.
- Źródłowe pliki kontraktu i scenariuszy znajdują się w `backend/docs/graphify/`.
