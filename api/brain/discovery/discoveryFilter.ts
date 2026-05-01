/**
 * discoveryFilter.ts — RE-EXPORT STUB
 * Source of truth: queryUnderstanding.ts
 */

export type {
  ScoredRestaurant, ScoreBreakdown, DiscoveryFallback, DiscoveryResult,
} from './queryUnderstanding.js';

export {
  matchQueryToTaxonomy,
  buildChips,
  scoreRestaurant,
  filterRestaurantsByDiscovery,
  rankRestaurantsByDiscovery,
  runDiscovery,
  explainFilter,
} from './queryUnderstanding.js';
