/**
 * Adapter: LegacyRestaurant (DB row) -> TaxonomyMatch
 *
 * Backward compatibility:
 * - If new DB taxonomy fields are populated, use them.
 * - If fields are missing/empty, fall back to runtime keyword inference.
 */

import {
  TopGroupID,
  CategoryID,
  CoreTag,
  TaxonomyMatch,
  TOP_GROUP_KEYWORDS,
  CATEGORY_KEYWORDS,
  CORE_TAG_KEYWORDS,
} from './taxonomy.runtime.js';

export interface LegacyRestaurant {
  id: string;
  name: string;
  city?: string;
  address?: string;
  cuisine_type?: string;
  description?: string;
  menu?: unknown;
  tags?: string[];
  price_level?: number;
  rating?: number;
  distance?: number;
  lat?: number;
  lng?: number;
  supportsDelivery?: boolean;
  supports_delivery?: boolean;
  deliveryAvailable?: boolean;
  delivery_available?: boolean;
  taxonomy_groups?: TopGroupID[] | string[] | string | null;
  taxonomy_cats?: CategoryID[] | string[] | string | null;
  taxonomy_tags?: CoreTag[] | string[] | string | null;
  [key: string]: unknown;
}

export interface EnrichedRestaurant extends LegacyRestaurant {
  _taxonomy: TaxonomyMatch;
  _price_level: number;
  _supports_delivery: boolean;
}

const TOP_GROUP_IDS = new Set<TopGroupID>(Object.keys(TOP_GROUP_KEYWORDS) as TopGroupID[]);
const CATEGORY_IDS = new Set<CategoryID>(Object.keys(CATEGORY_KEYWORDS) as CategoryID[]);
const CORE_TAG_IDS = new Set<CoreTag>(Object.keys(CORE_TAG_KEYWORDS) as CoreTag[]);

function toStringArray(input: unknown): string[] {
  if (Array.isArray(input)) {
    return input
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .filter(Boolean);
  }

  if (typeof input !== 'string') return [];
  const trimmed = input.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .map((value) => (typeof value === 'string' ? value.trim() : ''))
          .filter(Boolean);
      }
    } catch {
      // fall through to delimiter split
    }
  }

  if (/[,;|]/.test(trimmed)) {
    return trimmed
      .split(/[,;|]/)
      .map((value) => value.trim())
      .filter(Boolean);
  }

  return [trimmed];
}

function coerceEnumArray<T extends string>(input: unknown, allowed: Set<T>): T[] {
  const out: T[] = [];
  for (const raw of toStringArray(input)) {
    const normalized = raw.toLowerCase().trim() as T;
    if (allowed.has(normalized) && !out.includes(normalized)) {
      out.push(normalized);
    }
  }
  return out;
}

function resolveDescription(r: LegacyRestaurant): string {
  const description = r?.description;
  if (typeof description === 'string' && description.trim()) {
    return description;
  }
  return '';
}

function buildSearchCorpus(r: LegacyRestaurant): string {
  const parts: string[] = [];

  if (r?.name) parts.push(r.name);
  if (r?.cuisine_type) parts.push(r.cuisine_type);

  const description = resolveDescription(r);
  if (description) parts.push(description);

  if (Array.isArray(r?.tags)) {
    parts.push(...r.tags);
  }

  if (r?.menu) {
    try {
      const menuText = typeof r.menu === 'string' ? r.menu : JSON.stringify(r.menu);
      parts.push(menuText);
    } catch {
      // ignore non-serializable menu payloads
    }
  }

  return parts.join(' ').toLowerCase();
}

function corpusHasKeyword(corpus: string, keyword: string): boolean {
  return corpus.includes(keyword);
}

function resolvePriceLevel(r: LegacyRestaurant): number {
  if (typeof r?.price_level === 'number' && r.price_level >= 1 && r.price_level <= 4) {
    return r.price_level;
  }

  const corpus = buildSearchCorpus(r);
  if (corpus.includes('fine dining') || corpus.includes('wykwintne')) return 4;
  if (corpus.includes('premium') || corpus.includes('eleganckie')) return 3;
  if (corpus.includes('tanie') || corpus.includes('budzet') || corpus.includes('budżet') || corpus.includes('najtaniej')) return 1;
  return 2;
}

