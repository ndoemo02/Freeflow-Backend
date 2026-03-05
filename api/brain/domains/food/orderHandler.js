// Food Domain: Order Handler
// Odpowiada za proces składania zamówienia (Parsowanie -> Koszyk -> Potwierdzenie).

import { extractQuantity, normalizeDish } from '../../helpers.js';
import { resolveMenuItemConflict, DISAMBIGUATION_RESULT } from '../../services/DisambiguationService.js';

function hasExplicitQuantityInText(text = '') {
    const normalized = normalizeDish(String(text || ''));
    if (!normalized) return false;

    const numberPattern = /\b\d+\s*(?:x|razy|szt|szt\.|sztuk|porcj|ml|l|cm|g|kg)?\b/i;
    const wordPattern = /\b(jeden|jedna|jedno|dwa|dwie|trzy|cztery|piec|szesc|siedem|osiem|dziewiec|dziesiec|kilka|pare)\b/i;
    return numberPattern.test(normalized) || wordPattern.test(normalized);
}

function formatSzt(quantity) {
    const q = Math.max(1, Math.floor(Number(quantity) || 1));
    const mod10 = q % 10;
    const mod100 = q % 100;
    let form = 'sztuk';

    if (q === 1) {
        form = 'sztuka';
    } else if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) {
        form = 'sztuki';
    }

    return `${q} ${form}`;
}

export class OrderHandler {

    async execute(ctx) {
        const { text, session, entities } = ctx;
        console.log("🧠 OrderHandler executing with disambiguation...");

        const rawUserText = ctx?.body?.text || text || '';
        const rawExtractedQuantity = extractQuantity(rawUserText);

        // 0. Extract quantity — normalize primitive/object/string forms safely.
        let quantity = entities?.quantity;

        if (typeof quantity === 'object' && quantity !== null) {
            quantity = quantity.value ?? 1;
        }

        quantity = Number(quantity ?? extractQuantity(text) ?? 1);

        if (!Number.isFinite(quantity) || quantity < 1) {
            quantity = 1;
        }

        let hasExplicitNumber = hasExplicitQuantityInText(rawUserText);
        const hasPortionInDish = /\b\d+\s*(?:szt|szt\.|sztuk|ml|l|cm|g|kg)\b/i.test(String(entities?.dish || ''));

        // Prefer quantity explicitly provided by user text over canonized entity quantity.
        if (rawExtractedQuantity > 1) {
            quantity = rawExtractedQuantity;
            hasExplicitNumber = true;
        }

        // If quantity likely came from canonicalized dish name (e.g. "6 szt.")
        // and user didn't provide quantity explicitly, default to single item.
        if (!hasExplicitNumber && hasPortionInDish) {
            quantity = 1;
            hasExplicitNumber = false;
        }

        // Use the dish resolved by NLU (e.g. from ordinal selection) or fallback to raw text
        let searchPhrase = entities?.dish || text || "";

        if (typeof searchPhrase === "string") {
            // Remove parenthetical canonicalization hints, e.g. "Dish Name (alias)"
            searchPhrase = searchPhrase.replace(/\s*\([^)]*\)/g, "").trim();
        }

        // 1. DISAMBIGUATION CHECK
        // Use the new service to resolve what item user wants
        // We pass the current restaurant context if available
        const currentRestaurantId = session?.currentRestaurant?.id || session?.lastRestaurant?.id;

        const menu = Array.isArray(session?.last_menu) ? session.last_menu : [];
        const token = normalizeDish(searchPhrase);

        let directMatch = null;
        if (token && menu.length > 0) {
            directMatch = menu.find(i => i.base_name && normalizeDish(i.base_name) === token);

            if (!directMatch) {
                directMatch = menu.find(i => normalizeDish(i.name || '') === token);
            }

            if (!directMatch) {
                directMatch = menu.find(i => normalizeDish(i.name || '').includes(token));
            }
        }

