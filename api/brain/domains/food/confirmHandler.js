/**
 * Food Domain: Confirm Order Handler
 * ═══════════════════════════════════════════════════════════════════════════
 * Odpowiada za finalizację zamówienia i zamknięcie sesji.
 * 
 * WAŻNE: To jest JEDYNE miejsce gdzie zamówienie jest zapisywane do DB.
 * Zapis następuje PO commit do session, PRZED streamem/TTS.
 * 
 * CONVERSATION BOUNDARY: This handler CLOSES the conversation.
 * After this, a new session_id will be generated for the next input.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { persistOrderToDB } from '../../services/OrderPersistence.js';
import { closeConversation } from '../../session/sessionStore.js';
import { commitPendingOrder } from '../../session/sessionCart.js';

export class ConfirmOrderHandler {

    async execute(ctx) {
        const { session, sessionId } = ctx;
        console.log("🧠 ConfirmOrderHandler executing...");

        // 1. Walidacja: Czy mamy co potwierdzać?
        const pendingOrder = session?.pendingOrder;

        if (!pendingOrder || !pendingOrder.items || pendingOrder.items.length === 0) {
            return {
                reply: "Ale Twój koszyk jest pusty. Co dodać do zamówienia?",
                contextUpdates: { expectedContext: 'menu_or_order' }
            };
        }

        // 2. Capture items descriptions BEFORE commit (which deletes pendingOrder)
        const itemsList = pendingOrder.items.map(i => `${i.quantity || i.qty || 1}x ${i.name}`).join(", ");
        const restaurantId = pendingOrder.restaurant_id;
        const restaurantName = pendingOrder.restaurant;

        // 3. Wykonaj akcję - Commit items to session cart (SYNCHRONOUS ATOMICITY)
        const commitResult = commitPendingOrder(session);

        if (!commitResult.committed) {
            return {
                reply: "Wystąpił problem przy dodawaniu do koszyka. Spróbuj raz jeszcze.",
            };
        }

        // ═══════════════════════════════════════════════════════════════════
        // CLEAR CART: Wyczyść koszyk w backendzie po złożeniu zamówienia
        // To zapobiega 'ghost cart' na nowej sesji.
        // ═══════════════════════════════════════════════════════════════════
        session.cart = { items: [], total: 0 };

        // ═══════════════════════════════════════════════════════════════════
        // 4. PERSIST TO DB - DISABLED (New Workflow: Voice -> Cart -> Manual UI -> DB)
        // Zamówienie trafia tylko do koszyka w sesji. Zapis do DB następuje
        // dopiero po manualnym potwierdzeniu w UI (CartContext.jsx).
        // ═══════════════════════════════════════════════════════════════════
        let orderId = null;
        console.log(`🛒 Order added to cart session. Persistence deferred to manual checkout.`);

        // ═══════════════════════════════════════════════════════════════════
        // 5. CONVERSATION BOUNDARY: Close this conversation
        // Next user input will get a new session_id
        // ═══════════════════════════════════════════════════════════════════
        const closureResult = closeConversation(sessionId, 'ORDER_CONFIRMED');
        console.log(`🔒 Conversation closed. Next session: ${closureResult.newSessionId}`);

        // 6. Budowanie odpowiedzi
        const intro = `Dodano do koszyka. `;
        const closing = `Coś jeszcze?`;
        const reply = `${intro}${closing}`;

        return {
            reply,
            closing_question: "Coś jeszcze?",
            should_reply: true,
            intent: 'confirm_order',
            // Order ID z DB
            order_id: orderId,
            // NEW: Session lifecycle info for frontend
            conversationClosed: true,
            newSessionId: closureResult.newSessionId,
            closedReason: 'ORDER_CONFIRMED',
            // Actions for Frontend (Task 2)
            actions: [
                {
                    type: "SHOW_CART",
                    payload: { mode: "summary" }
                }
            ],
            // Data for items visibility
            meta: {
                cart: session.cart,
                order_id: orderId,
                transaction_status: 'success',
                persisted: !!orderId,
                source: 'confirm_handler',
                conversationClosed: true
            },
            // NOTE: contextUpdates help keep the frontend state clean when session is closed
            contextUpdates: {
                expectedContext: null,
                pendingOrder: null,
                lastIntent: 'order_complete',
                lastOrderId: orderId,
                conversationPhase: 'idle'
            }
        };
    }
}
