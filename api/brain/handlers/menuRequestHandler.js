import { getSession, updateSession } from "../context.js";
import { findRestaurantByName, getLocationFallback } from "../locationService.js";
import { loadMenuPreview } from "../menuService.js";

export async function handleMenuRequest({ text, sessionId, prevLocation, parsed, withDb }) {
  console.log("🧠 menu_request handler");
  updateSession(sessionId, { expectedContext: null });

  let replyCore = "";
  let meta = {};

  let verifiedRestaurant = null;
  if (parsed?.restaurant) {
    verifiedRestaurant = await findRestaurantByName(parsed.restaurant);
    if (verifiedRestaurant) {
      updateSession(sessionId, { lastRestaurant: verifiedRestaurant });
      console.log(`✅ Restaurant set from text: ${verifiedRestaurant.name}`);
    } else {
      console.warn(`⚠️ Restaurant "${parsed.restaurant}" not found`);
      const fallback = await getLocationFallback(
        sessionId,
        prevLocation,
        `Nie znalazłam "${parsed.restaurant}", ale w {location} mam:\n{list}\n\nKtórą wybierasz?`
      );
      if (fallback) {
        replyCore = fallback;
        return { reply: replyCore, meta };
      }
      replyCore = `Nie znalazłam restauracji o nazwie "${parsed.restaurant}". Możesz wybrać z tych, które są w pobliżu?`;
      return { reply: replyCore, meta };
    }
  }

  const current = verifiedRestaurant || getSession(sessionId)?.lastRestaurant;
  if (!current) {
    console.warn("⚠️ No restaurant in context for menu_request");
    const fallback = await getLocationFallback(
      sessionId,
      prevLocation,
      `Najpierw wybierz restaurację z tych w pobliżu:\n{list}\n\nKtórą wybierasz?`
    );
    if (fallback) {
      replyCore = fallback;
      return { reply: replyCore, meta };
    }
    replyCore = getSession(sessionId)?.isTest
      ? "Brak lokalizacji. Podaj nazwę miasta (np. Bytom) lub powiedz 'w pobliżu'."
      : "Najpierw wybierz restaurację, a potem pokażę menu. Powiedz 'gdzie zjeść' aby zobaczyć opcje.";
    return { reply: replyCore, meta };
  }

  const preview = await loadMenuPreview(current.id, { withDb });
  if (!preview.menu.length) {
    replyCore = `W bazie nie ma pozycji menu dla ${current.name}. Mogę:
1) pokazać podobne lokale,
2) dodać szybki zestaw przykładowych pozycji do testów.
Co wybierasz?`;
    return { reply: replyCore, meta };
  }

  updateSession(sessionId, {
    // Keep full menu in session for reliable item resolution in order flow.
    last_menu: preview.menu,
    last_menu_restaurant_id: current.id,
    lastRestaurant: current,
  });
  console.log(`✅ Menu loaded: ${preview.menu.length} items (showing ${preview.shortlist.length}) from ${current.name}`);

  replyCore =
    `W ${current.name} dostępne m.in.: ` +
    preview.shortlist.map((m) => `${m.name} (${Number(m.price_pln).toFixed(2)} zł)`).join(", ") +
    ". Co chciałbyś zamówić?";

  return { reply: replyCore, meta };
}

