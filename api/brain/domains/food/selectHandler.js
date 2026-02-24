
import { getSession, updateSession } from '../../session/sessionStore.js';
import { fuzzyMatch } from '../../helpers.js';

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

        const { entities } = ctx;

        // 🔥 Direct entity selection (when NLU resolved restaurantId via catalog match)
        // Fixes the NLU→Handler communication gap: router knows the restaurant,
        // handler was falling through to session list lookup and failing.
        if (entities?.restaurantId) {
            console.log(`🟢 SelectHandler: direct entity match → ${entities.restaurant} (id=${entities.restaurantId})`);

            const currentRestaurant = {
                id: entities.restaurantId,
                name: entities.restaurant,
                city: entities.location || null
            };

            return {
                reply: `Wybrano ${entities.restaurant}. Co chcesz zrobić? (Pokaż menu lub zamawiam)`,
                contextUpdates: {
                    currentRestaurant,
                    lastRestaurant: currentRestaurant,
                    lockedRestaurantId: entities.restaurantId,
                    expectedContext: 'restaurant_menu'
                },
                meta: { source: 'entity_direct_selection' }
            };
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

        // 1. Try numeric digit detection (e.g. "3", "wybieram 3")
        const numMatch = text.match(/\b(\d+)\b/);
        if (numMatch) {
            const idx = parseInt(numMatch[1], 10) - 1; // 1-based to 0-based
            if (idx >= 0 && idx < list.length) {
                selected = list[idx];
                console.log(`🟢 SelectHandler: numeric digit "${numMatch[1]}" → ${selected.name}`);
            }
        }

        // 2. Try Polish ordinal / number word mapping (1-10)
        if (!selected) {
            const POLISH_ORDINALS = {
                'jeden': 1, 'jedynka': 1, 'pierwsza': 1, 'pierwszy': 1, 'pierwsze': 1,
                'dwa': 2, 'dwojka': 2, 'druga': 2, 'drugi': 2, 'drugie': 2,
                'trzy': 3, 'trojka': 3, 'trzecia': 3, 'trzeci': 3, 'trzecie': 3,
                'cztery': 4, 'czworka': 4, 'czwarta': 4, 'czwarty': 4, 'czwarte': 4,
                'piec': 5, 'piatka': 5, 'piata': 5, 'piaty': 5, 'piate': 5,
                'szesc': 6, 'szostka': 6, 'szosta': 6, 'szosty': 6, 'szoste': 6,
                'siedem': 7, 'siodemka': 7, 'siodma': 7, 'siodmy': 7, 'siodme': 7,
                'osiem': 8, 'osemka': 8, 'osma': 8, 'osmy': 8, 'osme': 8,
                'dziewiec': 9, 'dziewiatka': 9, 'dziewiata': 9, 'dziewiaty': 9, 'dziewiate': 9,
                'dziesiec': 10, 'dziesiatka': 10, 'dziesiata': 10, 'dziesiaty': 10, 'dziesiate': 10
            };

            const normalizedText = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            // Split into words, removing punctuation
            const words = normalizedText.replace(/[^\w\s]/g, '').split(/\s+/);

            for (const word of words) {
                if (POLISH_ORDINALS[word]) {
                    const idx = POLISH_ORDINALS[word] - 1;
                    if (idx >= 0 && idx < list.length) {
                        selected = list[idx];
                        console.log(`🟢 SelectHandler: ordinal word "${word}" → ${selected.name}`);
                        break;
                    }
                }
            }
        }

        // 3. Try simple name fragment matching using `includes()`
        if (!selected) {
            const cleanText = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
            // Remove common filler words to extract the likely restaurant fragment
            const queryWords = cleanText.replace(/\b(wybieram|chce|wezme|poprosze|ta|to|ten)\b/g, '').trim();

            if (queryWords.length > 0) {
                for (const r of list) {
                    const rName = r.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
                    // Match if user's fragment is in the name, or name is in user's phrase
                    if (rName.includes(queryWords) || queryWords.includes(rName)) {
                        selected = r;
                        console.log(`🟢 SelectHandler: fragment match "${queryWords}" → ${selected.name}`);
                        break;
                    }
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