function resolveSupportsDelivery(r: LegacyRestaurant): boolean {
  if (typeof r?.supports_delivery === 'boolean') return r.supports_delivery;
  if (typeof r?.supportsDelivery === 'boolean') return r.supportsDelivery;
  if (typeof r?.delivery_available === 'boolean') return r.delivery_available;
  if (typeof r?.deliveryAvailable === 'boolean') return r.deliveryAvailable;

  const corpus = buildSearchCorpus(r);
  return corpus.includes('dostawa') || corpus.includes('dowoz') || corpus.includes('dowóz') || corpus.includes('wolt') || corpus.includes('glovo');
}

function inferTaxonomyFromCorpus(corpus: string): TaxonomyMatch {
  const inferredTopGroups = new Set<TopGroupID>();
  const inferredCategories = new Set<CategoryID>();
  const inferredTags = new Set<CoreTag>();

  for (const [group, keywords] of Object.entries(TOP_GROUP_KEYWORDS) as [TopGroupID, string[]][]) {
    if (keywords.some((kw) => corpusHasKeyword(corpus, kw))) {
      inferredTopGroups.add(group);
    }
  }

  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS) as [CategoryID, string[]][]) {
    if (keywords.some((kw) => corpusHasKeyword(corpus, kw))) {
      inferredCategories.add(cat);
    }
  }

  for (const [tag, keywords] of Object.entries(CORE_TAG_KEYWORDS) as [CoreTag, string[]][]) {
    if (keywords.some((kw) => corpusHasKeyword(corpus, kw))) {
      inferredTags.add(tag);
    }
  }

  return {
    topGroups: Array.from(inferredTopGroups),
    categories: Array.from(inferredCategories),
    tags: Array.from(inferredTags),
  };
}

export function mapRestaurantToFeatures(r: LegacyRestaurant): TaxonomyMatch {
  const dbTopGroups = coerceEnumArray<TopGroupID>(r?.taxonomy_groups, TOP_GROUP_IDS);
  const dbCategories = coerceEnumArray<CategoryID>(r?.taxonomy_cats, CATEGORY_IDS);
  const dbTags = coerceEnumArray<CoreTag>(r?.taxonomy_tags, CORE_TAG_IDS);

  // DB short-circuit: if taxonomy_groups is populated, trust DB metadata.
  if (dbTopGroups.length > 0) {
    const topGroups = new Set<TopGroupID>(dbTopGroups);
    const categories = new Set<CategoryID>(dbCategories);
    const tags = new Set<CoreTag>(dbTags);

    if (topGroups.has('fast_food')) {
      tags.add('quick');
    }

    if (resolveSupportsDelivery(r)) {
      tags.add('delivery');
    }

    return {
      topGroups: Array.from(topGroups),
      categories: Array.from(categories),
      tags: Array.from(tags),
    };
  }

  const corpus = buildSearchCorpus(r);
  const inferred = inferTaxonomyFromCorpus(corpus);
  const topGroups = new Set<TopGroupID>(inferred.topGroups);
  const categories = new Set<CategoryID>(inferred.categories);
  const tags = new Set<CoreTag>(inferred.tags);

  if (topGroups.has('fast_food')) {
    tags.add('quick');
  }

  if (resolveSupportsDelivery(r)) {
    tags.add('delivery');
  }

  return {
    topGroups: Array.from(topGroups),
    categories: Array.from(categories),
    tags: Array.from(tags),
  };
}

export function enrichRestaurant(r: LegacyRestaurant): EnrichedRestaurant {
  return {
    ...r,
    _taxonomy: mapRestaurantToFeatures(r),
    _price_level: resolvePriceLevel(r),
    _supports_delivery: resolveSupportsDelivery(r),
  };
}
