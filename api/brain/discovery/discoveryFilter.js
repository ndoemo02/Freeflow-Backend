import {
  TOP_GROUP_KEYWORDS,
  CATEGORY_KEYWORDS,
  CORE_TAG_KEYWORDS
} from "./taxonomy.runtime.js";
import {
  mapRestaurantToFeatures
} from "./restaurantFeatureAdapter.js";
const SCORE = {
  TOP_GROUP: 3,
  CATEGORY: 2,
  TAG: 1,
  KEYWORD: 2,
  OPEN_NOW: 3
};
const ALWAYS_STRICT_TAGS = ["vege", "delivery"];
function matchQueryToTaxonomy(queryText) {
  const text = queryText.toLowerCase().trim();
  const topGroups = [];
  const categories = [];
  const tags = [];
  for (const [group, keywords] of Object.entries(TOP_GROUP_KEYWORDS)) {
    if (keywords.some((kw) => text.includes(kw))) {
      topGroups.push(group);
    }
  }
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => text.includes(kw))) {
      categories.push(cat);
    }
  }
  for (const [tag, keywords] of Object.entries(CORE_TAG_KEYWORDS)) {
    if (keywords.some((kw) => text.includes(kw))) {
      tags.push(tag);
    }
  }
  const open_now = CORE_TAG_KEYWORDS.open_now.some((kw) => text.includes(kw));
  const signalCount = topGroups.length + categories.length + tags.length;
  const confidence = signalCount === 0 ? "empty" : signalCount >= 2 ? "deterministic" : "partial";
  return { topGroups, categories, tags, open_now, confidence, rawText: queryText };
}
function tokenizeQuery(rawText) {
  const STOPWORDS = /* @__PURE__ */ new Set([
    "jest",
    "mam",
    "maj\u0105",
    "co\u015B",
    "prosz\u0119",
    "poprosz\u0119",
    "chc\u0119",
    "chcia\u0142bym",
    "chcia\u0142abym",
    "dajcie",
    "podaj",
    "teraz",
    "dzisiaj",
    "jutro",
    "gdzie",
    "jakie",
    "czy",
    "macie",
    "mo\u017Cecie",
    "mo\u017Ce",
    "prosz\u0119",
    "bardzo",
    "dobrze",
    "dzi\u015B",
    "troch\u0119",
    "jakie\u015B",
    "jaki\u015B",
    "b\u0119dzie"
  ]);
  return rawText.toLowerCase().replace(/[.,?!;:()\[\]"']/g, " ").split(/\s+/).filter((token) => token.length >= 4 && !STOPWORDS.has(token));
}
function buildRestaurantCorpus(r) {
  const parts = [];
  if (r.name) parts.push(r.name);
  if (r.cuisine_type) parts.push(r.cuisine_type);
  if (r.description) parts.push(r.description);
  if (Array.isArray(r.tags)) parts.push(...r.tags);
  if (r.menu) {
    try {
      parts.push(typeof r.menu === "string" ? r.menu : JSON.stringify(r.menu));
    } catch {
    }
  }
  return parts.join(" ").toLowerCase();
}
function scoreRestaurant(parsedQuery, r) {
  const features = mapRestaurantToFeatures(r);
  const corpus = buildRestaurantCorpus(r);
  const matchedGroups = parsedQuery.topGroups.filter((g) => features.topGroups.includes(g));
  const topGroupScore = matchedGroups.length * SCORE.TOP_GROUP;
  const matchedCategories = parsedQuery.categories.filter((c) => features.categories.includes(c));
  const categoryScore = matchedCategories.length * SCORE.CATEGORY;
  const queryTagsWithoutOpenNow = parsedQuery.tags.filter((t) => t !== "open_now");
  const matchedTags = queryTagsWithoutOpenNow.filter((t) => features.tags.includes(t));
  const tagScore = matchedTags.length * SCORE.TAG;
  const queryTokens = tokenizeQuery(parsedQuery.rawText);
  const uniqueMatchedTokens = new Set(queryTokens.filter((token) => corpus.includes(token)));
  const keywordScore = Math.min(uniqueMatchedTokens.size, 3) * SCORE.KEYWORD;
  let openNowBoost = 0;
  if (parsedQuery.open_now) {
    if (features.tags.includes("open_now")) {
      openNowBoost = SCORE.OPEN_NOW;
    }
  }
  const total = topGroupScore + categoryScore + tagScore + keywordScore + openNowBoost;
  return {
    topGroupScore,
    categoryScore,
    tagScore,
    keywordScore,
    openNowBoost,
    total
  };
}
function shouldIncludeRestaurant(parsedQuery, r) {
  const features = mapRestaurantToFeatures(r);
  const hasStructure = parsedQuery.topGroups.length > 0 || parsedQuery.categories.length > 0;
  const hasStrictTags = parsedQuery.tags.some((t) => ALWAYS_STRICT_TAGS.includes(t));
  const enforceAllTags = parsedQuery.confidence === "deterministic" && hasStructure && hasStrictTags;
  if (parsedQuery.topGroups.length > 0) {
    if (!parsedQuery.topGroups.some((g) => features.topGroups.includes(g))) return false;
  }
  if (parsedQuery.categories.length > 0) {
    if (!parsedQuery.categories.some((c) => features.categories.includes(c))) return false;
  }
  const tagsToEnforce = enforceAllTags ? parsedQuery.tags : ALWAYS_STRICT_TAGS.filter((t) => parsedQuery.tags.includes(t));
  for (const tag of tagsToEnforce) {
    if (tag === "open_now") continue;
    if (!features.tags.includes(tag)) return false;
  }
  return true;
}
function filterRestaurantsByDiscovery(parsedQuery, restaurants) {
  if (parsedQuery.confidence === "empty") {
    return restaurants;
  }
  const filtered = restaurants.filter((r) => shouldIncludeRestaurant(parsedQuery, r));
  filtered.sort((a, b) => {
    const scoreA = scoreRestaurant(parsedQuery, a).total;
    const scoreB = scoreRestaurant(parsedQuery, b).total;
    return scoreB - scoreA;
  });
  return filtered;
}
function rankRestaurantsByDiscovery(parsedQuery, restaurants) {
  if (parsedQuery.confidence === "empty") {
    return restaurants.map((r) => ({
      restaurant: r,
      score: 0,
      scoreBreakdown: { topGroupScore: 0, categoryScore: 0, tagScore: 0, keywordScore: 0, openNowBoost: 0, total: 0 }
    }));
  }
  const results = [];
  for (const r of restaurants) {
    if (!shouldIncludeRestaurant(parsedQuery, r)) continue;
    const breakdown = scoreRestaurant(parsedQuery, r);
    results.push({ restaurant: r, score: breakdown.total, scoreBreakdown: breakdown });
  }
  results.sort((a, b) => b.score - a.score);
  return results;
}
function runDiscovery(parsedQuery, restaurants) {
  if (parsedQuery.confidence === "empty") {
    return {
      items: [],
      fallback: "llm",
      fallbackReason: `Parser nie znalaz\u0142 \u017Cadnych sygna\u0142\xF3w taksonomicznych w: "${parsedQuery.rawText}". Przeka\u017C do LLM refiner.`,
      totalBeforeFilter: restaurants.length,
      totalAfterFilter: 0
    };
  }
  const ranked = rankRestaurantsByDiscovery(parsedQuery, restaurants);
  return {
    items: ranked,
    fallback: null,
    totalBeforeFilter: restaurants.length,
    totalAfterFilter: ranked.length
  };
}
function explainFilter(parsedQuery, r) {
  const features = mapRestaurantToFeatures(r);
  const breakdown = scoreRestaurant(parsedQuery, r);
  const reasons = [];
  const passed = shouldIncludeRestaurant(parsedQuery, r);
  const hasStructure = parsedQuery.topGroups.length > 0 || parsedQuery.categories.length > 0;
  const hasStrictTags = parsedQuery.tags.some((t) => ALWAYS_STRICT_TAGS.includes(t));
  const enforceAllTags = parsedQuery.confidence === "deterministic" && hasStructure && hasStrictTags;
  reasons.push(`Features: topGroups=[${features.topGroups}] categories=[${features.categories}] tags=[${features.tags}]`);
  reasons.push(`Score: ${breakdown.total} (group:${breakdown.topGroupScore} cat:${breakdown.categoryScore} tag:${breakdown.tagScore} kw:${breakdown.keywordScore} open:${breakdown.openNowBoost})`);
  reasons.push(`AND mode: ${enforceAllTags ? "ALL tags enforced (deterministic)" : "only strict tags (vege/delivery)"}`);
  if (parsedQuery.topGroups.length > 0) {
    const match = parsedQuery.topGroups.some((g) => features.topGroups.includes(g));
    reasons.push(`topGroups [${parsedQuery.topGroups}]: ${match ? "\u2713" : "\u2717"}`);
  }
  if (parsedQuery.categories.length > 0) {
    const match = parsedQuery.categories.some((c) => features.categories.includes(c));
    reasons.push(`categories [${parsedQuery.categories}]: ${match ? "\u2713" : "\u2717"}`);
  }
  const relevantTags = enforceAllTags ? parsedQuery.tags : ALWAYS_STRICT_TAGS.filter((t) => parsedQuery.tags.includes(t));
  for (const tag of relevantTags) {
    if (tag === "open_now") continue;
    const match = features.tags.includes(tag);
    reasons.push(`tag [${tag}] (${enforceAllTags ? "AND-enforced" : "strict"}): ${match ? "\u2713" : "\u2717"}`);
  }
  return { passed, score: breakdown.total, reasons };
}
export {
  explainFilter,
  filterRestaurantsByDiscovery,
  matchQueryToTaxonomy,
  rankRestaurantsByDiscovery,
  runDiscovery,
  scoreRestaurant
};
