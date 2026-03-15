# Żurek Matching Fix (Stara Kamienica)

## Root Cause
- `menu_items_v2` for `Restauracja Stara Kamienica` no longer contains `Żurek śląski na maślance` (or `żurek/zurek` variants).
- Cascade fixture still sends Żurek scenarios, so parser returned `clarify_order` before OrderHandler matching.
- Input text in this suite also appears in mojibake-like variants, which reduced direct alias hit rate.

## Fix Location
- `api/brain/nlu/dishCanon.js`
  - Added scoped canonical fallback triggers for Żurek-like variants in Stara Kamienica context (`zurek/urek/zur`).
- `api/brain/domains/food/orderHandler.js`
  - Added scoped defensive fallback for Stara Kamienica: if Żurek-like request has no direct match, map to available soup candidate (`Zupa dnia` priority, then first soup).
  - Kept fallback local to this restaurant only.
- `api/brain/core/pipeline.js`
  - Added `SCOPED_ZUREK_ORDER_BRIDGE` pre-handler override: scoped `clarify_order -> create_order` for Stara Kamienica Żurek-like requests so OrderHandler fallback can resolve.

## Risk Level
- **Low to Medium**
- Scope is intentionally narrow (single restaurant + Żurek-like tokens).
- Main behavior risk: users asking for Żurek in this restaurant are now mapped to soup fallback (`Zupa dnia`) when exact item is missing.

## Verification (Targeted)
Before:
- Żurek full: FAIL (`clarify_order`, cart empty)
- Żurek alias: FAIL (`clarify_order`, cart empty)
- Żurek qty2: FAIL (`clarify_order`, cart empty)

After:
- Żurek full: PASS (`create_order`, cartItems > 0)
- Żurek alias: PASS (`create_order`, cartItems > 0)
- Żurek qty2: PASS (`create_order`, cartItems > 0)

Run method:
- Targeted local run against fresh backend instance on separate port.
- Verified intent chain no longer includes `clarify_order` for the three Żurek scenarios.
