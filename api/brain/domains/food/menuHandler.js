/**
 * Food Domain: Menu Handler
 * Odpowiada za wyświetlanie karty dań (Menu).
 */

import { loadMenuPreview } from '../../menuService.js';
import { findRestaurantByName, getLocationFallback } from '../../locationService.js';
import { RESTAURANT_CATALOG } from '../../data/restaurantCatalog.js';


export class MenuHandler {

    async execute(ctx) {
        const { text, session, entities, sessionId } = ctx;
        if (!sessionId) {
            throw new Error("MenuHandler: sessionId missing");
        }
        console.log(`🧠 MenuHandler executing for session ${sessionId}. Text: "${text}"`);
        console.log(`🧠 MenuHandler: session lastRestaurant: ${session?.lastRestaurant?.name} (${session?.lastRestaurant?.id})`);
        console.log(`🧠 MenuHandler: entities:`, JSON.stringify(entities));

        // 1. Zidentyfikuj restaurację
        let restaurant = null;
        let matchedFromText = false;

        // A) Jawnie w tekście (ID z katalogu ma priorytet)
        if (entities?.restaurantId) {
            const catalogMatch = RESTAURANT_CATALOG.find(r => r.id === entities.restaurantId);
            if (catalogMatch) {
                restaurant = catalogMatch;
                matchedFromText = true;
            }
        }

        // B) Jawnie w tekście (nazwa jeśli ID brak - np. spoza katalogu)
        if (!restaurant && entities?.restaurant) {
            restaurant = await findRestaurantByName(entities.restaurant);
            if (restaurant) matchedFromText = true;
        }

        // C) Z sesji (Context)
        if (!restaurant) {
            restaurant = session?.lastRestaurant;
        }

        // 2. Walidacja: Brak restauracji
        if (!restaurant) {
            const fallback = await getLocationFallback(
                sessionId,
                session?.last_location,
                "Najpierw wybierz restaurację w {location}, a potem pokażę menu:\n{list}\n\nKtóra Cię interesuje?"
            );

            if (fallback) {
                return { reply: fallback };
            }

            return {
                reply: "Najpierw wybierz restaurację. Powiedz 'gdzie zjeść w pobliżu' aby zobaczyć listę.",
                contextUpdates: { expectedContext: 'find_nearby' }
            };
        }

        // 2.5 Base Context Updates
        const baseContextUpdates = {
            lastRestaurant: restaurant,
            expectedContext: 'create_order', // will be overwritten if matchedFromText
            lastIntent: 'menu_request',
            context: 'IN_RESTAURANT',
            lockedRestaurantId: restaurant.id
        };

        if (matchedFromText) {
            console.log(`🟢 MenuHandler: matched restaurant from text -> ${restaurant.name}, resetting conversation phase`);
            baseContextUpdates.currentRestaurant = restaurant;
            baseContextUpdates.conversationPhase = 'restaurant_selected';
            baseContextUpdates.last_restaurants_list = [];
            baseContextUpdates.expectedContext = 'menu_or_order';
        }

        // --- OPTIMIZATION: Task 2 - Menu Cache Shortcut ---
        const lastRestaurant = session?.lastRestaurant;
        const cachedRestaurantId = session?.last_menu_restaurant_id;
        const canUseCache =
            lastRestaurant &&
            restaurant.id === lastRestaurant.id &&
            cachedRestaurantId === restaurant.id &&
            session?.last_menu &&
            session.last_menu.length > 0;

        if (canUseCache) {
            console.log(`⚡ Cache Hit: Returning cached menu for ${lastRestaurant.name}`);
            console.log(`[MenuCache] HIT restaurant=${restaurant.id} items=${session.last_menu.length}`);
            const items = session.last_menu;

            // Anti-Loop for Cache
            if (session.lastIntent === 'show_menu' || session.lastIntent === 'menu_request') {
                return {
                    intent: 'menu_request', // Standard V2
                    reply: "Listę dań masz na ekranie. Czy coś wpadło Ci w oko?",
                    menuItems: items,
                    restaurants: [],
                    meta: { source: 'cache_anti_loop', latency_total_ms: 0 },
                    contextUpdates: { ...baseContextUpdates }
                };
            }

            return {
                intent: 'menu_request', // Standard V2
                reply: `Wybrano restaurację ${lastRestaurant.name}. Polecam: ${items.map(m => m.name).join(', ')}. Co podać?`,
                menuItems: items,
                restaurants: [],
                meta: { source: 'cache', latency_total_ms: 0 },
                contextUpdates: { ...baseContextUpdates }
            };
        }

        // 3. Pobierz Menu (DB)
        const preview = await loadMenuPreview(restaurant.id, {});

        if (!preview || !preview.menu || !preview.menu.length) {
            return {
                reply: `Przepraszam, ale nie mam jeszcze menu dla ${restaurant.name}.`,
            };
        }

        // 4. Formatowanie odpowiedzi
        const count = preview.menu.length;
        const shown = preview.shortlist.length;
        const listText = preview.shortlist.map(m => `${m.name} (${Number(m.price_pln).toFixed(2)} zł)`).join(", ");
        const intro = `Wybrano restaurację ${restaurant.name}. W menu m.in.:`;
        const closing = "Co podać?";
        const reply = `${intro}\n${listText}\n\n${closing}`;

        console.log(`✅ MenuHandler: showing ${shown}/${count} items for ${restaurant.name}`);

        return {
            intent: 'menu_request',
            reply,
            closing_question: closing,
            menuItems: preview.shortlist,
            menu: preview.shortlist, // Legacy compat
            restaurants: [],
            restaurant: restaurant,
            contextUpdates: {
                ...baseContextUpdates,
                last_menu: preview.menu, // FIX 1: Store FULL menu (all items) in context, not only shortlist (6), to support dish_guard matching items lower in the list
                last_menu_restaurant_id: restaurant.id
            },
            meta: { source: 'db' }
        };
    }
}
