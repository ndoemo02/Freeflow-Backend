/**
 * restaurantFeatureAdapter.ts — RE-EXPORT STUB
 * Source of truth: queryUnderstanding.ts
 */

export type {
  LegacyRestaurant, EnrichedRestaurant,
} from './queryUnderstanding.js';

export {
  mapRestaurantToFeatures,
  enrichRestaurant,
  resolvePriceLevel,
  resolveSupportsDelivery,
} from './queryUnderstanding.js';
