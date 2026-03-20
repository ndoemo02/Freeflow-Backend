/**
 * recoTelemetry.js  —  Reco V1 telemetry events
 * ────────────────────────────────────────────────
 * Thin wrapper over EventLogger for the four recommendation lifecycle events.
 *
 * Events:
 *   recommendation_shown          – recommendations attached to a brain response
 *   recommendation_clicked        – user tapped a recommendation card (frontend ping)
 *   recommendation_added_to_cart  – recommended item ended up in cart
 *   recommendation_ordered        – recommended item was part of a confirmed order
 *
 * All methods are fire-and-forget; caller must `.catch(() => {})` or let it be.
 * In test mode EventLogger is a no-op, so these are also safe in tests.
 */

import { EventLogger } from '../services/EventLogger.js';

const WORKFLOW_STEP = 'recommendations';

export const recoTelemetry = {
  /**
   * Fire when recommendations are attached to a brain response.
   * @param {string} sessionId
   * @param {{ item: object, score: number, why: string }[]} recommendations
   */
  async logShown(sessionId, recommendations) {
    return EventLogger.logEvent(
      sessionId,
      'recommendation_shown',
      {
        count: recommendations.length,
        items: recommendations.map(r => ({
          id:    r.item?.id,
          name:  r.item?.name,
          score: Number(r.score?.toFixed?.(3) ?? r.score),
          why:   r.why,
        })),
      },
      null,
      WORKFLOW_STEP,
      'success'
    );
  },

  /**
   * Fire when user clicks a recommendation card.
   * Called from a dedicated telemetry endpoint, not the brain pipeline.
   */
  async logClicked(sessionId, itemId, itemName) {
    return EventLogger.logEvent(
      sessionId,
      'recommendation_clicked',
      { item_id: itemId, item_name: itemName },
      null,
      WORKFLOW_STEP,
      'success'
    );
  },

  /**
   * Fire when a recommended item lands in the cart.
   */
  async logAddedToCart(sessionId, itemId, itemName) {
    return EventLogger.logEvent(
      sessionId,
      'recommendation_added_to_cart',
      { item_id: itemId, item_name: itemName },
      null,
      WORKFLOW_STEP,
      'success'
    );
  },

  /**
   * Fire when a recommended item is part of a confirmed order.
   */
  async logOrdered(sessionId, itemId, itemName) {
    return EventLogger.logEvent(
      sessionId,
      'recommendation_ordered',
      { item_id: itemId, item_name: itemName },
      null,
      WORKFLOW_STEP,
      'success'
    );
  },
};
