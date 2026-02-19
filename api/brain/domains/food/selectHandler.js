
import { getSession, updateSession } from '../../session/sessionStore.js';
import { fuzzyMatch } from '../../helpers.js';
import { extractOrdinal } from '../../core/ConversationGuards.js';

export class SelectRestaurantHandler {

    async execute(ctx) {
        const { text, session } = ctx;
        console.log(`🧠 SelectRestaurantHandler executing... Pending Dish: "${session?.pendingDish}"`);

        // UX Guard 3: If currentRestaurant already set and user confirms same restaurant
        // Skip re-selection, go directly to menu/order prompt
        if (session?.currentRestaurant) {
            const currentName = session.currentRestaurant.name?.toLowerCase() || '';
            const inputLower = text.toLowerCase();

            // Check if user is confirming or mentioning current restaurant
            if (fuzzyMatch(currentName, inputLower) || inputLower.includes(currentName.substring(0, 5))) {
                console.log(`✨ UX Guard 3: Already at ${session.currentRestaurant.name}, skipping re-selection.`);
                return {
                    reply: `Jesteś już w ${session.currentRestaurant.name}. Co chcesz zamówić?`,
                    contextUpdates: {
                        expectedContext: 'create_order'
                    },
                    meta: { source: 'already_at_restaurant' }
                };
            }
        }

        const list = session?.last_restaurants_list || [];
        if (!list || list.length === 0) {
            // UX: If we have currentRestaurant but no list, use current
            if (session?.currentRestaurant) {
                return {
                    reply: `Jesteś już w ${session.currentRestaurant.name}. Co chcesz zamówić?`,
                    contextUpdates: { expectedContext: 'create_order' }
                };
            }
            // No list and no current restaurant → ask to narrow down, but NO reset
            return {
                reply: "Nie mam listy restauracji do wyboru. Czy możesz podać nazwę restauracji lub powiedz 'znajdź restaurację'?",
                contextUpdates: { expectedContext: 'select_restaurant' }
            };
        }

        let selected = null;

        // 0. Try by Polish ordinal words (Fix A2)
        const ordinalIndex = extractOrdinal(text);
        if (ordinalIndex !== null) {
            const idx = ordinalIndex - 1; // 1-based to 0-based
            if (idx >= 0 && idx < list.length) {
                selected = list[idx];
                console.log(`🟢 SelectHandler: ordinal "${text}" → index ${ordinalIndex} → ${selected?.name}`);
            }
        }

        // 1. Try by Index (1, 2, 3...) — digit-only fallback
        if (!selected) {
            const numMatch = text.match(/(\d+)/);
            if (numMatch) {
                const idx = parseInt(numMatch[1], 10) - 1; // 1-based to 0-based
                if (idx >= 0 && idx < list.length) {
                    selected = list[idx];
                }
            }
        }

        // 2. Try by Name (Fuzzy)
        if (!selected) {
            // Check against list names
            // Simple inclusion/fuzzy
            for (const r of list) {
                if (fuzzyMatch(r.name, text) || text.toLowerCase().includes(r.name.toLowerCase())) {
                    selected = r;
                    break;
                }
            }
        }

        if (!selected) {
            return {
                reply: `Nie wiem którą restaurację z listy masz na myśli. Wybierz numer od 1 do ${list.length}.`,
            };
        }

        // 3. Selection Success
        // Build currentRestaurant object for persistence
        const currentRestaurant = {
            id: selected.id,
            name: selected.name,
            city: selected.city || null
        };

        // Feature: Auto-convert to order if we have a pending dish remembered
        if (session?.pendingDish) {
            const dishName = session.pendingDish;
            return {
                reply: `Wybrano ${selected.name}. Rozpoczynam zamawianie: ${dishName}. Coś jeszcze?`,
                should_reply: true,
                actions: [
                    {
                        type: 'create_order',
                        payload: {
                            restaurant: selected,
                            restaurant_id: selected.id,
                            items: [{ name: dishName, quantity: 1 }]
                        }
                    }
                ],
                contextUpdates: {
                    currentRestaurant, // NEW: Persistent restaurant
                    lastRestaurant: selected,
                    lockedRestaurantId: selected.id,
                    expectedContext: 'confirm_order', // Use FSM, not context: 'IN_RESTAURANT'
                    pendingDish: null // Consume the memory
                },
                meta: { source: 'selection_auto_order' }
            };
        }

        return {
            reply: `Wybrano ${selected.name}. Co chcesz zrobić? (Pokaż menu lub zamawiam)`,
            contextUpdates: {
                currentRestaurant, // NEW: Persistent restaurant
                lastRestaurant: selected,
                lockedRestaurantId: selected.id,
                expectedContext: 'restaurant_menu' // Use FSM, not context: 'IN_RESTAURANT'
            },
            meta: { source: 'selection_handler' }
        };
    }
}
