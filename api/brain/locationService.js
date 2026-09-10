import { supabase } from "../_supabase.js";
import { getSession } from "./context.js";
import { normalize, fuzzyMatch } from "./orderService.js";
import { filterRestaurantsForPublicDemo, isPublicDemoCatalogOnly } from "./data/restaurantCatalog.js";
import { resolveDemoCatalogScope } from "../demo/demoContext.js";

const CUISINE_ALIASES = {
  azjatyckie: ["Wietnamska", "Chińska", "Tajska"],
  azjatyckiej: ["Wietnamska", "Chińska", "Tajska"],
  orientalnej: ["Wietnamska", "Chińska"],
  orientalne: ["Wietnamska", "Chińska"],
  fastfood: ["Amerykańska", "Kebab"],
  "fast food": ["Amerykańska", "Kebab"],
  "na szybko": ["Amerykańska", "Kebab"],
  "szybkie": ["Amerykańska", "Kebab"],
  burger: ["Amerykańska"],
  burgera: ["Amerykańska"],
  burgerow: ["Amerykańska"],
  pizza: ["Włoska"],
  pizze: ["Włoska"],
  pizzy: ["Włoska"],
  wloska: ["Włoska"],
  wloskiej: ["Włoska"],
  kebab: ["Kebab"],
  kebaba: ["Kebab"],
  kebabu: ["Kebab"],
  lokalne: ["Polska", "Śląska / Europejska", "Czeska / Polska"],
  lokalnej: ["Polska", "Śląska / Europejska", "Czeska / Polska"],
  domowe: ["Polska", "Śląska / Europejska"],
  domowej: ["Polska", "Śląska / Europejska"],
  regionalne: ["Polska", "Śląska / Europejska", "Czeska / Polska"],
  regionalnej: ["Polska", "Śląska / Europejska", "Czeska / Polska"],
  polska: ["Polska"],
  polskiej: ["Polska"],
  europejska: ["Śląska / Europejska", "Czeska / Polska", "Włoska"],
  europejskiej: ["Śląska / Europejska", "Czeska / Polska", "Włoska"],
  wege: [],
  wegetarianskie: [],
  wegetarianskiej: [],
};

const CUISINE_KEYWORDS = {
  pizza: "Pizzeria",
  pizze: "Pizzeria",
  pizzy: "Pizzeria",
  pizzeria: "Pizzeria",
  kebab: "Kebab",
  kebaba: "Kebab",
  kebabu: "Kebab",
  burger: "Amerykańska",
  burgera: "Amerykańska",
  burgery: "Amerykańska",
  hamburgera: "Amerykańska",
  wloska: "Włoska",
  wloskiej: "Włoska",
  polska: "Polska",
  polskiej: "Polska",
  wietnamska: "Wietnamska",
  wietnamskiej: "Wietnamska",
  chinska: "Chińska",
  chinskiej: "Chińska",
  tajska: "Tajska",
  tajskiej: "Tajska",
  azjatyckie: "azjatyckie",
  azjatyckiej: "azjatyckiej",
  orientalne: "orientalne",
  orientalnej: "orientalnej",
  fastfood: "fastfood",
  "fast food": "fast food",
  lokalne: "lokalne",
  lokalnej: "lokalnej",
  domowe: "domowe",
  domowej: "domowej",
  wege: "wege",
  wegetarianskie: "wege",
  wegetarianskiej: "wege",
};

const NEARBY_CITY_SUGGESTIONS = {
  bytom: ["Piekary Śląskie", "Katowice", "Zabrze"],
  katowice: ["Piekary Śląskie", "Bytom", "Chorzów"],
  zabrze: ["Piekary Śląskie", "Bytom", "Gliwice"],
  gliwice: ["Zabrze", "Piekary Śląskie"],
  chorzow: ["Katowice", "Piekary Śląskie", "Bytom"],
};


function withTimeout(promise, timeoutMs, operationName) {
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(
      () =>
        reject(new Error(`⏱️ Timeout: ${operationName} exceeded ${timeoutMs}ms`)),
      timeoutMs
    );
  });

  const start = Date.now();
  return Promise.race([promise, timeoutPromise])
    .then((result) => {
      const duration = Date.now() - start;
      if (duration > 2000) {
        console.warn(`⚠️ Slow operation: ${operationName} took ${duration}ms`);
      }
      return result;
    })
    .catch((err) => {
      const duration = Date.now() - start;
      console.error(`❌ ${operationName} failed after ${duration}ms:`, err.message);
      throw err;
    });
}

