# PR Ready: NLU discovery + compound + checkout bridge hardening

Data: 2026-03-27  
Branch: `codex/hotfix-discovery-guard`

## Scope (final splice)

This branch consolidates three high-impact fixes in NLU/order routing:

1. Discovery override in active restaurant context  
   - Keep explicit city/discovery prompts in `find_nearby` flow.
   - Prevent accidental fallback to `create_order`.

2. Compound parser regression prevention  
   - Prevent whole-phrase collapse before segment split.
   - Keep multi-item orders stable.

3. Checkout/cart command bridge  
   - Map phrases like `przejdzmy do koszyka`, `pokaz koszyk`, `checkout` to `open_checkout`.
   - Avoid `clarify_order -> Nie rozumiem` for cart navigation commands.

## Collision check (no blocker found)

### A) `restaurant_navigation_override` vs compound parser
- `restaurant_navigation_override` executes before dish fallback paths.
- compound flow is still triggered for explicit ordering utterances.
- No intent shadowing observed in code path ordering.

### B) compound parser vs checkout bridge
- checkout bridge uses explicit command regex (cart/checkout verbs).
- compound parser continues to own dish phrases with quantity/items.
- No overlap in intent routing intent-by-intent.

### C) checkout bridge vs menu/discovery intents
- checkout regex requires explicit checkout/cart semantics.
- menu/discovery explicit paths remain intact.
- Added traces improve observability for edge mismatches.

## Trace normalization added

### New
- `CHECKOUT_BRIDGE_TRACE`
- `DISCOVERY_CONTEXT_OVERRIDE_TRACE`

### Existing retained
- `COMPOUND_RAW_TRACE`
- `QUANTITY_SEGMENT_TRACE`
- `COMPOUND_HEURISTIC_TRACE`
- `SAFE_CANON_ITEM_TRACE`
- `COMPOUND_CANON_TRACE`
- `SINGLE_COMPOUND_ALLOW_TRACE`
- `ORDER_MODE_TRACE`
- `CHECKOUT_PROGRESS_TRACE`
- `CART_EVENT_TRACE`
- `RESTAURANT_LOCK_TRACE`

## Targeted test matrix (token-efficient)

| Area | Test file | Expected |
|---|---|---|
| Checkout bridge | `api/brain/tests/checkout_cart_bridge.test.js` | `open_checkout` for cart commands |
| Compound parser | `api/brain/tests/compoundOrderParser.test.js` | multi-item split preserved |
| Discovery override | `api/brain/tests/nlu_regression_matrix.test.js` | city/discovery stays `find_nearby` |

Notes:
- In this environment, Vitest execution can fail due to host `EPERM spawn` (esbuild runtime restriction).  
- Syntax gate passed via `node --check`.

## Final PR description (copy/paste)

Title:
`fix(nlu): harden discovery + compound + checkout routing with explicit bridge traces`

Body:
```md
### What this PR fixes
- Keeps explicit city/discovery commands in `find_nearby` even when a restaurant is active.
- Prevents compound utterance collapse before proper segmentation.
- Adds explicit cart/checkout command bridge (`open_checkout`) for phrases like:
  - "przejdzmy do koszyka"
  - "pokaz koszyk"
  - "checkout"

### Why
Users could hit:
- discovery command interpreted as ordering fallback
- cart navigation command routed to `clarify_order` and "Nie rozumiem tego polecenia"

### Safety
- No reorder of GuardChain
- No response contract change
- No autocommit/order lifecycle changes

### Observability
Added:
- `CHECKOUT_BRIDGE_TRACE`
- `DISCOVERY_CONTEXT_OVERRIDE_TRACE`

Retained existing compound/order traces for continuity.

### Validation
- `node --check` on changed NLU files: PASS
- Targeted tests prepared:
  - `checkout_cart_bridge.test.js`
  - `compoundOrderParser.test.js`
  - `nlu_regression_matrix.test.js`
```

