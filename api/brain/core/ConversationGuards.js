/**
 * ConversationGuards.js
 * ═══════════════════════════════════════════════════════════════════════════
 * Context-aware helpers for UX conversation improvements.
 * These guards are ADDITIVE and do NOT modify existing safety layers.
 * 
 * SAFETY LAYERS PRESERVED:
 * - ICM Gate
 * - Cart Mutation Guard  
 * - Grounding (Supabase truth)
 * - SurfaceRenderer templates
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { BrainLogger } from '../../../utils/logger.js';
import { scoreRestaurantMatch } from '../utils/textMatch.js';

// ═══════════════════════════════════════════════════════════════════════════
// FIX 1: CONTEXT-AWARE LEGACY UNLOCK
// Checks if restaurant context is locked (user already selected restaurant)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if user has a locked restaurant context
 * @param {Object} session - Current session object
 * @returns {boolean} - True if restaurant context exists
 */
export function hasLockedRestaurant(session) {
    return !!(
        session?.currentRestaurant ||
        session?.lockedRestaurantId ||
        session?.lastRestaurant ||
        session?.entityCache?.restaurants?.length
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// FIX 3: CONVERSATION CONTINUITY GUARD
// Detects if user is in ordering context (should not reset to discovery)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if session is in ordering context
 * @param {Object} session - Current session object
 * @returns {boolean} - True if in ordering context
 */
export function isOrderingContext(session) {
    return !!(
        session?.currentRestaurant ||
        session?.lastRestaurant ||
        session?.lastIntent === 'select_restaurant' ||
        session?.lastIntent === 'menu_request' ||
        session?.lastIntent === 'create_order' ||
        session?.conversationPhase === 'restaurant_selected' ||
        session?.conversationPhase === 'ordering'
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// FIX 5: DISH PHRASE DETECTOR (LIGHT HEURISTIC)
// Detects if user is talking about a dish (not discovery)
// ═══════════════════════════════════════════════════════════════════════════

const DISH_KEYWORDS = [
    // Polish dishes
    'naleśnik', 'nalesnik', 'naleśniki',
    'pierogi', 'pierog',
    'schabowy', 'schabowego',
    'bigos', 'bigosu',
    'żurek', 'zurek',
    'barszcz', 'barszczu',
    'kotlet', 'kotleta',
    // International
    'pizza', 'pizze', 'pizzy',
    'kebab', 'kebaba', 'kebabu',
    'burger', 'burgera', 'burgery',
    'sushi', 'sashimi',
    'makaron', 'makaronu', 'pasta',
    'sałatka', 'salatka', 'sałatki',
    'zupa', 'zupy', 'zupę',
    'frytki', 'frytek',
    'kurczak', 'kurczaka',
    'ryba', 'ryby', 'rybę',
    'stek', 'steka', 'steak',
    // Generic
    'danie', 'dania',
    'posiłek', 'posilek',
    'jedzenie'
];

/**
 * Check if text contains dish-like phrases
 * @param {string} text - User input text
 * @returns {boolean} - True if dish phrase detected
 */
export function containsDishLikePhrase(text) {
    if (!text) return false;

    // Normalize: lowercase, remove diacritics
    const normalized = text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

    return DISH_KEYWORDS.some(keyword => {
        const keywordNorm = keyword
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');
        return normalized.includes(keywordNorm);
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// FIX 2: RESTAURANT SEMANTIC RECOVERY
// Recovers restaurant from full text when NLU missed the entity
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Recover restaurant entity from full text using semantic matching
 * @param {string} text - User input text
 * @param {Array} restaurants - List of restaurants from entity cache
 * @returns {Object|null} - Matched restaurant or null
 */
export async function recoverRestaurantFromFullText(text, restaurants) {
    if (!text || !restaurants?.length) return null;

    // Normalize input text
    const normalized = text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

    // Try exact substring match first
    for (const restaurant of restaurants) {
        if (!restaurant?.name) continue;

        const nameNorm = restaurant.name
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');

        // Check if restaurant name appears in text
        if (normalized.includes(nameNorm)) {
            BrainLogger.nlu?.(`🧠 SEMANTIC_RESTAURANT_RECOVERY: Exact match "${restaurant.name}"`);
            return restaurant;
        }

        // Check if significant tokens match (at least 2 consecutive words)
        const nameTokens = nameNorm.split(/\s+/).filter(t => t.length > 2);
        const textTokens = normalized.split(/\s+/);

        // Check for multi-word match (exact token pairing)
        for (let i = 0; i < textTokens.length - 1; i++) {
            const twoWordPhrase = `${textTokens[i]} ${textTokens[i + 1]}`;
            if (nameTokens.length >= 2) {
                const nameTwoWord = `${nameTokens[0]} ${nameTokens[1]}`;
                if (twoWordPhrase.includes(nameTwoWord) || nameTwoWord.includes(twoWordPhrase)) {
                    BrainLogger.nlu?.(`🧠 SEMANTIC_RESTAURANT_RECOVERY: Token match "${restaurant.name}"`);
                    return restaurant;
                }
            }
        }

        // Stem matching: match each name token by 4-char prefix (handles Polish inflection)
        // e.g. "stara kamienica" → stems ["star","kami"] match "starej kamienicy"
        const STEM_LEN = 4;
        if (nameTokens.length >= 2) {
            const nameStems = nameTokens.map(t => t.substring(0, STEM_LEN));
            const textTokensNorm = normalized.split(/\s+/);
            const matchCount = nameStems.filter(stem =>
                stem.length >= 3 && textTokensNorm.some(t => t.startsWith(stem))
            ).length;
            if (matchCount >= Math.min(2, nameStems.length)) {
                BrainLogger.nlu?.(`🧠 SEMANTIC_RESTAURANT_RECOVERY: Stem match "${restaurant.name}" (${matchCount}/${nameStems.length} stems)`);
                return restaurant;
            }
        }
    }

    return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// FIX 4: PHASE CALCULATION
// Calculate next conversation phase based on intent
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate the next conversation phase based on intent
 * @param {string} intent - Current intent
 * @param {string} currentPhase - Current phase
 * @param {string} source - Intent source
 * @returns {string} - New phase
 */
export function calculatePhase(intent, currentPhase = 'idle', source = '') {
    // Phase transitions
    if (intent === 'select_restaurant') return 'restaurant_selected';
    if (intent === 'menu_request') return 'restaurant_selected';
    if (intent === 'create_order') return 'ordering';
    if (intent === 'confirm_order') return 'ordering';
    if (intent === 'confirm_add_to_cart') return 'ordering';

    // find_nearby resets phase UNLESS it came from continuity guard
    if (intent === 'find_nearby' && source !== 'continuity_guard') {
        return 'idle';
    }

    // Keep current phase for other intents
    return currentPhase;
}

// ═══════════════════════════════════════════════════════════════════════════
// FIX A1: MENU REQUEST + FUZZY RESTAURANT RESOLVER
// Detects menu-request phrasing and fuzzy-matches restaurant from session lists
// ═══════════════════════════════════════════════════════════════════════════

const MENU_TRIGGERS = [
    'pokaż menu', 'co mają', 'karta', 'dania z karty', 'menu',
    'co jest w', 'co macie', 'jakie dania'
];

/**
 * Resolve restaurant from a menu-request style utterance.
 * Fuzzy-matches against session.last_restaurants_list + entityCache.restaurants.
 * @param {string} text - User input
 * @param {Object} session - Session object
 * @param {Object} [entityCache] - Entity cache (optional)
 * @returns {Object|null} Matched restaurant or null
 */
export function resolveRestaurantFromMenuRequest(text, session, entityCache) {
    if (!text || !session) return null;

    const normalized = text.toLowerCase();

    const isMenuRequest = MENU_TRIGGERS.some(trigger => normalized.includes(trigger));
    if (!isMenuRequest) return null;

    const candidates = [
        ...(session.last_restaurants_list || []),
        ...(entityCache?.restaurants || [])
    ];

    if (candidates.length === 0) return null;

    let bestMatch = null;
    let bestScore = 0;

    for (const restaurant of candidates) {
        if (!restaurant?.name) continue;
        const score = scoreRestaurantMatch(normalized, restaurant.name);
        if (score > bestScore) {
            bestScore = score;
            bestMatch = restaurant;
        }
    }

    if (bestScore >= 0.78) {
        BrainLogger.pipeline?.(`🔍 MENU_RESOLVER: matched "${bestMatch.name}" score=${bestScore.toFixed(2)}`);
        return bestMatch;
    }

    return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// FIX A2: ORDINAL EXTRACTION
// Maps Polish ordinal words / digits to 1-based index
// ═══════════════════════════════════════════════════════════════════════════

const ORDINAL_MAP = {
    'ta pierwsza': 1, 'tą pierwszą': 1, 'pierwsza': 1, 'pierwszy': 1,
    'jedynka': 1, 'numer jeden': 1,
    'ta druga': 2, 'tą drugą': 2, 'druga': 2, 'drugi': 2,
    'dwójka': 2, 'numer dwa': 2,
    'ta trzecia': 3, 'tą trzecią': 3, 'trzecia': 3, 'trzeci': 3,
    'numer trzy': 3,
    'czwarta': 4, 'czwarty': 4, 'numer cztery': 4,
    'piąta': 5, 'piąty': 5, 'numer pięć': 5
};

/**
 * Extract 1-based ordinal from user text.
 * Handles: "ta pierwsza", "1", "dwójka", "numer dwa", etc.
 * @param {string} text - User input
 * @returns {number|null} 1-based index or null
 */
export function extractOrdinal(text) {
    if (!text) return null;

    const normalized = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    // Check multi-word phrases first (longest match wins)
    const sortedKeys = Object.keys(ORDINAL_MAP).sort((a, b) => b.length - a.length);
    for (const key of sortedKeys) {
        const normKey = key.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (normalized.includes(normKey)) {
            return ORDINAL_MAP[key];
        }
    }

    // Fallback: bare single digit (1-9)
    const numberMatch = normalized.match(/\b(\d)\b/);
    if (numberMatch) {
        return parseInt(numberMatch[1], 10);
    }

    return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// FIX A4: LOCATION SANITIZER
// Rejects NLU-hallucinated locations (e.g. "pizzę może być włoska")
// ═══════════════════════════════════════════════════════════════════════════

const LOCATION_BLACKLIST = [
    'pizza', 'makaron', 'wloska', 'wlosk', 'ostre', 'burger',
    'pokaz', 'polec', 'mam ochote', 'moze byc', 'moze', 'byc'
];

const LOCATION_ADDRESS_HINTS = [
    'ul.', 'ul ', 'ulica', 'aleja', 'al.', 'al ',
    'plac', 'pl.', 'rondo', 'os.', 'os ', 'osiedle',
    'numer', ' nr '
];

const LOCATION_PLACEHOLDER_PATTERNS = [
    /\bcurrent\s+location\b/i,
    /\bmy\s+location\b/i,
    /\bhere\b/i,
    /\bnearby\b/i,
    /\bw\s*poblizu\b/i,
    /\bblisko\b/i,
    /\bbiezaca\s+lokalizacja\b/i,
];

function looksLikeStreetAddress(normalizedLocation = '') {
    const normalized = String(normalizedLocation || '').trim();
    if (!normalized) return false;

    const ascii = normalized
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/ł/g, 'l')
        .replace(/[^a-z0-9\s.-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const hasStreetHint = LOCATION_ADDRESS_HINTS.some((hint) => ascii.includes(hint));
    const hasStreetNumber = /\b\d+[a-z]?\b/i.test(ascii);
    const endsWithStreetNumber = /^[a-z\s.-]{3,}\s+\d+[a-z]?$/i.test(ascii);

    return hasStreetHint || (hasStreetNumber && endsWithStreetNumber);
}

/**
 * Sanitize NLU-extracted location.
 * If location has >2 words and contains non-location terms → use session fallback.
 * @param {string} location - Extracted location entity
 * @param {Object} session - Session object
 * @returns {string|null} Clean location or null
 */
export function sanitizeLocation(location, session) {
    if (!location) return location;

    const normalized = location
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

    if (LOCATION_PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(normalized))) {
        BrainLogger.pipeline?.(`🧹 SANITIZE_LOCATION: placeholder "${location}" → null`);
        return null;
    }

    const wordCount = normalized.trim().split(/\s+/).length;
    const addressLike = looksLikeStreetAddress(normalized);

    if ((wordCount > 2 && LOCATION_BLACKLIST.some(word => normalized.includes(word))) || addressLike) {
        BrainLogger.pipeline?.(`🧹 SANITIZE_LOCATION: rejected "${location}" → fallback`);
        return session?.last_location || session?.default_city || null;
    }

    return location;
}

// ═══════════════════════════════════════════════════════════════════════════
// FIX A3: ORDERING INTENT DETECTOR
// Detects ordering phrases (superset of containsDishLikePhrase)
// ═══════════════════════════════════════════════════════════════════════════

const ORDERING_WORDS = [
    'zamowię', 'zamawiam', 'skusze sie', 'skusze', 'poprosże', 'prosze',
    'chce', 'wezme', 'biore', 'dawaj', 'zamowic', 'poprosze',
    'zamwię', 'zamwiam'
];

/**
 * Detect if text contains an ordering intent phrase (broader than dish keywords).
 * @param {string} text - User input
 * @returns {boolean}
 */
export function containsOrderingIntent(text) {
    if (!text) return false;

    const normalized = text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

    return ORDERING_WORDS.some(word => normalized.includes(word)) ||
        containsDishLikePhrase(text);
}

export default {
    hasLockedRestaurant,
    isOrderingContext,
    containsDishLikePhrase,
    recoverRestaurantFromFullText,
    calculatePhase,
    resolveRestaurantFromMenuRequest,
    extractOrdinal,
    sanitizeLocation,
    containsOrderingIntent
};
