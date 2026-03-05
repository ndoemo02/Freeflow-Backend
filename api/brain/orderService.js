import { extractQuantity } from "./helpers.js";
import { getMenuItems } from "./menuService.js";

export function normalize(text) {
  if (!text) return "";
  let s = text.toLowerCase();

  // Strip common ordering verbs and courtesy words
  s = s.replace(/\b(zamawiam|zamów|poproszę|poprosze|wezmę|wezme|chcę|chce|dodaj|biorę|biore|poproszę\s+o)\b/g, "");

  // Remove common quantity words
  s = s.replace(/\b(jeden|jedna|jedno|dwa|dwie|trzy|cztery|pięć|piec|dziesięć|dziesiec|kilka|parę|pare)\b/g, "");

  // New normalizations from Menu NLU migration
  s = s.replace(/\(.*?\)/g, '');
  s = s.replace(/\d+\s?(ml|l|cm|szt|szt\.|pcs)/gi, '');
  s = s.replace(/\b(double|standard)\b/gi, '');

  // Polish declension normalization (approximate to root)
  s = s.replace(/ę\b/g, "a"); // pizzę -> pizza
  s = s.replace(/ą\b/g, "a"); // pizzą -> pizza
  s = s.replace(/y\b/g, "a"); // rolady -> rolada (approx)
  s = s.replace(/e\b/g, "a"); // frytki -> frytka? No, but helps for "rolade" -> "rolada" (if misspelled) 
  // Actually, 'e' is tricky (burgery -> burgera?). Let's be careful.

  return s
    .replace(/restauracji|restauracja|w|u|na|do/g, "")
    .replace(/[-_]/g, " ")
    .replace(/[^a-ząćęłńóśźż0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a, b) {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

export function fuzzyMatch(a, b, threshold = 3) {
  if (!a || !b) return false;
  const normA = normalize(a);
  const normB = normalize(b);
  if (normA === normB) return true;
  if (normA.includes(normB) || normB.includes(normA)) return true;
  if (normA.split(" ")[0] === normB.split(" ")[0]) return true;
  const dist = levenshtein(normA, normB);
  return dist <= threshold;
}

export function parseRestaurantAndDish(text = "") {
  if (!text) return { dish: null, restaurant: null };

  // Pattern 0: "Pokaż menu"
  if (/^(pokaż\s+)?menu$/i.test(text.trim())) {
    return { dish: null, restaurant: null };
  }

  // Pattern 1: "Zamów [danie] [nazwa restauracji]"
  const orderPattern =
    /(?:zamów|poproszę|chcę)\s+([a-ząćęłńóśźż\s]+?)\s+([A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż\s]+)/i;
  const orderMatch = text.match(orderPattern);
  if (orderMatch) {
    let dish = orderMatch[1]?.trim();
    dish = dish?.replace(/ę$/i, "a").replace(/a$/i, "a");
    return { dish, restaurant: orderMatch[2]?.trim() };
  }

  // Pattern 2: "Pokaż menu [nazwa restauracji]"
  const menuPattern =
    /(?:pokaż\s+)?menu\s+(?:w\s+|pizzeria\s+|restauracja\s+)?([a-ząćęłńóśźż][a-ząćęłńóśźż\s]+)/i;
  const menuMatch = text.match(menuPattern);
  if (menuMatch) {
    return { dish: null, restaurant: menuMatch[1]?.trim() };
  }

  // Pattern 3: "Zjedz w [nazwa miejsca]"
  const locationPattern = /(?:w|z)\s+([A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż\s]+)/i;
  const locationMatch = text.match(locationPattern);
  if (locationMatch) {
    const extracted = locationMatch[1]?.trim();
    if (
      extracted &&
      !/(menu|zamówienie|zamówienia|pobliżu|okolicy|blisko|okolice|pobliżach)/i.test(
        extracted
      )
    ) {
      return { dish: null, restaurant: extracted };
    }
  }

  return { dish: null, restaurant: null };
}

export async function findDishInMenu(restaurantId, dishName) {
  if (!restaurantId || !dishName) return null;

  try {
    const menu = await getMenuItems(restaurantId, { includeUnavailable: true });
    if (!menu?.length) return null;

    const normalizedDish = normalize(dishName);

    let matched = menu.find((item) => normalize(item.base_name || item.name) === normalizedDish);
    if (matched) {
      console.log(`✅ Exact match: "${dishName}" → ${matched.name}`);
      return matched;
    }

    matched = menu.find((item) => {
      const normName = normalize(item.base_name || item.name);
      return normName.includes(normalizedDish) || normalizedDish.includes(normName);
    });
    if (matched) {
      console.log(`✅ Substring match: "${dishName}" → ${matched.name}`);
      return matched;
    }

    matched = menu.find((item) => fuzzyMatch(dishName, item.base_name || item.name, 3));
    if (matched) {
      console.log(`✅ Fuzzy match: "${dishName}" → ${matched.name}`);
      return matched;
    }

    console.warn(`⚠️ No match for dish: "${dishName}"`);
    return null;
  } catch (err) {
    console.error("❌ findDishInMenu error:", err);
    return null;
  }
}

export async function parseOrderItems(text, restaurantId) {
  if (!text || !restaurantId) return [];

  try {
    console.log(`🛒 Parsing order items from: "${text}"`);
    const menu = await getMenuItems(restaurantId, { includeUnavailable: true });
    if (!menu?.length) return [];

    const items = [];
    const normalized = normalize(text);
    const quantity = extractQuantity(text);

    for (const menuItem of menu) {
      const dishName = normalize(menuItem.base_name || menuItem.name);
      if (
        fuzzyMatch(text, menuItem.base_name || menuItem.name, 3) ||
        normalized.includes(dishName)
      ) {
        items.push({
          id: menuItem.id,
          name: menuItem.name,
          base_name: menuItem.base_name,
          price: parseFloat(menuItem.price_pln),
          size: menuItem.size_or_variant,
          quantity,
        });
        console.log(`✅ Found dish: ${menuItem.name} (qty: ${quantity})`);
      }
    }

    if (items.length === 0) {
      const parsed = parseRestaurantAndDish(text);
      if (parsed.dish) {
        const matched = await findDishInMenu(restaurantId, parsed.dish);
        if (matched) {
          items.push({
            id: matched.id,
            name: matched.name,
            base_name: matched.base_name,
            price: parseFloat(matched.price_pln),
            size: matched.size_or_variant,
            quantity,
          });
          console.log(`✅ Found dish via parsing: ${matched.name} (qty: ${quantity})`);
        }
      }
    }

    console.log(`🛒 Parsed ${items.length} items:`, items);
    return items;
  } catch (err) {
    console.error("❌ parseOrderItems error:", err);
    return [];
  }
}

