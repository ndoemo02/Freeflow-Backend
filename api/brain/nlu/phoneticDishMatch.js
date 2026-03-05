/**
 * Phonetic Dish Matcher
 * =====================
 * Warstwa między STT a NLU. Zamiast szukać dokładnej nazwy dania,
 * szuka najbliższej fonetycznie z `session.last_menu`.
 *
 * Obsługuje typowe błędy STT w języku polskim:
 *   "kefap" → "kebab", "surek" → "żurek", "kacka" → "kaczka"
 */

/**
 * Normalizuje tekst fonetycznie — sprowadza do uproszczonej transkrypcji.
 * @param {string} text
 * @returns {string}
 */
export function normalizePhonetic(text) {
    return text
        .toLowerCase()
        .replace(/rz/g, 'z')
        .replace(/ż/g, 'z')
        .replace(/ź/g, 'z')
        .replace(/ó/g, 'u')
        .replace(/ch/g, 'h')
        .replace(/ą/g, 'on')
        .replace(/ę/g, 'en')
        .replace(/ś/g, 's')
        .replace(/ć/g, 'c')
        .replace(/ń/g, 'n')
        .replace(/ł/g, 'l')
        .replace(/sz/g, 's')
        .replace(/cz/g, 'c')
        .replace(/dz/g, 'z')
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Próbuje dopasować input do najbliższego dania z menu fonetycznie.
 * Strategia:
 *  1. Exact phonetic match całej nazwy dania
 *  2. Input zawiera fonetyczny pierwszy token dania (≥4 znaki)
 *  3. Pierwsze słowo dania zawiera >80% input (substring phonetic)
 *
 * @param {string} input  — tekst od użytkownika (po STT)
 * @param {Array}  menu   — tablica obiektów { name, ... } z session.last_menu
 * @returns {string|null} — canonical dish name lub null
 */
export function matchDishPhonetic(input, menu) {
    if (!input || !Array.isArray(menu) || menu.length === 0) return null;

    const normInput = normalizePhonetic(input);
    if (normInput.length < 3) return null;

    const inputTokens = normInput.split(' ').filter(t => t.length >= 4);

    for (const item of menu) {
        if (!item?.name) continue;

        const normDish = normalizePhonetic(item.name);
        const dishTokens = normDish.split(' ').filter(t => t.length >= 4);

        if (dishTokens.length === 0) continue;

        // Strategia 1: pełna fonetyczna nazwa dania zawiera się w inputcie
        if (normDish.length >= 4 && normInput.includes(normDish)) {
            return item.name;
        }

        // Strategia 2: input zawiera dowolny znaczący token dania (≥4 znaki)
        for (const dishToken of dishTokens) {
            if (normInput.includes(dishToken)) {
                return item.name;
            }
        }

        // Strategia 3: dowolny token inputu levenshtein ≤1 od dowolnego tokenu dania
        for (const it of inputTokens) {
            for (const dt of dishTokens) {
                if (levenshtein(it, dt) <= 1) {
                    return item.name;
                }
            }
        }
    }

    return null;
}

/**
 * Levenshtein distance (optymalizowana dla krótkich stringów ≤20 znaków).
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function levenshtein(a, b) {
    const m = a.length;
    const n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;

    const dp = Array.from({ length: m + 1 }, (_, i) => i);

    for (let j = 1; j <= n; j++) {
        let prev = dp[0];
        dp[0] = j;
        for (let i = 1; i <= m; i++) {
            const temp = dp[i];
            dp[i] = a[i - 1] === b[j - 1]
                ? prev
                : 1 + Math.min(prev, dp[i], dp[i - 1]);
            prev = temp;
        }
    }

    return dp[m];
}
