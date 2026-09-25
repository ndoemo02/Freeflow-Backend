/**
 * Food Domain: Confirm Order Handler
 * ═══════════════════════════════════════════════════════════════════════════
 * Voice confirmation ("to wszystko") commits the pending items to the session
 * cart and asks the frontend to show it for manual review.
 *
 * It does NOT complete the order: the session, restaurant context and cart stay
 * editable so the customer can reconnect and correct the order by voice. The
 * order is persisted and the session cart cleared only on manual submission
 * (POST /api/orders).
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { commitPendingOrder } from '../../session/sessionCart.js';

export class ConfirmOrderHandler {

    async execute(ctx) {
        const { session } = ctx;
        console.log("🧠 ConfirmOrderHandler executing...");

        // 1. Walidacja: Czy mamy co potwierdzać?
        const pendingOrder = session?.pendingOrder;

        if (!pendingOrder || !pendingOrder.items || pendingOrder.items.length === 0) {
            return {
                reply: "Ale Twój koszyk jest pusty. Co dodać do zamówienia?",
                contextUpdates: { expectedContext: 'menu_or_order' }
            };
        }

        const restaurantId = pendingOrder.restaurant_id;
        const restaurantName = pendingOrder.restaurant;

        // 2. Commit items to session cart (SYNCHRONOUS ATOMICITY)
        const commitResult = commitPendingOrder(session);

        if (!commitResult.committed) {
            return {
                reply: "Wystąpił problem przy dodawaniu do koszyka. Spróbuj raz jeszcze.",
            };
        }

        console.log(`🛒 Order added to cart session. Persistence deferred to manual checkout.`);

        return {
            reply: `Dodano do koszyka. Coś jeszcze?`,
            closing_question: "Czy chcesz jeszcze coś zamówić?",
            should_reply: true,
            intent: 'confirm_order',
            order_id: null,
            conversationClosed: false,
            actions: [
                {
                    type: "SHOW_CART",
                    payload: { mode: "summary" }
                }
            ],
            meta: {
                cart: session.cart,
                order_id: null,
                transaction_status: 'success',
                persisted: false,
                source: 'confirm_handler',
                conversationClosed: false,
                cartReview: {
                    restaurantId: restaurantId || null,
                    restaurantName: restaurantName || null,
                    total: session?.cart?.total || 0,
                    itemCount: (session?.cart?.items || []).length,
                }
            },
            contextUpdates: {
                expectedContext: null,
                pendingOrder: null,
                pendingDish: null,
                awaiting: null,
            }
        };
    }
}