        const resolution = directMatch
            ? {
                status: DISAMBIGUATION_RESULT.ADD_ITEM,
                item: directMatch,
                restaurant: session?.currentRestaurant || session?.lastRestaurant
            }
            : await resolveMenuItemConflict(searchPhrase, {
                restaurant_id: currentRestaurantId,
                entities,
                session
            });

        console.log(`🧠 Disambiguation Result: ${resolution.status} for "${searchPhrase}"`);

        // CASE A: Item Not Found
        if (resolution.status === DISAMBIGUATION_RESULT.ITEM_NOT_FOUND) {
            const rName = session?.lastRestaurant?.name || "naszej ofercie";
            return {
                intent: 'clarify_order',
                reply: `Nie mogę znaleźć tego dania w ${rName}. Spróbuj podać dokładniejszą nazwę.`,
                contextUpdates: {
                    expectedContext: 'clarify_order'
                }
            };
        }

        // CASE B: Disambiguation Required (Multi-match, no context)
        if (resolution.status === DISAMBIGUATION_RESULT.DISAMBIGUATION_REQUIRED) {
            const options = resolution.candidates.slice(0, 3); // Limit to 3
            const optionNames = options.map(o => o.restaurant.name).join(", ");

            return {
                reply: `To danie jest dostępne w: ${optionNames}. Z której restauracji chcesz zamówić?`,
                contextUpdates: {
                    expectedContext: 'choose_restaurant',
                    pendingDisambiguation: resolution.candidates // Store for next turn
                }
            };
            // Note: NLU needs to handle 'choose_restaurant' context next
        }

        // CASE C: Success (Single Item Resolved)
        if (resolution.status === DISAMBIGUATION_RESULT.ADD_ITEM) {
            const item = resolution.item;
            const restaurant = resolution.restaurant;

            // Determine if we are switching restaurants
            const isSwitch = currentRestaurantId && currentRestaurantId !== restaurant.id;

            // Build Item Payload
            const orderItem = {
                id: item.id,
                name: item.name,
                price: parseFloat(item.price_pln),
                quantity: quantity,
                hasExplicitNumber
            };
            const total = (orderItem.price * quantity).toFixed(2);

            // Construct Reply
            let reply = "";
            let contextUpdate = {};

            if (isSwitch) {
                // WARN USER about switch!
                reply = `Znaleziono "${item.name}" w ${restaurant.name}. `;
                // Auto-switch logic could be here, but safer to ask?
                // For now, let's assume aggressive helpfulness -> Auto Switch + Inform
                reply += `Dodałam do nowego zamówienia. Razem ${total} zł. Potwierdzasz?`;

                // Clear old cart if needed, or strictly overwrite pendingOrder
                contextUpdate = {
                    lastRestaurant: restaurant, // UPDATE CONTEXT
                    currentRestaurant: restaurant, // FIX: Nie resetuj currentRestaurant
                    pendingOrder: {
                        restaurant_id: restaurant.id,
                        restaurant: restaurant.name,
                        items: [orderItem],
                        total: total,
                        warning: 'switch_restaurant',
                        createdAt: Date.now()
                    }
                };

            } else {
                // Same restaurant or Fresh Start
                reply = `Dodałam ${formatSzt(quantity)} ${item.name} z ${restaurant.name}. Razem ${total} zł. Potwierdzasz?`;

                // If it's a fresh start, allow context set
                contextUpdate = {
                    lastRestaurant: restaurant,
                    currentRestaurant: restaurant, // FIX: Nie resetuj currentRestaurant
                    pendingOrder: {
                        restaurant_id: restaurant.id,
                        restaurant: restaurant.name,
                        items: [orderItem],
                        total: total,
                        createdAt: Date.now()
                    }
                };
            }

            return {
                reply,
                contextUpdates: {
                    ...contextUpdate,
                    expectedContext: 'confirm_add_to_cart',
                    lastIntent: 'create_order'
                }
            };
        }

        return { reply: "Przepraszam, wystąpił nieoczekiwany błąd przy wyszukiwaniu dania." };
    }
}
