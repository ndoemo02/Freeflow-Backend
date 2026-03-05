# FreeFlow Pipeline Stability and Transaction Flow Improvements

## Overview
Recent changes focus on stabilizing the **Finite State Machine (FSM)** of the FreeFlow ordering pipeline. The goal was to ensure a deterministic journey from discovery to cart commitment, preventing unrelated user inputs or NLU fallbacks from derailing the transaction flow.

## 🛡️ Stability Guards (pipeline.js)

### 1. Expected Context Override (`EXPECTED_CONTEXT_OVERRIDE`)
- **Problem**: Confirmation words like "tak" or "ok" were sometimes being picked up as `generic_confirm` or `find_nearby`, losing the context of what was being confirmed.
- **Fix**: A hard guard that checks for `session.expectedContext` (e.g., `confirm_add_to_cart`). If the user says a confirmation word, the intent is forced to match the expected context.
- **Benefit**: Deterministic voice FSM patterns.

### 2. Transaction Lock (Priority Guard)
- **Problem**: Users saying unrelated things mid-ordering (e.g., "pokaż restauracje" while being asked to confirm) would break the ordering flow.
- **Fix**: If a `pendingOrder` exists, the pipeline blocks all intents except those related to ordering (`create_order`, `confirm_add_to_cart`, `remove_from_cart`, `confirm_order`, `cancel_order`).
- **Benefit**: Ensures the user stays within the transactional funnel until completion or explicit cancellation.

### 3. Floating pendingOrder Guard (Defense-in-Depth)
- **Problem**: Stale `pendingOrder` states could linger, causing a future "tak" to add an old item to the cart.
- **Fix**: Clears the `pendingOrder` if the final resolved intent is NOT ordering-related.
- **Benefit**: Self-healing session state.

### 4. Safety Timeout
- **Problem**: Transactions sitting idle for a long time could become ghost states.
- **Fix**: Automatically clears `pendingOrder` if it has lived longer than 60 seconds without confirmation.
- **Benefit**: Prevents unintended actions after long pauses.

### 5. Intent Confidence Floor (Disambiguation)
- **Problem**: Low-confidence NLU guesses (< 0.5) often led to incorrect handlers being triggered.
- **Fix**: Added a check that forces a disambiguation reply ("Nie jestem pewna, o co chodzi...") for low-surety results, except for rule-based guards.
- **Benefit**: Higher trust and clarity for the user.

## 🍽️ Ordering Logic Refinements

### 6. Dish Canonicalization Layer (`dishCanon.js`)
- **Problem**: Users use shorthand names (e.g., "żwirek") which might not match the full canonical menu name ("Żwirek i Muchomorek Standard").
- **Fix**: Pre-NLU step that matches user input against an alias index (full name, significant tokens, first-two-word combos).
- **Benefit**: Robust dish recognition for shorthand and partial matches.

### 7. Cart Deduplication (`sessionCart.js`)
- **Problem**: Repeatedly adding the same item created duplicate entries in the cart.
- **Fix**: Deduplication logic that increments the quantity (`qty`) of existing items instead of pushing new ones if the name and restaurant ID match.
- **Benefit**: Cleaner cart state and correct pricing totals.

### 8. Cart Mutation Whitelist
- **Problem**: The old guard was too strict, blocking `confirm_add_to_cart` from updating the cart.
- **Fix**: Introduced `CART_MUTATION_WHITELIST` allowing specific intents to modify the cart.
- **Benefit**: Fixed critical flow regression.

### 9. Location Extractor Blacklist (`extractors.js`)
- **Problem**: Verbs like "poproszę", "zamów", "pokaż" were sometimes picked up as city names.
- **Fix**: Expanded the blacklist to include common ordering verbs.
- **Benefit**: Prevents NLU from thinking the user is searching for a location when they are ordering.

### 10. contextUpdates Cleanup
- **Fix**: Ensured `pendingOrder: null` is explicitly set in `confirmAddToCartHandler.js` after a successful commit.
- **Benefit**: Prevents duplicate commits or stale states after a "green path" completion.

## 🧪 Testing Results
The flow has been verified using `run_flow_test.js` against live restaurant data (e.g., Klaps Burgers). All tests passed with **zero** guard blocks on the standard path while maintaining strong state isolation.
