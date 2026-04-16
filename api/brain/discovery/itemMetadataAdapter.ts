/**
 * itemMetadataAdapter.ts
 *
 * Runtime mapper for menu item metadata.
 * Supports:
 * - DB-backed metadata fields when available
 * - fallback inference for legacy/non-backfilled rows
 */

export interface LegacyMenuItem {
  id?: string;
  name?: string;
  base_name?: string;
  item_family?: string;
  item_variant?: string;
  item_aliases?: string[] | string | null;
  item_tags?: string[] | string | null;
  dietary_flags?: string[] | string | null;
  [key: string]: unknown;
}

export interface ItemMetadata {
  item_family: string | null;
  item_variant: string | null;
  item_aliases: string[];
  item_tags: string[];
  dietary_flags: string[];
  base_name: string;
}

const ITEM_FAMILY_DICTIONARY: Record<string, string[]> = {
  rollo: ['rollo', 'rolo', 'rollo kebab', 'kebab rollo', 'durum rollo'],
  calzone: ['calzone', 'pizza calzone'],
  schabowy: ['schabowy', 'kotlet schabowy', 'schab tradycyjny'],
  nalesnik: ['nalesnik', 'nalesniki', 'naleśnik', 'naleśniki'],
  pierogi: ['pierogi', 'pierog', 'pieróg'],
  zurek: ['zurek', 'żurek', 'zur slaski', 'żur śląski'],
};

function pickNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeLooseText(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toStringArray(input: unknown): string[] {
  if (Array.isArray(input)) {
    return input
      .map((value) => pickNonEmptyString(value) || '')
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
          .map((value) => pickNonEmptyString(value) || '')
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

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function inferItemFamily(itemName: unknown): string | null {
  const normalized = normalizeLooseText(itemName);
  if (!normalized) return null;

  for (const [family, terms] of Object.entries(ITEM_FAMILY_DICTIONARY)) {
    const normalizedTerms = terms.map((term) => normalizeLooseText(term));
    if (
      normalized === family ||
      normalizedTerms.some((term) => normalized.includes(term) || term.includes(normalized))
    ) {
      return family;
    }
  }

  const firstToken = normalized.split(' ').find((token) => token.length >= 3);
  return firstToken || null;
}

function resolveBaseName(item: LegacyMenuItem): string {
  const baseFromDb = pickNonEmptyString(item?.base_name);
  if (baseFromDb) return baseFromDb;
  return normalizeLooseText(item?.name);
}

function buildFallbackAliases(name: unknown, baseName: string, family: string | null): string[] {
  const aliases = new Set<string>();

  const normalizedName = normalizeLooseText(name);
  if (normalizedName) aliases.add(normalizedName);
  if (baseName) aliases.add(baseName);

  if (family) {
    aliases.add(normalizeLooseText(family));
    for (const term of ITEM_FAMILY_DICTIONARY[family] || []) {
      const normalizedTerm = normalizeLooseText(term);
      if (normalizedTerm) aliases.add(normalizedTerm);
    }
  }

  const tokenSource = `${normalizedName} ${baseName}`.trim();
  for (const token of tokenSource.split(' ')) {
    if (token.length >= 4) aliases.add(token);
  }

  return uniqueStrings(Array.from(aliases));
}

export function mapItemToMetadata(item: LegacyMenuItem): ItemMetadata {
  const baseName = resolveBaseName(item);

  const itemFamily = pickNonEmptyString(item?.item_family) || inferItemFamily(item?.name || baseName);
  const itemVariant = pickNonEmptyString(item?.item_variant) || null;

  const dbAliases = uniqueStrings(toStringArray(item?.item_aliases));
  const dbItemTags = uniqueStrings(toStringArray(item?.item_tags));
  const dbDietaryFlags = uniqueStrings(toStringArray(item?.dietary_flags));

  return {
    item_family: itemFamily,
    item_variant: itemVariant,
    item_aliases: dbAliases.length > 0 ? dbAliases : buildFallbackAliases(item?.name, baseName, itemFamily),
    item_tags: dbItemTags.length > 0 ? dbItemTags : [],
    dietary_flags: dbDietaryFlags.length > 0 ? dbDietaryFlags : [],
    base_name: baseName,
  };
}
