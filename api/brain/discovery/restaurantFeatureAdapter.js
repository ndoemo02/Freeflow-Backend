import {
  TOP_GROUP_KEYWORDS,
  CATEGORY_KEYWORDS,
  CORE_TAG_KEYWORDS
} from "./taxonomy.runtime.js";
const TOP_GROUP_IDS = new Set(Object.keys(TOP_GROUP_KEYWORDS));
const CATEGORY_IDS = new Set(Object.keys(CATEGORY_KEYWORDS));
const CORE_TAG_IDS = new Set(Object.keys(CORE_TAG_KEYWORDS));
function toStringArray(input) {
  if (Array.isArray(input)) {
    return input.map((value) => typeof value === "string" ? value.trim() : "").filter(Boolean);
  }
  if (typeof input !== "string") return [];
  const trimmed = input.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((value) => typeof value === "string" ? value.trim() : "").filter(Boolean);
      }
    } catch {
    }
  }
  if (/[,;|]/.test(trimmed)) {
    return trimmed.split(/[,;|]/).map((value) => value.trim()).filter(Boolean);
  }
  return [trimmed];
}
function coerceEnumArray(input, allowed) {
  const out = [];
  for (const raw of toStringArray(input)) {
    const normalized = raw.toLowerCase().trim();
    if (allowed.has(normalized) && !out.includes(normalized)) {
      out.push(normalized);
    }
  }
  return out;
}
function resolveDescription(r) {
  const description = r?.description;
  if (typeof description === "string" && description.trim()) {
    return description;
  }
  return "";
}
function buildSearchCorpus(r) {
  const parts = [];
  if (r?.name) parts.push(r.name);
  if (r?.cuisine_type) parts.push(r.cuisine_type);
  const description = resolveDescription(r);
  if (description) parts.push(description);
  if (Array.isArray(r?.tags)) {
    parts.push(...r.tags);
  }
  if (r?.menu) {
    try {
      const menuText = typeof r.menu === "string" ? r.menu : JSON.stringify(r.menu);
      parts.push(menuText);
    } catch {
    }
  }
  return parts.join(" ").toLowerCase();
}
function corpusHasKeyword(corpus, keyword) {
  return corpus.includes(keyword);
}
function resolvePriceLevel(r) {
  if (typeof r?.price_level === "number" && r.price_level >= 1 && r.price_level <= 4) {
    return r.price_level;
  }
  const corpus = buildSearchCorpus(r);
  if (corpus.includes("fine dining") || corpus.includes("wykwintne")) return 4;
  if (corpus.includes("premium") || corpus.includes("eleganckie")) return 3;
  if (corpus.includes("tanie") || corpus.includes("budzet") || corpus.includes("bud\u017Cet") || corpus.includes("najtaniej")) return 1;
  return 2;
}
function resolveSupportsDelivery(r) {
  if (typeof r?.supports_delivery === "boolean") return r.supports_delivery;
  if (typeof r?.supportsDelivery === "boolean") return r.supportsDelivery;
  if (typeof r?.delivery_available === "boolean") return r.delivery_available;
  if (typeof r?.deliveryAvailable === "boolean") return r.deliveryAvailable;
  const corpus = buildSearchCorpus(r);
  return corpus.includes("dostawa") || corpus.includes("dowoz") || corpus.includes("dow\xF3z") || corpus.includes("wolt") || corpus.includes("glovo");
}
function inferTaxonomyFromCorpus(corpus) {
  const inferredTopGroups = /* @__PURE__ */ new Set();
  const inferredCategories = /* @__PURE__ */ new Set();
  const inferredTags = /* @__PURE__ */ new Set();
  for (const [group, keywords] of Object.entries(TOP_GROUP_KEYWORDS)) {
    if (keywords.some((kw) => corpusHasKeyword(corpus, kw))) {
      inferredTopGroups.add(group);
    }
  }
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => corpusHasKeyword(corpus, kw))) {
      inferredCategories.add(cat);
    }
  }
  for (const [tag, keywords] of Object.entries(CORE_TAG_KEYWORDS)) {
    if (keywords.some((kw) => corpusHasKeyword(corpus, kw))) {
      inferredTags.add(tag);
    }
  }
  return {
    topGroups: Array.from(inferredTopGroups),
    categories: Array.from(inferredCategories),
    tags: Array.from(inferredTags)
  };
}
function mapRestaurantToFeatures(r) {
  const dbTopGroups = coerceEnumArray(r?.taxonomy_groups, TOP_GROUP_IDS);
  const dbCategories = coerceEnumArray(r?.taxonomy_cats, CATEGORY_IDS);
  const dbTags = coerceEnumArray(r?.taxonomy_tags, CORE_TAG_IDS);
  if (dbTopGroups.length > 0) {
    const topGroups2 = new Set(dbTopGroups);
    const categories2 = new Set(dbCategories);
    const tags2 = new Set(dbTags);
    if (topGroups2.has("fast_food")) {
      tags2.add("quick");
    }
    if (resolveSupportsDelivery(r)) {
      tags2.add("delivery");
    }
    return {
      topGroups: Array.from(topGroups2),
      categories: Array.from(categories2),
      tags: Array.from(tags2)
    };
  }
  const corpus = buildSearchCorpus(r);
  const inferred = inferTaxonomyFromCorpus(corpus);
  const topGroups = new Set(inferred.topGroups);
  const categories = new Set(inferred.categories);
  const tags = new Set(inferred.tags);
  if (topGroups.has("fast_food")) {
    tags.add("quick");
  }
  if (resolveSupportsDelivery(r)) {
    tags.add("delivery");
  }
  return {
    topGroups: Array.from(topGroups),
    categories: Array.from(categories),
    tags: Array.from(tags)
  };
}
function enrichRestaurant(r) {
  return {
    ...r,
    _taxonomy: mapRestaurantToFeatures(r),
    _price_level: resolvePriceLevel(r),
    _supports_delivery: resolveSupportsDelivery(r)
  };
}
export {
  enrichRestaurant,
  mapRestaurantToFeatures
};
