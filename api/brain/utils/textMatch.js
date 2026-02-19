/**
 * textMatch.js
 * Deterministic fuzzy scorer for restaurant name matching.
 * No external dependencies.
 */

/**
 * Score how well 'text' matches 'restaurantName'.
 * Returns a value between 0 and 1.
 * @param {string} text - User input (normalized)
 * @param {string} restaurantName - Restaurant name to match against
 * @returns {number} 0..1 score
 */
export function scoreRestaurantMatch(text, restaurantName) {
    if (!text || !restaurantName) return 0;

    const normalize = (s) =>
        s.toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim();

    const t = normalize(text);
    const r = normalize(restaurantName);

    // Exact substring match
    if (t.includes(r)) return 1;

    // Token overlap with prefix support (handles Polish inflection)
    const words = r.split(' ').filter(w => w.length > 0);
    let matches = 0;

    for (const word of words) {
        if (t.includes(word)) {
            matches++;
            continue;
        }
        // Prefix match: check if any text token shares the first N chars with 'word'
        // Handles inflection: "stara"↔"starej", "kamienica"↔"kamienicy"
        const prefixLen = Math.max(4, Math.floor(word.length * 0.75));
        const prefix = word.substring(0, prefixLen);
        if (prefix.length >= 4) {
            const tWords = t.split(/\s+/);
            const hasPrefixMatch = tWords.some(tw => tw.startsWith(prefix) || prefix.startsWith(tw.substring(0, prefixLen)));
            if (hasPrefixMatch) matches += 0.85; // Partial credit for inflected match
        }
    }

    return words.length > 0 ? Math.min(1, matches / words.length) : 0;
}
