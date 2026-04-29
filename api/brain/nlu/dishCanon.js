/**
 * dishCanon.js
 * ============
 * Auto-generated alias map from Supabase menu_items_v2.
 * Generated: 2026-03-05
 *
 * Maps: exact DB name → canonical NLU alias (lowercase)
 *
 * Rules applied:
 *   1. Remove quantity suffixes: 33cm, 0.5l, 200ml, 4 szt, 7 szt, 1 szt, 6 szt
 *   2. Remove bracketed text: (panierowany), (na zamówienie), (ruskie lub z mięsem), (200 ml)
 *   3. Shorten long names to the first 2–3 meaningful words
 *   4. Lowercase everything
 *
 * Usage:
 *   import { dishCanon } from './dishCanon.js';
 *   const alias = dishCanon[originalName] ?? originalName.toLowerCase();
 */

export const dishCanon = {

    // ─── A ───────────────────────────────────────────────────────────────
    "Ayran Turecki": "ayran",

    // ─── B ───────────────────────────────────────────────────────────────
    "Bacon Burger": "bacon burger",
    "Baklava": "baklava",
    "Barszcz z tortellini": "barszcz",
    "Better Than Drwal - Wołowina": "drwal",
    "Bowl Gyros-Halloumi": "gyros bowl",
    "Bowl Kurczak Zapiekany z Serem": "bowl kurczak",
    "Bowl z Dynią": "bowl dynia",
    "Bratkartoffel": "bratkartoffel",
    "Brownie": "brownie",
    "BUFFAL": "buffal",
    "Burger wegetariański z Camembertem, frytkami oraz zestawem surówek": "burger wegetariański",
    "Burger wołowy z frytkami i surówką": "burger wołowy",
    "Burn": "burn",

    // ─── C ───────────────────────────────────────────────────────────────
    "Camembert z żurawiną": "camembert",
    "Cappuccino": "cappuccino",
    "Cappy Jabłko": "cappy jabłko",
    "Cappy Pomarańcza": "cappy",
    "Capricciosa": "capricciosa",
    "Carbonara a'la Hubertus": "carbonara",
    "Carpaccio z kaczki marynowanej w grzańcu": "carpaccio kaczka",
    "Cheddar Burger": "cheddar burger",
    "Ciasto Marchewkowe": "marchewkowe",
    "Coca-Cola": "cola",
    "Coca-Cola 0,3l": "cola",
    "Coca-Cola 0,5l": "cola",
    "Coca-Cola 0,85l": "cola",
    "Coca-Cola Zero": "cola zero",
    "Coca-Cola, Fanta, Sprite, Cappy (200 ml)": "napój gazowany",
    "Ćwiartka kaczki": "ćwiartka kaczki",
    "Ćwiartka kaczki (kaczka)": "kaczka",

    // ─── D ───────────────────────────────────────────────────────────────
    "Deska zakąsek dla dwojga": "deska zakąsek",
    "Desperado Double": "desperado double",
    "Desperado Standard": "desperado",
    "Diavola": "diavola",
    "Dzikie placki": "dzikie placki",

    // ─── F ───────────────────────────────────────────────────────────────
    "Falafel": "falafel",
    "Fanta": "fanta",
    "Fanta Pomarańczowa": "fanta",
    "Filet Grillowany": "filet grillowany",
    "Filet z kurczaka po hawajsku": "filet hawajski",
    "Filet z kurczaka tradycyjny (panierowany)": "filet kurczak",
    "Filet z łososia na szpinaku": "filet łosoś",
    "Flaki z indyka": "flaki",
    "Flat White": "flat white",
    "Fondant czekoladowy z lodami i bitą śmietaną": "fondant",
    "Frytki z Indii masala": "frytki masala",
    "Frytki z serem": "frytki z serem",

    // ─── G ───────────────────────────────────────────────────────────────
    "Gęsie żołądki": "żołądki",
    "Głodzilla": "głodzilla",
    "Golonka confit": "golonka",
    "Grillowany filet z kurczaka": "filet z kurczaka",
    "Grzanka z krupniokiem": "grzanka",
    "Grzybiarz z Piekaryhill": "grzybiarz",
    "Gulasz wieprzowy po węgiersku": "gulasz",
    "Gulasz wieprzowy z knedlikiem": "gulasz z knedlikiem",
    "Gulasz wieprzowy z knedlikiem (gulasz)": "gulasz",
    "Gyros z frytkami i tzatziki": "gyros",

    // ─── H ───────────────────────────────────────────────────────────────
    "Halloween Double": "halloween double",
    "Halloween Standard": "halloween",
    "Hawajska": "hawajska",
    "Hot-dog by KLAPS": "hot-dog",

    // ─── J ───────────────────────────────────────────────────────────────
    "Jajecznica z 2 szt. jaj": "jajecznica",

    // ─── K ───────────────────────────────────────────────────────────────
    "Kaczka na gorącym półmisku": "kaczka półmisek",
    "Kaczka pikantna": "kaczka pikantna",
    "Kaczka po chińsku": "kaczka chińska",
    "Kaczka po tajsku": "kaczka tajska",
    "Kaczka słodko-kwaśna": "kaczka słodko-kwaśna",
    "Kaczka z warzywami": "kaczka z warzywami",
    "Kalmary chrupiące Curry": "kalmary curry",
    "Kalmary chrupiące pikantne": "kalmary pikantne",
    "Kalmary chrupiące słodko-kwaśne": "kalmary słodko-kwaśne",
    "Kalmary chrupiące w pięciu smakach": "kalmary pięć smaków",
    "Kalmary na gorącym półmisku": "kalmary półmisek",
    "Kalmary po tajsku": "kalmary tajskie",
    "Kapusta modra": "kapusta modra",
    "Kapusta zasmażana": "kapusta zasmażana",
    "Kartacze z dzikiem": "kartacze",
    "Kawa Biała": "kawa biała",
    "Kawa Czarna": "kawa",
    "Kebab amerykański": "kebab",
    "Kebab w bułce": "kebab w bułce",
    "Kebab Box": "kebab box",
    "Klaps Fiction Double": "klaps fiction double",
    "Klaps Fiction Standard": "klaps fiction",
    "Kluski śląskie": "kluski śląskie",
    "Kluski śląskie 7 szt.": "kluski śląskie",
    "Kluski z sosem pieczeniowym": "kluski",
    "Kofola klasyczna": "kofola",
    "Kosmiczne Jaja Double": "kosmiczne jaja double",
    "Kosmiczne Jaja Standard": "kosmiczne jaja",
    "Kotlet po szwajcarsku": "kotlet szwajcarski",
    "Kotlet schabowy": "schabowy",
    "Kotlety czopskie": "czopskie",
    "Krem borowikowy": "krem borowikowy",
    "Krem borowikowy (borowikowy)": "borowikowy",
    "Krem z Cebuli i Czosnku": "krem cebula",
    "Krem z dyni z białą czekoladą": "krem dynia",
    "Krewetki Curry": "krewetki curry",
    "Krewetki na gorącym półmisku": "krewetki półmisek",
    "Krewetki pikantne": "krewetki pikantne",
    "Krewetki po tajsku": "krewetki tajskie",
    "Krewetki z warzywami": "krewetki",
    "Kroket (z kapustą i grzybami/bądź z mięsem) 1 szt.": "kroket",
    "Kurczak na gorącym półmisku": "kurczak półmisek",
    "Kurczak pikantny": "kurczak pikantny",
    "Kurczak po chińsku": "kurczak chiński",
    "Kurczak po parysku": "kurczak paryski",
    "Kurczak po tajsku": "kurczak tajski",
    "Kurczak słodko-kwaśny": "kurczak słodko-kwaśny",
    "Kurczak w cieście curry": "kurczak curry",
    "Kurczak w cieście pięciu smaków": "kurczak pięć smaków",
    "Kurczak w cieście pikantny": "kurczak pikantny",
    "Kurczak w cieście słodko-kwaśny": "kurczak słodko-kwaśny",
    "Kurczak z warzywami": "kurczak z warzywami",

    // ─── L ───────────────────────────────────────────────────────────────
    "Latte": "latte",
    "Lody waniliowe z sosem karmelowym": "lody waniliowe",
    "Lody z gorącymi malinami i bitą śmietaną": "lody maliny",

    // ─── M ───────────────────────────────────────────────────────────────
    "Makaron ryżowy z warzywami": "makaron ryżowy",
    "Mango Sok": "mango sok",
    "Margherita": "margherita",
    "Milczenie Wola Double": "milczenie wola double",
    "Milczenie Wola Standard": "milczenie wola",
    "Miruna w panierce": "miruna",
    "Monster Energy Drink": "monster",
    "MrDrwal": "drwal",

    // ─── N ───────────────────────────────────────────────────────────────
    "Naleśnik z dżemem truskawkowym lub wiśniowym": "naleśnik z dżemem",
    "Naleśnik z kurczakiem i warzywami": "naleśnik kurczak",
    "Naleśnik z nutellą, bananami, bitą śmietaną": "naleśnik nutella",
    "Naleśnik ze szpinakiem i serem feta": "naleśnik szpinak",
    "Naleśniki z serem na słodko z bitą śmietaną": "naleśniki z serem",
    "Nuggets box": "nuggets",
    "Nuggetsy z frytkami oraz surówką z marchewki": "nuggetsy",

    // ─── O ───────────────────────────────────────────────────────────────
    "Onionator": "onionator",
    "Onionator (cebulowy)": "cebulowy",
    "Oshee": "oshee",
    "Ozór wołowy": "ozór",

    // ─── P ───────────────────────────────────────────────────────────────
    "Panna Cotta": "panna cotta",
    "Pepsi / Mirinda / 7up": "pepsi",
    "Pepsi 0.85L": "pepsi",
    "Pieczeń wieprzowa": "pieczeń",
    "Pierogi (ruskie lub z mięsem) 6 szt.": "pierogi",
    "Pierogi Ho Cao z ryżem i surówką": "pierogi ho cao",
    "Pierogi ruskie": "pierogi ruskie",
    "Pierogi SiuMai z ryżem i surówką": "pierogi siumai",
    "Pierogi z mięsem": "pierogi z mięsem",
    "Pita Rollo": "pita rollo",
    "Pita Rollo z serem": "pita rollo z serem",
    "Piwo Tyskie": "piwo",
    "Pizza Capricciosa 33cm": "capricciosa",
    "Pizza Ekkluzivne": "pizza ekkluzivne",
    "Pizza Hawajska 33cm": "hawajska",
    "Pizza Láska Nebeská": "pizza láska",
    "Pizza Margherita 33cm": "margherita",
    "Pizza Pepperoni 33cm": "pepperoni",
    "Pizza Šunková": "pizza szynka",
    "Pizza Vege 33cm": "pizza vege",
    "Placki po węgiersku z gulaszem wieprzowym": "placki po węgiersku",
    "Placki ziemniaczane 4 szt.": "placki ziemniaczane",
    "Polędwica wieprzowa": "polędwica",
    "Pollo": "pollo",
    "Prosciutto e Funghi": "prosciutto",
    "Pstrąg na ziołowo": "pstrąg",
    "Pulled Pork Bowl Pikantny": "pulled pork",

    // ─── Q ───────────────────────────────────────────────────────────────
    "Quattro Formaggi": "quattro formaggi",

    // ─── R ───────────────────────────────────────────────────────────────
    "Rodzina Serano Double": "serano double",
    "Rodzina Serano Standard": "serano",
    "Rolada wieprzowa": "rolada wieprzowa",
    "Rolada wołowa": "rolada wołowa",
    "Rolada wołowa (na zamówienie)": "rolada wołowa",
    "Rosół z makaronem": "rosół",
    "Rumcajsowy Burger": "rumcajsowy",

    // ─── S ───────────────────────────────────────────────────────────────
    "Sajgonki 3 szt.": "sajgonki",
    "Sajgonki z ryżem": "sajgonki z ryżem",
    "Sajgonki z ryżem i surówką": "sajgonki z ryżem",
    "Sajgonki z surówką": "sajgonki z surówką",
    "Salami": "salami",
    "Sałatka Cezar Callzone": "sałatka cezar",
    "Sałatka grecka": "sałatka grecka",
    "Sałatka grecka z pieczywem czosnkowym": "sałatka grecka",
    "Sałatka Grillowany Kurczak": "sałatka kurczak",
    "Sałatka Halloumi": "halloumi",
    "Sałatka Hubertusa z pieczywem czosnkowym": "sałatka hubertusa",
    "Sałatka z Dynią": "sałatka dynia",
    "Sałatka z dynią marynowaną w musztardzie": "sałatka dynia",
    "Sałatka z halloumi": "halloumi",
    "Sałatka z Serem Camembert": "sałatka camembert",
    "Sałatka z Serem Feta": "sałatka feta",
    "Schab po beskidzku": "schab beskidzki",
    "Sernik z Musem Malinowym": "sernik",
    "Siekany tatar z polędwicy wołowej": "tatar",
    "Smak Vegas": "vegas",
    "Smażony ser": "smażony ser",
    "Smażony ser (ser)": "ser",
    "Sok Cappy": "cappy",
    "Sos": "sos",
    "Sos Jogurtowy": "sos jogurtowy",
    "Sos Pikantny": "sos pikantny",
    "Sos Tzatziki": "tzatziki",
    "Spicy Burger": "spicy burger",
    "Spinaci": "spinaci",
    "Sprite": "sprite",
    "Stek z halibuta smażony na maśle": "stek halibut",
    "Szarlotka": "szarlotka",

    // ─── T ───────────────────────────────────────────────────────────────
    "Tagliatelle z krewetkami": "tagliatelle krewetki",
    "Tagliatelle z krewetkami (tagliatelle)": "tagliatelle",
    "Tagliatelle ze szpinakiem, suszonymi pomidorami i płatkami migdałów": "tagliatelle szpinak",
    "Tiramisu": "tiramisu",
    "Tradycyjny schabowy": "schabowy",

    // ─── V ───────────────────────────────────────────────────────────────
    "Vege Burger": "vege burger",
    "Vegetariana": "vegetariana",

    // ─── W ───────────────────────────────────────────────────────────────
    "Wątróbka drobiowa": "wątróbka",
    "Wędzony pstrąg": "pstrąg wędzony",
    "Wegetrix Double": "wegetrix double",
    "Wegetrix Standard": "wegetrix",
    "Wieprzowina Curry": "wieprzowina curry",
    "Wieprzowina pięciu smaków": "wieprzowina pięć smaków",
    "Wieprzowina pikantna": "wieprzowina pikantna",
    "Wieprzowina po tajsku": "wieprzowina tajska",
    "Wieprzowina słodko-kwaśna": "wieprzowina słodko-kwaśna",
    "Wieprzowina z warzywami": "wieprzowina",
    "Woda Mineralna": "woda",
    "Woda mineralna (330 ml)": "woda",
    "Wodzionka": "wodzionka",
    "Wołowina 5 smaków": "wołowina pięć smaków",
    "Wołowina Curry": "wołowina curry",
    "Wołowina na gorącym półmisku": "wołowina półmisek",
    "Wołowina pikantna": "wołowina pikantna",
    "Wołowina po tajsku": "wołowina tajska",
    "Wołowina z warzywami": "wołowina",

    // ─── Z / Ż ───────────────────────────────────────────────────────────
    "Zapiekaniec": "zapiekaniec",
    "Żeberka wieprzowe z frytkami": "żeberka",
    "Ziemniaki z wody": "ziemniaki",
    "Zupa czosnkowa": "zupa czosnkowa",
    "Zupa czosnkowa (czosnkowa)": "czosnkowa",
    "Zupa dnia": "zupa dnia",
    "Zupa krabowa": "zupa krabowa",
    "Zupa łajska": "zupa łajska",
    "Zupa pomidorowa": "zupa pomidorowa",
    "Zupa wietnamska": "zupa wietnamska",
    "Zupa Won Ton": "won ton",
    "Zupa z kaczki": "zupa z kaczki",
    "Zupa z kurczakiem": "zupa z kurczakiem",
    "Żur śląski na talerzu": "żur śląski",
    "Żur śląski w chlebie": "żur śląski",
    "Żwirek i Muchomorek Standard": "żwirek",
};

