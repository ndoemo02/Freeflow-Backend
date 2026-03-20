/**
 * Food Domain: Confirm Add to Cart
 * Mikro-akcja potwierdzająca dodanie do koszyka.
 * 
 * CONVERSATION BOUNDARY: This handler CLOSES the conversation.
 * After adding an item to cart, the next input starts a new session.
 * 
 * CART AUTHORITY: Backend is the single source of truth for cart state.
 * This handler mutates session.cart directly, then returns meta.cart
 * for frontend to render via syncCart (replace, not merge).
 */

import { updateSession } from '../../session/sessionStore.js';
import { commitPendingOrder } from '../../session/sessionCart.js';
import crypto from 'node:crypto';

export class ConfirmAddToCartHandler {
    async execute(ctx) {
        const { session, entities, sessionId } = ctx;

        // ═══════════════════════════════════════════════════════════════════
        // CART MUTATION: Commit pendingOrder to session.cart (backend is SSoT)
        // ═══════════════════════════════════════════════════════════════════
        const pendingOrder = session?.pendingOrder;

        if (!pendingOrder || !pendingOrder.items) {
            const dish = entities?.dish || session?.pendingDish;
            if (!dish) {
                return {
                    reply: "Co chcesz dodać do koszyka?",
                    contextUpdates: { expectedContext: 'create_order' }
                };
            }
            return {
                reply: "Nie widzę Twojego zamówienia. Możesz powtórzyć?",
                contextUpdates: { expectedContext: 'create_order' }
            };
        }

        const restaurantName = pendingOrder.restaurant || 'restauracji';
        const restaurantId = pendingOrder.restaurant_id;
        const dish = pendingOrder.items[0]?.name || 'danie';

        // Wykonaj akcję - Commit items to session cart (SYNCHRONOUS ATOMICITY)
        const commitResult = commitPendingOrder(session);

        if (!commitResult.committed) {
            return {
                reply: "Wystąpił problem przy dodawaniu do koszyka. Spróbuj raz jeszcze.",
                contextUpdates: { expectedContext: 'confirm_add_to_cart' }
            };
        }

        console.log(`🛒 Item added to cart. Session continues.`);

        // Set lastCartMutation for deterministic EVENT_CART_UPDATED payload
        // (pipeline reads this instead of fragile items[last])
        if (!session.meta) session.meta = {};
        session.meta.lastCartMutation = {
            name: dish,
            quantity: pendingOrder.items[0]?.qty || pendingOrder.items[0]?.quantity || 1,
            category: pendingOrder.items[0]?.category || null
        };

        return {
            reply: `Dodano ${dish} z ${restaurantName} do koszyka. Coś jeszcze?`,
            should_reply: true,
            conversationClosed: false,
            actions: [
                {
                    type: 'SHOW_CART',
                    payload: { mode: 'badge' }
                }
            ],
            contextUpdates: {
                pendingOrder: null,
                pendingDish: null,
                expectedContext: null,
                conversationPhase: 'ordering',
                cart: session.cart
            },
            meta: {
                source: 'confirm_add_to_cart_handler',
                conversationClosed: false,
                cart: session.cart,
                restaurant: { name: restaurantName, id: restaurantId }
            }
        };
    }
}
