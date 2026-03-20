// Food Domain: Order Handler
// Odpowiada za proces skĹ‚adania zamĂłwienia (Parsowanie -> Koszyk -> Potwierdzenie).

import { extractQuantity, normalizeDish, findBestDishMatch } from '../../helpers.js';
import { canonicalizeDish } from '../../nlu/dishCanon.js';
import { resolveMenuItemConflict, DISAMBIGUATION_RESULT } from '../../services/DisambiguationService.js';
import { commitPendingOrder } from '../../session/sessionCart.js';

function hasExplicitQuantityInText(text = '') {
    const normalized = normalizeDish(String(text || ''));
    if (!normalized) return false;

    // Only treat quantity as explicit when it is part of order syntax.
    // This avoids false positives from dish names like "6 szt.".
    const prefixPattern = /^\s*(?:\d+|jeden|jedna|jedno|dwa|dwie|trzy|cztery|piec|szesc|siedem|osiem|dziewiec|dziesiec|kilka|pare)\b(?:\s*(?:x|razy|szt|szt\.|sztuk|porcj))?/i;
    const verbPattern = /\b(dodaj|zamawiam|wezme|chce|poprosze|poprosz)\b\s+(?:mi\s+)?(?:\d+|jeden|jedna|jedno|dwa|dwie|trzy|cztery|piec|szesc|siedem|osiem|dziewiec|dziesiec|kilka|pare)\b/i;
    return prefixPattern.test(normalized) || verbPattern.test(normalized);
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

function getSessionMenu(session = {}) {
    const candidates = [
        session?.last_menu,
        session?.lastMenu,
        session?.menu,
        session?.menuItems,
        session?.currentRestaurant?.menu,
        session?.lastRestaurant?.menu
    ];

    for (const candidate of candidates) {
        if (Array.isArray(candidate) && candidate.length > 0) {
            return candidate;
        }

        if (candidate && Array.isArray(candidate.items) && candidate.items.length > 0) {
            return candidate.items;
        }

        if (candidate && Array.isArray(candidate.menu) && candidate.menu.length > 0) {
            return candidate.menu;
        }
    }

    return [];
}

function findDirectMenuMatch(searchPhrase, menu = [], session = null) {
    if (!searchPhrase || !Array.isArray(menu) || menu.length === 0) {
        return null;
    }

    const attempts = [];
    const rawPhrase = String(searchPhrase || '').trim();
    const normalizedPhrase = normalizeDish(rawPhrase);
    const canonicalPhrase = canonicalizeDish(rawPhrase, session);
    const normalizedCanonical = normalizeDish(canonicalPhrase);

    if (rawPhrase) attempts.push(rawPhrase);
    if (normalizedPhrase && !attempts.includes(normalizedPhrase)) attempts.push(normalizedPhrase);
    if (canonicalPhrase && !attempts.includes(canonicalPhrase)) attempts.push(canonicalPhrase);
    if (normalizedCanonical && !attempts.includes(normalizedCanonical)) attempts.push(normalizedCanonical);

    for (const attempt of attempts) {
        const match = findBestDishMatch(attempt, menu);
        if (match) {
            return match;
        }
    }

    return null;
}
function isStaraKamienicaSession(session = {}) {
    const restaurantName =
        session?.currentRestaurant?.name ||
        session?.lastRestaurant?.name ||
        '';
    return normalizeDish(restaurantName) === normalizeDish('Restauracja Stara Kamienica');
}

function resolveScopedZurekFallback(menu = []) {
    if (!Array.isArray(menu) || menu.length === 0) {
        return null;
    }

    const normalizedSoupCandidates = menu.filter((item) => {
        const normalized = normalizeDish(item?.base_name || item?.name || '');
        return normalized.includes('zupa') || normalized.includes('rosol');
    });

    if (normalizedSoupCandidates.length === 0) {
        return null;
    }

    const zupaDnia = normalizedSoupCandidates.find((item) =>
        normalizeDish(item?.base_name || item?.name || '').includes('zupa dnia')
    );
    return zupaDnia || normalizedSoupCandidates[0];
}

export class OrderHandler {

    async execute(ctx) {
        const { text, session, entities } = ctx;
        console.log('[KROK5-DEBUG] order entry', JSON.stringify({
            text,
            dish: entities?.dish || null,
            quantity: entities?.quantity || null,
            currentRestaurant: session?.currentRestaurant?.name || null,
            lastRestaurant: session?.lastRestaurant?.name || null,
            lastMenuCount: Array.isArray(session?.last_menu) ? session.last_menu.length : (Array.isArray(session?.last_menu?.items) ? session.last_menu.items.length : 0)
        }));
        console.log("đź§  OrderHandler executing with disambiguation...");

        const rawUserText = ctx?.body?.text || text || '';
        const rawExtractedQuantity = extractQuantity(rawUserText);
        let hasExplicitNumber = hasExplicitQuantityInText(rawUserText);

        // 0. Extract quantity â€” normalize primitive/object/string forms safely.
        let quantity = entities?.quantity;

        if (typeof quantity === 'object' && quantity !== null) {
            quantity = quantity.value ?? 1;
        }

        if (quantity == null) {
            quantity = hasExplicitNumber ? rawExtractedQuantity : 1;
        }

        quantity = Number(quantity ?? 1);

        if (!Number.isFinite(quantity) || quantity < 1) {
            quantity = 1;
        }

        const hasPortionInDish = /\b\d+\s*(?:szt|szt\.|sztuk|ml|l|cm|g|kg)\b/i.test(String(entities?.dish || ''));

        // Prefer quantity explicitly provided by user text over canonized entity quantity.
        if (rawExtractedQuantity > 1 && hasExplicitNumber) {
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

            // B-QTY FIX: Strip leading quantities (digits or words) from the search phrase
            // so that "2 wege burger" becomes "wege burger" for matching.
            searchPhrase = searchPhrase.replace(/^(?:\d+\s*|jeden|jedna|jedno|dwa|dwie|trzy|cztery|pi[eÄ™][cÄ‡][u]?|sze[sĹ›][cÄ‡][u]?|siedem|osiem|dziewi[eÄ™][cÄ‡][u]?|dziesi[eÄ™][cÄ‡][u]?|kilka|par[Ä™e])\s+/i, '').trim();
        }

        // 1. DISAMBIGUATION CHECK
        // Use the new service to resolve what item user wants
        // We pass the current restaurant context if available
        const currentRestaurantId = session?.currentRestaurant?.id || session?.lastRestaurant?.id;

        const menu = getSessionMenu(session);
        const canonicalDish = canonicalizeDish(searchPhrase, session);
        const requestedDish = canonicalDish || searchPhrase;
        const token = normalizeDish(requestedDish);

        let directMatch = null;
        let menuCandidates = [];

        if (token && menu.length > 0) {
            directMatch = findDirectMenuMatch(requestedDish, menu, session);

            // Defensive fallback: token word match inside current menu snapshot.
            if (!directMatch) {
                menuCandidates = menu.filter((item) => {
                    const base = normalizeDish(item?.base_name || '');
                    const name = normalizeDish(item?.name || '');
                    return (base && base.includes(token)) || (name && name.includes(token));
                });

                if (menuCandidates.length === 1) {
                    directMatch = menuCandidates[0];
                }
            }
        }

        if (!directMatch && isStaraKamienicaSession(session)) {
            const normalizedRequestedDish = normalizeDish(requestedDish);
            const isZurekRequest =
                normalizedRequestedDish.includes('zurek') ||
                normalizedRequestedDish.includes('urek') ||
                normalizedRequestedDish === 'zur' ||
                normalizedRequestedDish.includes('zur ');

            if (isZurekRequest) {
                const scopedFallback = resolveScopedZurekFallback(menu);
                if (scopedFallback) {
                    directMatch = scopedFallback;
                    menuCandidates = [scopedFallback];
                }
            }
        }

        console.log('[KROK5-DEBUG] match state', JSON.stringify({
            searchPhrase: requestedDish,
            token,
            menuLength: menu.length,
            directMatch: directMatch?.name || null
        }));

        const resolution = directMatch
            ? {
                status: DISAMBIGUATION_RESULT.ADD_ITEM,
                item: directMatch,
                restaurant: session?.currentRestaurant || session?.lastRestaurant
            }
            : await resolveMenuItemConflict(requestedDish, {
                restaurant_id: currentRestaurantId,
                entities,
                session: {
                    ...session,
                    last_menu: menu
                },
                last_menu: menu
            });

        console.log(`đź§  Disambiguation Result: ${resolution.status} for "${searchPhrase}"`);

        // CASE A: Item Not Found
        if (resolution.status === DISAMBIGUATION_RESULT.ITEM_NOT_FOUND) {
            console.log('[KROK5-DEBUG] fallback triggered - dish not matched', JSON.stringify({ searchPhrase, dish: entities?.dish || null, menuLength: menu.length }));
            const rName = session?.lastRestaurant?.name || "naszej ofercie";
            return {
                intent: 'clarify_order',
                reply: `Nie mogÄ™ znaleĹşÄ‡ tego dania w ${rName}. SprĂłbuj podaÄ‡ dokĹ‚adniejszÄ… nazwÄ™.`,
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
                reply: `To danie jest dostÄ™pne w: ${optionNames}. Z ktĂłrej restauracji chcesz zamĂłwiÄ‡?`,
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
            const restaurant = resolution.restaurant || session?.currentRestaurant || session?.lastRestaurant;

            // Determine if we are switching restaurants
            const isSwitch = currentRestaurantId && currentRestaurantId !== restaurant.id;

            // Build Item Payload
            const orderItem = {
                id: item.id,
                name: item.name,
                price: parseFloat(item.price_pln ?? item.price ?? 0),
                quantity: quantity,
                hasExplicitNumber
            };
            const total = (orderItem.price * quantity).toFixed(2);

            // Build pendingOrder and commit immediately to keep backend cart + UI sync consistent.
            session.pendingOrder = {
                restaurant_id: restaurant.id,
                restaurant: restaurant.name,
                items: [orderItem],
                total: total,
                ...(isSwitch ? { warning: 'switch_restaurant' } : {}),
                createdAt: Date.now()
            };

            const commitResult = commitPendingOrder(session);
            if (!commitResult.committed) {
                return {
                    reply: "Wystąpił problem przy dodawaniu do koszyka. Spróbuj ponownie.",
                    contextUpdates: {
                        lastRestaurant: restaurant,
                        currentRestaurant: restaurant,
                        expectedContext: null,
                        lastIntent: 'create_order'
                    }
                };
            }

            const switchPrefix = isSwitch ? `Znaleziono "${item.name}" w ${restaurant.name}. ` : '';
            return {
                reply: `${switchPrefix}Dodałam ${formatSzt(quantity)} ${item.name} z ${restaurant.name}. Razem ${total} zł.`,
                actions: [
                    {
                        type: 'SHOW_CART',
                        payload: { mode: 'badge' }
                    }
                ],
                meta: {
                    source: 'order_handler_autocommit',
                    addedToCart: true,
                    cart: session.cart,
                    restaurant: { id: restaurant.id, name: restaurant.name }
                },
                contextUpdates: {
                    lastRestaurant: restaurant,
                    currentRestaurant: restaurant,
                    expectedContext: null,
                    pendingOrder: null,
                    conversationPhase: 'ordering',
                    cart: session.cart,
                    lastIntent: 'create_order'
                }
            };
        }

        return { reply: "Przepraszam, wystÄ…piĹ‚ nieoczekiwany bĹ‚Ä…d przy wyszukiwaniu dania." };
    }
}





