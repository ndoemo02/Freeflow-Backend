# Cascade Test Report
_Generated: 2026-03-05T13:26:21.339Z_

## Main Scenarios

| # | restaurant | dish | scenario | intent_chain | cart_items | state_warns | PASS/FAIL | reason |
|---|-----------|------|----------|-------------|-----------|------------|-----------|--------|
| 1 | Bar Praha | Zupa czosnkowa | full | `find_nearby→select_restaurant→menu_request→create_order→confirm_add_to_cart` | 1 | - | ✅ PASS | ok |
| 2 | Bar Praha | Zupa czosnkowa | alias | `find_nearby→select_restaurant→menu_request→UNKNOWN_INTENT→create_order` | 0 | - | ❌ FAIL | cart_empty (cartItems=0) |
| 3 | Bar Praha | Zupa czosnkowa | qty_2 | `find_nearby→select_restaurant→menu_request→create_order→confirm_add_to_cart` | 1 | - | ✅ PASS | ok |
| 4 | Bar Praha | Smażony ser | full | `find_nearby→select_restaurant→menu_request→UNKNOWN_INTENT→create_order` | 0 | - | ❌ FAIL | cart_empty (cartItems=0) |
| 5 | Bar Praha | Smażony ser | alias | `find_nearby→select_restaurant→menu_request→UNKNOWN_INTENT→create_order` | 0 | - | ❌ FAIL | cart_empty (cartItems=0) |
| 6 | Bar Praha | Smażony ser | qty_2 | `find_nearby→select_restaurant→menu_request→create_order→confirm_add_to_cart` | 1 | - | ✅ PASS | ok |
| 7 | Bar Praha | Gulasz wieprzowy z knedlikiem | full | `find_nearby→select_restaurant→menu_request→create_order→choose_restaurant` | 0 | - | ❌ FAIL | cart_empty (cartItems=0) |
| 8 | Bar Praha | Gulasz wieprzowy z knedlikiem | alias | `find_nearby→select_restaurant→menu_request→create_order→choose_restaurant` | 0 | - | ❌ FAIL | cart_empty (cartItems=0) |
| 9 | Bar Praha | Gulasz wieprzowy z knedlikiem | qty_2 | `find_nearby→select_restaurant→menu_request→create_order→choose_restaurant` | 0 | - | ❌ FAIL | cart_empty (cartItems=0) |
| 10 | Restauracja Stara Kamienica | Rolada śląska z kluskami i modrą kapustą | full | `find_nearby→select_restaurant→menu_request→create_order→confirm_add_to_cart` | 1 | - | ✅ PASS | ok |
| 11 | Restauracja Stara Kamienica | Rolada śląska z kluskami i modrą kapustą | alias | `find_nearby→select_restaurant→menu_request→create_order→confirm_add_to_cart` | 1 | - | ✅ PASS | ok |
| 12 | Restauracja Stara Kamienica | Rolada śląska z kluskami i modrą kapustą | qty_2 | `find_nearby→select_restaurant→menu_request→create_order→confirm_add_to_cart` | 1 | - | ✅ PASS | ok |
| 13 | Restauracja Stara Kamienica | Żurek śląski na maślance | full | `find_nearby→select_restaurant→menu_request→create_order→confirm_add_to_cart` | 1 | - | ✅ PASS | ok |
| 14 | Restauracja Stara Kamienica | Żurek śląski na maślance | alias | `find_nearby→select_restaurant→menu_request→create_order→choose_restaurant` | 0 | - | ❌ FAIL | cart_empty (cartItems=0) |
| 15 | Restauracja Stara Kamienica | Żurek śląski na maślance | qty_2 | `find_nearby→select_restaurant→menu_request→create_order→confirm_add_to_cart` | 1 | - | ✅ PASS | ok |
| 16 | Dwór Hubertus | Ćwiartka kaczki | full | `find_nearby→select_restaurant→menu_request→UNKNOWN_INTENT→create_order` | 0 | - | ❌ FAIL | cart_empty (cartItems=0) |
| 17 | Dwór Hubertus | Ćwiartka kaczki | alias | `find_nearby→select_restaurant→menu_request→UNKNOWN_INTENT→create_order` | 0 | - | ❌ FAIL | cart_empty (cartItems=0) |
| 18 | Dwór Hubertus | Ćwiartka kaczki | qty_2 | `find_nearby→select_restaurant→menu_request→create_order→confirm_add_to_cart` | 1 | - | ✅ PASS | ok |
| 19 | Dwór Hubertus | Krem borowikowy | full | `find_nearby→select_restaurant→menu_request→UNKNOWN_INTENT→create_order` | 0 | - | ❌ FAIL | cart_empty (cartItems=0) |
| 20 | Dwór Hubertus | Krem borowikowy | alias | `find_nearby→select_restaurant→menu_request→UNKNOWN_INTENT→create_order` | 0 | - | ❌ FAIL | cart_empty (cartItems=0) |
| 21 | Dwór Hubertus | Krem borowikowy | qty_2 | `find_nearby→select_restaurant→menu_request→create_order→confirm_add_to_cart` | 1 | - | ✅ PASS | ok |
| 22 | Dwór Hubertus | Polędwica wieprzowa | full | `find_nearby→select_restaurant→menu_request→UNKNOWN_INTENT→create_order` | 0 | - | ❌ FAIL | cart_empty (cartItems=0) |
| 23 | Dwór Hubertus | Polędwica wieprzowa | alias | `find_nearby→select_restaurant→menu_request→UNKNOWN_INTENT→create_order` | 0 | - | ❌ FAIL | cart_empty (cartItems=0) |
| 24 | Dwór Hubertus | Polędwica wieprzowa | qty_2 | `find_nearby→select_restaurant→menu_request→create_order→confirm_add_to_cart` | 1 | - | ✅ PASS | ok |
| 25 | Rezydencja Luxury Hotel | Tagliatelle z krewetkami | full | `find_nearby→select_restaurant→menu_request→UNKNOWN_INTENT→create_order` | 0 | - | ❌ FAIL | cart_empty (cartItems=0) |
| 26 | Rezydencja Luxury Hotel | Tagliatelle z krewetkami | alias | `find_nearby→select_restaurant→menu_request→UNKNOWN_INTENT→create_order` | 0 | - | ❌ FAIL | cart_empty (cartItems=0) |
| 27 | Rezydencja Luxury Hotel | Tagliatelle z krewetkami | qty_2 | `find_nearby→select_restaurant→menu_request→create_order→confirm_add_to_cart` | 1 | - | ✅ PASS | ok |
| 28 | Klaps Burgers | Onionator | full | `find_nearby→select_restaurant→menu_request→UNKNOWN_INTENT→create_order` | 0 | - | ❌ FAIL | cart_empty (cartItems=0) |
| 29 | Klaps Burgers | Onionator | alias | `find_nearby→select_restaurant→menu_request→UNKNOWN_INTENT→create_order` | 0 | - | ❌ FAIL | cart_empty (cartItems=0) |
| 30 | Klaps Burgers | Onionator | qty_2 | `find_nearby→select_restaurant→menu_request→create_order→confirm_add_to_cart` | 1 | - | ✅ PASS | ok |

## Edge Tests

| test | PASS/FAIL | reason | details |
|------|-----------|--------|---------|
| EdgeTest::GhostCart | ✅ PASS | ok | SessionA confirmed. SessionB cartItems=0 |
| EdgeTest::TransactionLock | ✅ PASS | ok | After "pokaż restauracje": intent=confirm_add_to_cart source=confirm_add_to_cart_handler |

## Summary

- **Main scenarios:** 13/30 PASS
- **Edge tests:** 2/2 PASS
- **Total:** 15/32 PASS
- **State warnings:** 0 scenarios had FSM state issues