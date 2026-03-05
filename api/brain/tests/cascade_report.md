# Cascade Test Report
_Generated: 2026-03-05T08:35:55.848Z_

## Main Scenarios

| # | restaurant | dish | scenario | intent_chain | cart_items | state_warns | PASS/FAIL | reason |
|---|-----------|------|----------|-------------|-----------|------------|-----------|--------|
| 1 | Bar Praha | Zupa czosnkowa | full | `find_nearby→select_restaurant→menu_request→UNKNOWN_INTENT→create_order` | 0 | - | ❌ FAIL | cart_empty (cartItems=0) |
| 2 | Bar Praha | Zupa czosnkowa | alias | `find_nearby→select_restaurant→menu_request→UNKNOWN_INTENT→create_order` | 0 | - | ❌ FAIL | cart_empty (cartItems=0) |
| 3 | Bar Praha | Zupa czosnkowa | qty_2 | `find_nearby→select_restaurant→menu_request→create_order→clarify_order` | 0 | - | ❌ FAIL | cart_empty (cartItems=0) |
| 4 | Bar Praha | Smażony ser | full | `find_nearby→select_restaurant→menu_request→UNKNOWN_INTENT→create_order` | 0 | - | ❌ FAIL | cart_empty (cartItems=0) |
| 5 | Bar Praha | Smażony ser | alias | `find_nearby→select_restaurant→menu_request→UNKNOWN_INTENT→create_order` | 0 | - | ❌ FAIL | cart_empty (cartItems=0) |
| 6 | Bar Praha | Smażony ser | qty_2 | `find_nearby→select_restaurant→menu_request→find_nearby→select_restaurant` | 0 | - | ❌ FAIL | no_order_intent (intents: find_nearby→select_restaurant→menu_request→find_nearby→select_restaurant) |
| 7 | Bar Praha | Gulasz wieprzowy z knedlikiem | full | `find_nearby→select_restaurant→menu_request→create_order→confirm_add_to_cart` | 1 | - | ✅ PASS | ok |
| 8 | Bar Praha | Gulasz wieprzowy z knedlikiem | alias | `find_nearby→select_restaurant→menu_request→create_order→choose_restaurant` | 0 | - | ❌ FAIL | cart_empty (cartItems=0) |
| 9 | Bar Praha | Gulasz wieprzowy z knedlikiem | qty_2 | `find_nearby→select_restaurant→menu_request→find_nearby→confirm` | 0 | - | ❌ FAIL | no_order_intent (intents: find_nearby→select_restaurant→menu_request→find_nearby→confirm) |
| 10 | Tasty King Kebab | Kebab w bułce | full | `find_nearby→select_restaurant→menu_request→find_nearby→confirm` | 0 | - | ❌ FAIL | no_order_intent (intents: find_nearby→select_restaurant→menu_request→find_nearby→confirm) |
| 11 | Tasty King Kebab | Kebab w bułce | alias | `find_nearby→select_restaurant→menu_request→create_order→confirm_add_to_cart` | 1 | - | ✅ PASS | ok |
| 12 | Tasty King Kebab | Kebab w bułce | qty_2 | `find_nearby→select_restaurant→menu_request→find_nearby→confirm` | 0 | - | ❌ FAIL | no_order_intent (intents: find_nearby→select_restaurant→menu_request→find_nearby→confirm) |
| 13 | Tasty King Kebab | Rollo Kebab | full | `find_nearby→select_restaurant→menu_request→create_order→confirm_add_to_cart` | 1 | - | ✅ PASS | ok |
| 14 | Tasty King Kebab | Rollo Kebab | alias | `find_nearby→select_restaurant→menu_request→create_order→confirm_add_to_cart` | 1 | - | ✅ PASS | ok |
| 15 | Tasty King Kebab | Rollo Kebab | qty_2 | `find_nearby→select_restaurant→menu_request→create_order→confirm_add_to_cart` | 1 | - | ✅ PASS | ok |
| 16 | Tasty King Kebab | Kebab Box | full | `find_nearby→select_restaurant→menu_request→create_order→confirm_add_to_cart` | 1 | - | ✅ PASS | ok |
| 17 | Tasty King Kebab | Kebab Box | alias | `find_nearby→select_restaurant→menu_request→create_order→confirm_add_to_cart` | 1 | - | ✅ PASS | ok |
| 18 | Tasty King Kebab | Kebab Box | qty_2 | `find_nearby→select_restaurant→menu_request→create_order→confirm_add_to_cart` | 1 | - | ✅ PASS | ok |
| 19 | Restauracja Stara Kamienica | Rolada śląska z kluskami i modrą kapustą | full | `find_nearby→select_restaurant→menu_request→create_order→confirm_add_to_cart` | 1 | - | ✅ PASS | ok |
| 20 | Restauracja Stara Kamienica | Rolada śląska z kluskami i modrą kapustą | alias | `find_nearby→select_restaurant→menu_request→create_order→confirm_add_to_cart` | 1 | - | ✅ PASS | ok |
| 21 | Restauracja Stara Kamienica | Rolada śląska z kluskami i modrą kapustą | qty_2 | `find_nearby→select_restaurant→menu_request→find_nearby→confirm` | 0 | - | ❌ FAIL | no_order_intent (intents: find_nearby→select_restaurant→menu_request→find_nearby→confirm) |
| 22 | Restauracja Stara Kamienica | Żurek śląski na maślance | full | `find_nearby→select_restaurant→menu_request→create_order→confirm_add_to_cart` | 1 | - | ✅ PASS | ok |
| 23 | Restauracja Stara Kamienica | Żurek śląski na maślance | alias | `find_nearby→select_restaurant→menu_request→create_order→choose_restaurant` | 0 | - | ❌ FAIL | cart_empty (cartItems=0) |
| 24 | Restauracja Stara Kamienica | Żurek śląski na maślance | qty_2 | `find_nearby→select_restaurant→menu_request→find_nearby→confirm` | 0 | - | ❌ FAIL | no_order_intent (intents: find_nearby→select_restaurant→menu_request→find_nearby→confirm) |
| 25 | Restauracja Stara Kamienica | Kotlet schabowy z ziemniakami i kapustą | full | `find_nearby→select_restaurant→menu_request→create_order→confirm_add_to_cart` | 1 | - | ✅ PASS | ok |
| 26 | Restauracja Stara Kamienica | Kotlet schabowy z ziemniakami i kapustą | alias | `find_nearby→select_restaurant→menu_request→create_order→confirm_add_to_cart` | 1 | - | ✅ PASS | ok |
| 27 | Restauracja Stara Kamienica | Kotlet schabowy z ziemniakami i kapustą | qty_2 | `find_nearby→select_restaurant→menu_request→create_order→confirm_add_to_cart` | 1 | - | ✅ PASS | ok |
| 28 | Dwór Hubertus | Ćwiartka kaczki | full | `find_nearby→select_restaurant→menu_request→UNKNOWN_INTENT→create_order` | 0 | - | ❌ FAIL | cart_empty (cartItems=0) |
| 29 | Dwór Hubertus | Ćwiartka kaczki | alias | `find_nearby→select_restaurant→menu_request→UNKNOWN_INTENT→create_order` | 0 | - | ❌ FAIL | cart_empty (cartItems=0) |
| 30 | Dwór Hubertus | Ćwiartka kaczki | qty_2 | `find_nearby→select_restaurant→menu_request→find_nearby→select_restaurant` | 0 | - | ❌ FAIL | no_order_intent (intents: find_nearby→select_restaurant→menu_request→find_nearby→select_restaurant) |
| 31 | Dwór Hubertus | Krem borowikowy | full | `find_nearby→select_restaurant→menu_request→UNKNOWN_INTENT→create_order` | 0 | - | ❌ FAIL | cart_empty (cartItems=0) |
| 32 | Dwór Hubertus | Krem borowikowy | alias | `find_nearby→select_restaurant→menu_request→UNKNOWN_INTENT→create_order` | 0 | - | ❌ FAIL | cart_empty (cartItems=0) |
| 33 | Dwór Hubertus | Krem borowikowy | qty_2 | `find_nearby→select_restaurant→menu_request→find_nearby→confirm` | 0 | - | ❌ FAIL | no_order_intent (intents: find_nearby→select_restaurant→menu_request→find_nearby→confirm) |
| 34 | Dwór Hubertus | Polędwica wieprzowa | full | `find_nearby→select_restaurant→menu_request→UNKNOWN_INTENT→create_order` | 0 | - | ❌ FAIL | cart_empty (cartItems=0) |
| 35 | Dwór Hubertus | Polędwica wieprzowa | alias | `find_nearby→select_restaurant→menu_request→UNKNOWN_INTENT→create_order` | 0 | - | ❌ FAIL | cart_empty (cartItems=0) |
| 36 | Dwór Hubertus | Polędwica wieprzowa | qty_2 | `find_nearby→select_restaurant→menu_request→find_nearby→confirm` | 0 | - | ❌ FAIL | no_order_intent (intents: find_nearby→select_restaurant→menu_request→find_nearby→confirm) |
| 37 | Rezydencja Luxury Hotel | Krem z dyni z białą czekoladą | full | `find_nearby→select_restaurant→menu_request→create_order→confirm_add_to_cart` | 1 | - | ✅ PASS | ok |
| 38 | Rezydencja Luxury Hotel | Krem z dyni z białą czekoladą | alias | `find_nearby→select_restaurant→menu_request→create_order→confirm_add_to_cart` | 1 | - | ✅ PASS | ok |
| 39 | Rezydencja Luxury Hotel | Krem z dyni z białą czekoladą | qty_2 | `find_nearby→select_restaurant→ERROR→ERROR→create_order` | 0 | - | ❌ FAIL | step_error (2 steps errored) |
| 40 | Rezydencja Luxury Hotel | Wędzony pstrąg | full | `find_nearby→select_restaurant→menu_request→create_order→confirm_add_to_cart` | 1 | - | ✅ PASS | ok |
| 41 | Rezydencja Luxury Hotel | Wędzony pstrąg | alias | `find_nearby→select_restaurant→menu_request→create_order→confirm_add_to_cart` | 1 | - | ✅ PASS | ok |
| 42 | Rezydencja Luxury Hotel | Wędzony pstrąg | qty_2 | `find_nearby→select_restaurant→menu_request→create_order→confirm_add_to_cart` | 1 | - | ✅ PASS | ok |
| 43 | Rezydencja Luxury Hotel | Tagliatelle z krewetkami | full | `find_nearby→select_restaurant→menu_request→UNKNOWN_INTENT→create_order` | 0 | - | ❌ FAIL | cart_empty (cartItems=0) |
| 44 | Rezydencja Luxury Hotel | Tagliatelle z krewetkami | alias | `find_nearby→select_restaurant→menu_request→UNKNOWN_INTENT→create_order` | 0 | - | ❌ FAIL | cart_empty (cartItems=0) |
| 45 | Rezydencja Luxury Hotel | Tagliatelle z krewetkami | qty_2 | `find_nearby→select_restaurant→menu_request→find_nearby→confirm` | 0 | - | ❌ FAIL | no_order_intent (intents: find_nearby→select_restaurant→menu_request→find_nearby→confirm) |
| 46 | Vien-Thien | Zupa Won Ton | full | `find_nearby→select_restaurant→menu_request→create_order→confirm_add_to_cart` | 1 | - | ✅ PASS | ok |
| 47 | Vien-Thien | Zupa Won Ton | alias | `find_nearby→select_restaurant→menu_request→create_order→confirm_add_to_cart` | 1 | - | ✅ PASS | ok |
| 48 | Vien-Thien | Zupa Won Ton | qty_2 | `find_nearby→select_restaurant→menu_request→create_order→confirm_add_to_cart` | 1 | - | ✅ PASS | ok |
| 49 | Vien-Thien | Sajgonki z ryżem | full | `find_nearby→select_restaurant→menu_request→create_order→confirm_add_to_cart` | 1 | - | ✅ PASS | ok |
| 50 | Vien-Thien | Sajgonki z ryżem | alias | `find_nearby→select_restaurant→menu_request→create_order→confirm_add_to_cart` | 1 | - | ✅ PASS | ok |
| 51 | Vien-Thien | Sajgonki z ryżem | qty_2 | `find_nearby→select_restaurant→menu_request→create_order→confirm_add_to_cart` | 1 | - | ✅ PASS | ok |
| 52 | Vien-Thien | Wołowina 5 smaków | full | `find_nearby→select_restaurant→menu_request→create_order→confirm_add_to_cart` | 1 | - | ✅ PASS | ok |
| 53 | Vien-Thien | Wołowina 5 smaków | alias | `find_nearby→select_restaurant→menu_request→create_order→confirm_add_to_cart` | 1 | - | ✅ PASS | ok |
| 54 | Vien-Thien | Wołowina 5 smaków | qty_2 | `find_nearby→select_restaurant→menu_request→create_order→confirm_add_to_cart` | 1 | - | ✅ PASS | ok |
| 55 | Callzone | Pizza Pepperoni | full | `find_nearby→select_restaurant→menu_request→create_order→confirm_add_to_cart` | 1 | - | ✅ PASS | ok |
| 56 | Callzone | Pizza Pepperoni | alias | `find_nearby→select_restaurant→menu_request→create_order→confirm_add_to_cart` | 1 | - | ✅ PASS | ok |
| 57 | Callzone | Pizza Pepperoni | qty_2 | `find_nearby→select_restaurant→menu_request→create_order→confirm_add_to_cart` | 1 | - | ✅ PASS | ok |
| 58 | Callzone | Pizza Hawajska | full | `find_nearby→select_restaurant→menu_request→create_order→confirm_add_to_cart` | 1 | - | ✅ PASS | ok |
| 59 | Callzone | Pizza Hawajska | alias | `find_nearby→select_restaurant→menu_request→create_order→confirm_add_to_cart` | 1 | - | ✅ PASS | ok |
| 60 | Callzone | Pizza Hawajska | qty_2 | `find_nearby→select_restaurant→menu_request→create_order→confirm_add_to_cart` | 1 | - | ✅ PASS | ok |
| 61 | Callzone | Pizza Margherita | full | `find_nearby→select_restaurant→menu_request→create_order→confirm_add_to_cart` | 1 | - | ✅ PASS | ok |
| 62 | Callzone | Pizza Margherita | alias | `find_nearby→select_restaurant→menu_request→create_order→confirm_add_to_cart` | 1 | - | ✅ PASS | ok |
| 63 | Callzone | Pizza Margherita | qty_2 | `find_nearby→select_restaurant→menu_request→create_order→confirm_add_to_cart` | 1 | - | ✅ PASS | ok |
| 64 | Klaps Burgers | Głodzilla | full | `find_nearby→select_restaurant→menu_request→create_order→confirm_add_to_cart` | 1 | - | ✅ PASS | ok |
| 65 | Klaps Burgers | Głodzilla | alias | `find_nearby→select_restaurant→menu_request→create_order→confirm_add_to_cart` | 1 | - | ✅ PASS | ok |
| 66 | Klaps Burgers | Głodzilla | qty_2 | `find_nearby→select_restaurant→menu_request→find_nearby→confirm` | 0 | - | ❌ FAIL | no_order_intent (intents: find_nearby→select_restaurant→menu_request→find_nearby→confirm) |
| 67 | Klaps Burgers | Smak Vegas | full | `find_nearby→select_restaurant→menu_request→create_order→confirm_add_to_cart` | 1 | - | ✅ PASS | ok |
| 68 | Klaps Burgers | Smak Vegas | alias | `find_nearby→select_restaurant→menu_request→create_order→confirm_add_to_cart` | 1 | - | ✅ PASS | ok |
| 69 | Klaps Burgers | Smak Vegas | qty_2 | `find_nearby→select_restaurant→menu_request→find_nearby→confirm` | 0 | - | ❌ FAIL | no_order_intent (intents: find_nearby→select_restaurant→menu_request→find_nearby→confirm) |
| 70 | Klaps Burgers | Onionator | full | `find_nearby→select_restaurant→menu_request→UNKNOWN_INTENT→create_order` | 0 | - | ❌ FAIL | cart_empty (cartItems=0) |
| 71 | Klaps Burgers | Onionator | alias | `find_nearby→select_restaurant→menu_request→UNKNOWN_INTENT→create_order` | 0 | - | ❌ FAIL | cart_empty (cartItems=0) |
| 72 | Klaps Burgers | Onionator | qty_2 | `find_nearby→select_restaurant→menu_request→find_nearby→confirm` | 0 | - | ❌ FAIL | no_order_intent (intents: find_nearby→select_restaurant→menu_request→find_nearby→confirm) |

## Edge Tests

| test | PASS/FAIL | reason | details |
|------|-----------|--------|---------|
| EdgeTest::GhostCart | ✅ PASS | ok | SessionA confirmed. SessionB cartItems=0 |
| EdgeTest::TransactionLock | ✅ PASS | ok | After "pokaż restauracje": intent=confirm_add_to_cart source=confirm_add_to_cart_handler |

## Summary

- **Main scenarios:** 41/72 PASS
- **Edge tests:** 2/2 PASS
- **Total:** 43/74 PASS
- **State warnings:** 0 scenarios had FSM state issues