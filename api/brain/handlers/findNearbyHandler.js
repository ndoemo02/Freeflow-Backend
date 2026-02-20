
/**
 * @deprecated THIS FILE IS ORPHANED AND LEGACY.
 * Use `api/brain/domains/food/findHandler.js` instead.
 * 
 * routing: defaultHandlers.food.find_nearby -> FindRestaurantHandler (V2 Domain)
 */

export async function handleFindNearby(ctx) {
  console.error("🚨 CRITICAL: handleFindNearby (legacy) called! This should not happen.");
  throw new Error("Legacy handler called. Use V2 pipeline.");
}
