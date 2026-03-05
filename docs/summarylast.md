# NLU Pipeline Audit & Stabilizacja (2026-03-05)

## 🎯 Cel i Wynik
Głównym celem była implementacja 6 krytycznych poprawek zidentyfikowanych podczas audytu rurociągu rozpoznawania dań (Menu Recognition Pipeline). Skuteczność rozpoznawania w testach kaskadowych wzrosła z **44% do 58%**.

## ✅ Zrealizowane Poprawki

1.  **DisambiguationService.js**: Zaktualizowano zapytania do Supabase, aby pobierały `base_name`. Logika dopasowania typu *fuzzy* korzysta teraz z `item.base_name || item.name`, co pozwala na poprawne rozpoznawanie skróconych nazw (np. "schabowy" zamiast pełnego "Kotlet schabowy z...").
2.  **Guard dla Discovery (router.js)**: Wprowadzono blokadę, która zapobiega błędnemu przekierowaniu do intencji `find_nearby` przez `FOOD_WORDS` w momencie, gdy użytkownik ma już wybraną restaurację i próbuje złożyć zamówienie.
3.  **session.last_menu Lazy Loading**: Rozwiązano problem wyścigu (race condition) w `router.js`. Jeśli `last_menu` jest puste, a restauracja wybrana, system wymusza asynchroniczne załadowanie menu przed próbą dopasowania dania.
4.  **Unifikacja extractQuantity**: Funkcja `extractQuantity` w `helpers.js` została zsynchronizowana z `extractors.js`, dodając wsparcie dla wzorców cyfrowych (np. "2 burgery").
5.  **Dynamiczny próg fuzzyIncludes**: Wprowadzono dynamiczny próg podobieństwa w `helpers.js`. Dla nazw dań powyżej 5 słów próg został obniżony z 0.6 do 0.45, co znacząco poprawiło wykrywanie długich, opisowych nazw w menu.
6.  **DishCanon.js Update**: Uzupełniono słownik aliasów o brakujące pozycje dla restauracji: Bar Praha, Tasty King Kebab, Stara Kamienica, Dwór Hubertus, Rezydencja Luxury Hotel, Vien-Thien oraz Klaps Burgers.

## 📊 Wyniki Testów Kaskadowych (Cascade Runner)
*   **Vien-Thien**: 100% (9/9 PASS)
*   **Callzone**: 100% (9/9 PASS)
*   **Łączny wynik**: 43/74 PASS (58%)
*   **Pełny raport**: `backend/api/brain/tests/cascade_report.md`

## ⚠️ Pozostałe Wyzwania
Analiza wykazała permanentny bloker w `pipeline.js`. `updateSession` (zapisywanie `last_menu`) następuje *po* wywołaniu `router.detect`. Powoduje to, że router w pierwszej turze po wyborze restauracji widzi puste menu. Doraźny fix (lazy-loading w routerze) pomaga, ale zalecana jest docelowa refaktoryzacja kolejności operacji w `pipeline.js`.