export function expandCuisineType(cuisineType) {
  if (!cuisineType) return null;
  const normalized = normalize(cuisineType);
  if (CUISINE_ALIASES[normalized]) {
    console.log(
      `🔄 Cuisine alias expanded: "${cuisineType}" → [${CUISINE_ALIASES[normalized].join(
        ", "
      )}]`
    );
    return CUISINE_ALIASES[normalized];
  }
  return [cuisineType];
}

export function extractCuisineType(text) {
  const normalized = normalize(text);
  for (const [keyword, cuisineType] of Object.entries(CUISINE_KEYWORDS)) {
    if (normalized.includes(keyword)) {
      console.log(
        `🍕 Extracted cuisine type: "${cuisineType}" (keyword: "${keyword}")`
      );
      return cuisineType;
    }
  }
  return null;
}

export function calculateDistance(lat1, lng1, lat2, lng2) {
  if (!lat1 || !lng1 || !lat2 || !lng2) return null;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function groupRestaurantsByCategory(restaurants = []) {
  return restaurants.reduce((acc, restaurant) => {
    const cuisine = restaurant.cuisine_type || "Inne";
    if (!acc[cuisine]) acc[cuisine] = [];
    acc[cuisine].push(restaurant);
    return acc;
  }, {});
}

export function getCuisineFriendlyName(cuisineType) {
  const mapping = {
    "Amerykańska": "fast-foody i burgery",
    Kebab: "kebaby",
    Włoska: "pizzerie",
    Polska: "kuchnię polską",
    "Śląska / Europejska": "kuchnię europejską",
    "Czeska / Polska": "kuchnię regionalną",
    Wietnamska: "kuchnię azjatycką",
    Chińska: "kuchnię azjatycką",
    Tajska: "kuchnię azjatycką",
  };
  return mapping[cuisineType] || cuisineType?.toLowerCase();
}

export function getNearbyCityCandidates(location) {
  if (!location) return [];
  const normalized = normalize(location);
  return NEARBY_CITY_SUGGESTIONS[normalized] || [];
}

export async function findRestaurantsByLocation(
  location,
  cuisineType = null,
  session = null
) {
  if (!location) return null;

  const cacheKey = `${normalize(location)}_${cuisineType || "all"}`;
  const now = Date.now();

  // Query current publication status instead of trusting a stale location cache.

  try {
    let query = supabase
      .from("restaurants")
      .select("id, name, address, city, cuisine_type, lat, lng, publication_status, is_active")
      .eq("publication_status", "demo_fictional").eq("is_active", true)
      .ilike("city", `%${location}%`);

    if (cuisineType) {
      const cuisineList = expandCuisineType(cuisineType);
      if (cuisineList?.length > 1) query = query.in("cuisine_type", cuisineList);
      else if (cuisineList?.length === 1)
        query = query.eq("cuisine_type", cuisineList[0]);
    }

    const { data: restaurants, error } = await withTimeout(
      query.limit(10),
      4000,
      `findRestaurantsByLocation("${location}"${
        cuisineType ? `, cuisine: ${cuisineType}` : ""
      })`
    );

    if (error) {
      console.error("⚠️ findRestaurantsByLocation error:", error.message);
      return null;
    }

    if (!restaurants?.length) {
      console.warn(
        `⚙️ GeoContext: brak wyników w "${location}"${
          cuisineType ? ` (cuisine: ${cuisineType})` : ""
        }`
      );
      return null;
    }

    if (session) {
      if (!session.locationCache) session.locationCache = {};
      session.locationCache[cacheKey] = { data: restaurants, timestamp: now };
      console.log(
        `💾 Cache SAVED for location: "${location}"${
          cuisineType ? ` (cuisine: ${cuisineType})` : ""
        }`
      );
    }

    return restaurants;
  } catch (err) {
    console.error("⚠️ findRestaurantsByLocation error:", err.message);
    return null;
  }
}

export async function findRestaurantByName(name) {
  if (!name) return null;

  try {
    const { data: restaurants, error } = await supabase
      .from("restaurants")
      .select("id, name, address, city, lat, lng")
      .eq("publication_status", "demo_fictional").eq("is_active", true);

    if (error || !restaurants?.length) {
      console.warn("⚠️ findRestaurant: brak danych z Supabase");
      return null;
    }

    const matched = restaurants.find((r) => fuzzyMatch(name, r.name, 3));
    if (matched) {
      console.log(`✅ Matched restaurant: "${name}" → ${matched.name}`);
      return matched;
    }

    const alias = restaurants.find((r) =>
      normalize(r.name).startsWith(normalize(name).split(" ")[0])
    );
    if (alias) {
      console.log(`✅ Alias match: "${name}" → ${alias.name}`);
      return alias;
    }

    console.warn(`⚠️ No match for restaurant: "${name}"`);
    return null;
  } catch (err) {
    console.error("⚠️ findRestaurant error:", err.message);
    return null;
  }
}

export async function getLocationFallback(
  sessionId,
  prevLocation,
  messageTemplate,
  callerSession = null
) {
  if (!prevLocation) return null;

  console.log(`🧭 Semantic fallback: using last_location = ${prevLocation}`);

  // UWAGA (18h): `getSession` pochodzi z `brain/context.js`, ktore trzyma WLASNA
  // mape sesji — inna niz `brain/session/sessionStore.js`, do ktorej pisze pipeline.
  // W runtime nikt do tej pierwszej nie pisze, wiec odczyt zwraca `null`. Zostawiony
  // wylacznie jako zrodlo `locationCache`, zeby nie wlaczac po cichu martwego cache
  // przy okazji naprawy P0 (osobna zmiana zachowania, poza zakresem).
  const cacheSession = getSession(sessionId);
  const locationRestaurants = await findRestaurantsByLocation(
    prevLocation,
    null,
    cacheSession
  );

  if (!locationRestaurants?.length) return null;

  // Zasieg katalogu MUSI isc z sesji pipeline'u, ktora podaje wolajacy — inaczej
  // liczylby sie z pustki i filtr nigdy by sie nie wlaczyl (18g powtorzone).
  const { hasExplicitDemoContext, datasetId } = resolveDemoCatalogScope(
    callerSession ?? cacheSession
  );

  return buildLocationFallbackMessage(
    locationRestaurants,
    prevLocation,
    messageTemplate,
    {
      demoOnly: isPublicDemoCatalogOnly() || hasExplicitDemoContext,
      datasetId,
    }
  );
}

/**
 * Buduje komunikat „najpierw wybierz restauracje" — czysta funkcja, bez I/O.
 *
 * P0 z sesji 18g §K: ta lista trafia do uzytkownika I do TTS, wiec musi przejsc
 * przez ten sam filtr katalogu co discovery. Bez tego `menu_request` wymienial
 * z nazwy piec REALNYCH restauracji o `publication_status='private'`, ktore nie
 * wyrazily zgody na publikacje (§8). Filtr byl wolany wylacznie w findHandler.js
 * — czyli stal przy jednym wejsciu zamiast przy zrodle.
 *
 * Wydzielone z `getLocationFallback` swiadomie: w 18g proba przetestowania tej
 * logiki nie powiodla sie, bo `findRestaurantsByLocation` jest w tym samym module
 * i wolana bezposrednio, wiec w ESM nie da sie jej podmienic — test przechodzil
 * trywialnie i zostal usuniety. Rozdzielenie I/O od skladania tekstu usuwa problem
 * zamiast z nim walczyc. Kontrakt: `locationFallbackDemoFilter.test.js`.
 *
 * Argumenty `demoOnly` i `datasetId` sa te same, ktore podaje `findHandler.js`
 * przy `find_nearby` — rozjazd tych dwoch wywolan byl przyczyna wycieku.
 */
export function buildLocationFallbackMessage(
  restaurants,
  prevLocation,
  messageTemplate,
  { demoOnly = isPublicDemoCatalogOnly(), datasetId = null } = {}
) {
  const publishable = filterRestaurantsForPublicDemo(restaurants, demoOnly, datasetId);
  if (!publishable.length) return null;

  const restaurantList = publishable
    .map((r, i) => `${i + 1}. ${r.name}`)
    .join("\n");

  // Licznik MUSI isc z listy po filtrze. Przed naprawa czytal surowa liste, wiec
  // komunikat mowil „(10)" i wypisywal 5 pozycji — zdradzajac istnienie ukrytych
  // lokali nawet bez podania ich nazw.
  return messageTemplate
    .replace("{location}", prevLocation)
    .replace("{count}", publishable.length)
    .replace("{list}", restaurantList);
}