/**
 * Reverse map: alias → oryginalny klucz DB (pierwsza pasująca nazwa)
 * Używane przez NLU do przywrócenia kanonicznej nazwy z DB.
 */
export const aliasToDb = Object.fromEntries(
    Object.entries(dishCanon).map(([db, alias]) => [alias, db])
);

/**
 * canonicalizeDish(userText, menuItems)
 * Przetwarza tekst użytkownika szukając aliasu z dishCanon.
 * Zwraca kanoniczną nazwę z bazy danych jeśli znajdzie dopasowanie.
 *
 * @param {string} text - raw user input
 * @returns {string} - canonical DB name or original text
 */
const ZUREK_SCOPED_RESTAURANT = 'Restauracja Stara Kamienica';
const ZUREK_SCOPED_CANONICAL = '\u017burek \u015bl\u0105ski na ma\u015blance';

function normalizeScoped(value = '') {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
}

export function canonicalizeDish(text, sessionContext = null) {
    if (!text) return text;
    const normalized = text.toLowerCase().trim();
    const normalizedScoped = normalizeScoped(normalized);

    const restaurantName =
        sessionContext?.currentRestaurant?.name ||
        sessionContext?.lastRestaurant?.name ||
        '';

    const isStaraKamienica =
        normalizeScoped(restaurantName) === normalizeScoped(ZUREK_SCOPED_RESTAURANT);

    if (isStaraKamienica) {
        if (
            normalizedScoped.includes('zurek') ||
            normalizedScoped.includes('urek') ||
            normalizedScoped === 'zur' ||
            normalizedScoped.includes(' zur')
        ) {
            return ZUREK_SCOPED_CANONICAL;
        }
    }

    // Find matching alias at word boundaries. First match wins (insertion order).
    // Prevents substring false-positives (e.g. "kebab rollo" matching "kebab"
    // when the user meant a rollo kebab, not "Kebab amerykański").
    for (const [dbName, alias] of Object.entries(dishCanon)) {
        const idx = normalized.indexOf(alias);
        if (idx === -1) continue;
        const beforeOk = idx === 0 || normalized[idx - 1] === ' ';
        const afterOk = idx + alias.length === normalized.length || normalized[idx + alias.length] === ' ';
        if (beforeOk && afterOk) {
            return dbName;
        }
    }

    return text;
}
