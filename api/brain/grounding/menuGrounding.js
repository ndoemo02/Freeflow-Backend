const QUERY_STOPWORDS = new Set([
    'a', 'albo', 'bym', 'chce', 'chcialbym', 'chcialabym', 'cos', 'czy', 'dla',
    'do', 'i', 'ja', 'jakies', 'mi', 'moge', 'na', 'o', 'od', 'poprosze',
    'obiad', 'obiadu', 'posilku', 'prosze', 'restauracji', 'restauracja', 'sie', 'to', 'w', 'wezme', 'z', 'za',
    'zamow', 'zamowic', 'zamawiam', 'ze',
]);

const TOKEN_CANONICALIZERS = [
    { pattern: /^wolow(?:in|a|e|y|ie|ina|ine|iny|inie)/, value: 'wolowina' },
    { pattern: /^(?:pikant|ostr)/, value: 'pikant' },
    { pattern: /^szpinak/, value: 'szpinak' },
    { pattern: /^(?:napoj|pici)/, value: 'napoj' },
    { pattern: /^(?:makaron|pasta)/, value: 'makaron' },
];

function normalizeLoose(value = '') {
    return String(value || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/ł/g, 'l')
        .replace(/Ł/g, 'L')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function canonicalizeToken(token = '') {
    for (const rule of TOKEN_CANONICALIZERS) {
        if (rule.pattern.test(token)) return rule.value;
    }
    return token;
}

function normalizePhrases(value = '') {
    return normalizeLoose(value)
        .replace(/\bna\s+ostro\b/g, ' pikant ')
        .replace(/\bdo\s+picia\b/g, ' napoj ')
        .replace(/\bcos\s+do\s+picia\b/g, ' napoj ')
        .replace(/\s+/g, ' ')
        .trim();
}

function parseList(value) {
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string') return [];
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[')) {
        try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed)) return parsed;
        } catch {
            // Keep the raw value as searchable text.
        }
    }
    return [trimmed];
}

function toCanonicalTokens(value = '', { dropStopwords = false } = {}) {
    return normalizePhrases(value)
        .split(' ')
        .filter(Boolean)
        .filter((token) => !dropStopwords || !QUERY_STOPWORDS.has(token))
        .map(canonicalizeToken)
        .filter((token) => token.length >= 3);
}

export function normalizeGroundedMenuQuery(value = '', { restaurantName = '' } = {}) {
    let normalized = normalizePhrases(value);
    const normalizedRestaurant = normalizeLoose(restaurantName);
    if (normalizedRestaurant) {
        normalized = normalized
            .replace(new RegExp(`\\b${normalizedRestaurant.replace(/\s+/g, '\\s+')}\\b`, 'g'), ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    return [...new Set(toCanonicalTokens(normalized, { dropStopwords: true }))].join(' ');
}

function buildItemCorpus(item = {}) {
    const primary = [item?.base_name, item?.name].filter(Boolean).join(' ');
    const metadata = [
        item?.description,
        item?.ingredients,
        item?.category,
        item?.item_family,
        ...parseList(item?.item_aliases),
        ...parseList(item?.item_tags),
        ...parseList(item?.dietary_flags),
    ].filter(Boolean).join(' ');

    return {
        primaryNormalized: normalizeGroundedMenuQuery(primary),
        primaryTokens: new Set(toCanonicalTokens(primary)),
        metadataTokens: new Set(toCanonicalTokens(metadata)),
    };
}

export function scoreGroundedMenuItem(item = {}, query = '', options = {}) {
    const normalizedQuery = normalizeGroundedMenuQuery(query, options);
    const queryTokens = normalizedQuery.split(' ').filter(Boolean);
    if (!queryTokens.length) return 0;

    const corpus = buildItemCorpus(item);
    const allTokens = new Set([...corpus.primaryTokens, ...corpus.metadataTokens]);
    const totalMatches = queryTokens.filter((token) => allTokens.has(token)).length;
    const primaryMatches = queryTokens.filter((token) => corpus.primaryTokens.has(token)).length;
    const coverage = totalMatches / queryTokens.length;
    const primaryCoverage = primaryMatches / queryTokens.length;

    if (coverage < 0.67 || totalMatches === 0) return 0;

    const exactPrimary = corpus.primaryNormalized === normalizedQuery;
    const containedPrimary = corpus.primaryNormalized.includes(normalizedQuery)
        || normalizedQuery.includes(corpus.primaryNormalized);
    const score = (coverage * 70)
        + (primaryCoverage * 20)
        + (exactPrimary ? 10 : (containedPrimary ? 5 : 0));

    return Number(Math.min(100, score).toFixed(2));
}

export function searchGroundedMenuItems(menu = [], query = '', options = {}) {
    const limit = Math.max(1, Math.floor(Number(options?.limit || 8)));
    return (Array.isArray(menu) ? menu : [])
        .filter((item) => item?.available !== false)
        .map((item) => ({
            item,
            score: scoreGroundedMenuItem(item, query, options),
        }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score || String(a.item?.name || '').localeCompare(String(b.item?.name || ''), 'pl'))
        .slice(0, limit);
}

export function resolveUniqueGroundedMenuItem(menu = [], query = '', options = {}) {
    const ranked = searchGroundedMenuItems(menu, query, { ...options, limit: 3 });
    const best = ranked[0] || null;
    const second = ranked[1] || null;
    const minScore = Number(options?.minScore ?? 75);
    const minMargin = Number(options?.minMargin ?? 10);

    if (!best || best.score < minScore) {
        return { item: null, score: best?.score || 0, ambiguous: false, candidates: ranked };
    }

    const ambiguous = Boolean(second && (best.score - second.score) < minMargin);
    return {
        item: ambiguous ? null : best.item,
        score: best.score,
        ambiguous,
        candidates: ranked,
    };
}
