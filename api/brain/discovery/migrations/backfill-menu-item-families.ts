/**
 * backfill-menu-item-families.ts
 * ─────────────────────────────────────────────────────────────
 * Populates `item_family` in `menu_items_v2`.
 *
 * Source of truth: ITEM_FAMILY_DICTIONARY from itemMetadataAdapter.ts
 * Matching: DICTIONARY-ONLY (no first-token fallback — avoids wrong tagging)
 *
 * A row gets item_family only when its name (or base_name) contains
 * a known alias from the dictionary with confidence score >= 100.
 *
 * Families supported:
 *   rollo | calzone | schabowy | nalesnik | pierogi | zurek
 *   + extended: kebab | pizza | burger | gyros | pita | lawasz
 *
 * Usage:
 *   DRY_RUN=true  npx ts-node --esm brain/discovery/migrations/backfill-menu-item-families.ts
 *   DRY_RUN=false npx ts-node --esm brain/discovery/migrations/backfill-menu-item-families.ts
 *
 * Project: FreeFlow (ezemaacyyvbpjlagchds)
 */

import { createClient } from '@supabase/supabase-js';

// ─── Config ────────────────────────────────────────────────────

const SUPABASE_URL = 'https://ezemaacyyvbpjlagchds.supabase.co';
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV6ZW1hYWN5eXZicGpsYWdjaGRzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk3ODU1MzYsImV4cCI6MjA3NTM2MTUzNn0.uRKmqxL0Isx3DmOxmgc_zPwG5foYXft9WpIROoTTgGU';

const DRY_RUN = process.env.DRY_RUN !== 'false'; // default: true

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── ITEM_FAMILY_DICTIONARY ─────────────────────────────────────
// Source: itemMetadataAdapter.ts — extended with discovery-critical families.
// Values are alias terms; keys are canonical family IDs stored in DB.
//
// NOTE: 'lawasz' is a restaurant name (LAWASZ KEBAB), not a dish family —
//       queries for 'lawasz' resolve via restaurant name, not item_family.
//       Kept here only as reference / potential alias of 'pita'.

const ITEM_FAMILY_DICTIONARY: Record<string, string[]> = {
  // ── Core families from itemMetadataAdapter.ts ──
  rollo:    ['rollo', 'rolo', 'rollo kebab', 'kebab rollo', 'durum rollo', 'kebab w durum', 'durum'],
  calzone:  ['calzone', 'pizza calzone'],
  schabowy: ['schabowy', 'kotlet schabowy', 'schab tradycyjny', 'tradycyjny schabowy'],
  nalesnik: ['nalesnik', 'nalesniki', 'naleśnik', 'naleśniki'],
  pierogi:  ['pierogi', 'pierog', 'pieróg', 'pierogi ruskie', 'uszka'],
  zurek:    ['zurek', 'żurek', 'zur slaski', 'żur śląski', 'zur śląski'],

  // ── Extended families for item-led discovery ──
  kebab:    ['kebab', 'kebab box', 'kebab w bułce', 'kebab americański', 'döner', 'doner', 'shawarma', 'falafel', 'gyros'],
  pizza:    ['pizza', 'pizzę', 'margherita', 'capricciosa', 'hawajska', 'diavola', 'pepperoni', 'quattro formaggi',
             'vegetariana', 'salami pizza', 'calzone'],
  burger:   ['burger', 'hamburgер', 'cheeseburger', 'smash burger'],
  pita:     ['pita', 'pita rollo', 'pita kebab'],
  gyros:    ['gyros', 'gyros box', 'gyros z frytkami'],
  sajgonka: ['sajgonki', 'sajgonka'],
  stek:     ['stek', 'steki', 'ribeye', 'antrykot', 't-bone'],
};

// ─── Normalizer (mirrors itemMetadataAdapter normalizeLooseText) ───

function normalize(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── STRICT dictionary match (no token fallback) ───────────────────

interface MatchResult {
  family: string;
  matchedAlias: string;
  score: number;
}

function matchItemFamily(name: string, baseName: string | null): MatchResult | null {
  const normName = normalize(name);
  const normBase = normalize(baseName ?? '');

  for (const [family, aliases] of Object.entries(ITEM_FAMILY_DICTIONARY)) {
    for (const alias of aliases) {
      const normAlias = normalize(alias);

      // Exact match → score 200 (highest confidence)
      if (normName === normAlias || normBase === normAlias) {
        return { family, matchedAlias: alias, score: 200 };
      }

      // Contains match (name contains alias) → score 100
      if (normName.includes(normAlias) || normBase.includes(normAlias)) {
        return { family, matchedAlias: alias, score: 100 };
      }
    }
  }

  return null;
}

// ─── Types ─────────────────────────────────────────────────────

type MenuItemRow = {
  id: string;
  name: string;
  base_name?: string | null;
  item_family?: string | null;
};

// ─── Main ────────────────────────────────────────────────────────

async function main() {
  console.log(`\n╔══════════════════════════════════════════════════════╗`);
  console.log(`║  Menu Item Family Backfill                           ║`);
  console.log(`║  Mode: ${DRY_RUN ? 'DRY RUN — no writes will occur        ' : 'LIVE    — writing to production DB     '}║`);
  console.log(`╚══════════════════════════════════════════════════════╝\n`);

  const { data: items, error } = await supabase
    .from('menu_items_v2')
    .select('id, name, base_name, item_family')
    .order('name');

  if (error) {
    console.error('❌ Failed to fetch items:', error.message);
    process.exit(1);
  }

  if (!items || items.length === 0) {
    console.log('⚠️  No items found.');
    return;
  }

  console.log(`📋 Fetched ${items.length} menu item(s)\n`);

  // ── Categorize
  const toUpdate: Array<{ id: string; name: string; family: string; alias: string; score: number }> = [];
  const uncertain: Array<{ id: string; name: string }> = [];
  const alreadySet: Array<{ id: string; name: string; current: string }> = [];

  const familyDistribution: Record<string, number> = {};

  for (const item of items as MenuItemRow[]) {
    if (item.item_family) {
      alreadySet.push({ id: item.id, name: item.name, current: item.item_family });
      familyDistribution[item.item_family] = (familyDistribution[item.item_family] ?? 0) + 1;
      continue;
    }

    const match = matchItemFamily(item.name, item.base_name ?? null);

    if (match && match.score >= 100) {
      toUpdate.push({ id: item.id, name: item.name, family: match.family, alias: match.matchedAlias, score: match.score });
      familyDistribution[match.family] = (familyDistribution[match.family] ?? 0) + 1;
    } else {
      uncertain.push({ id: item.id, name: item.name });
    }
  }

  // ── Print matched
  if (toUpdate.length > 0) {
    console.log('✅  MATCHED — will receive item_family:');
    console.log('─'.repeat(70));
    for (const u of toUpdate) {
      const scoreLabel = u.score === 200 ? '[EXACT]  ' : '[CONTAINS]';
      console.log(`  ${scoreLabel} "${u.name}"`);
      console.log(`            → family: "${u.family}" (matched alias: "${u.alias}")`);
    }
    console.log();
  }

  // ── Print uncertain
  if (uncertain.length > 0) {
    console.log('⚠️   UNCERTAIN — no dictionary match (item_family stays NULL):');
    console.log('─'.repeat(70));
    const sample = uncertain.slice(0, 15);
    for (const u of sample) {
      console.log(`  "${u.name}"`);
    }
    if (uncertain.length > 15) {
      console.log(`  ... and ${uncertain.length - 15} more`);
    }
    console.log();
  }

  // ── Print already set
  if (alreadySet.length > 0) {
    console.log(`ℹ️   SKIPPED — already have item_family: ${alreadySet.length} item(s)`);
    console.log();
  }

  // ── Summary
  console.log('═'.repeat(70));
  console.log('📊 DRY-RUN SUMMARY');
  console.log('─'.repeat(70));
  console.log(`   Total items:          ${items.length}`);
  console.log(`   Already classified:   ${alreadySet.length}`);
  console.log(`   Would receive family: ${toUpdate.length}`);
  console.log(`   Uncertain (no match): ${uncertain.length}`);
  console.log();
  console.log('📦 Family distribution (post-backfill):');
  const sorted = Object.entries(familyDistribution).sort((a, b) => b[1] - a[1]);
  for (const [family, count] of sorted) {
    const bar = '█'.repeat(Math.min(count * 2, 30));
    console.log(`   ${family.padEnd(14)} ${String(count).padStart(3)}  ${bar}`);
  }
  console.log('═'.repeat(70));

  if (DRY_RUN) {
    console.log(`\n⚠️  DRY RUN — no changes written.`);
    console.log(`   Re-run with DRY_RUN=false to apply.\n`);
    return;
  }

  // ── LIVE WRITE
  console.log(`\n🚀 Writing to DB...`);
  let updated = 0;
  let failed = 0;

  for (const u of toUpdate) {
    const { error: updateError } = await supabase
      .from('menu_items_v2')
      .update({ item_family: u.family })
      .eq('id', u.id);

    if (updateError) {
      console.error(`❌ Failed: "${u.name}" → ${updateError.message}`);
      failed++;
    } else {
      console.log(`✅ "${u.name}" → ${u.family}`);
      updated++;
    }
  }

  // ── Final report
  console.log(`\n╔══════════════════════════════════════════════════════╗`);
  console.log(`║  BACKFILL COMPLETE                                   ║`);
  console.log(`╠══════════════════════════════════════════════════════╣`);
  console.log(`║  Total items:          ${String(items.length).padEnd(29)}║`);
  console.log(`║  Classified (new):     ${String(updated).padEnd(29)}║`);
  console.log(`║  Failed writes:        ${String(failed).padEnd(29)}║`);
  console.log(`║  Uncertain (NULL):     ${String(uncertain.length).padEnd(29)}║`);
  console.log(`╠══════════════════════════════════════════════════════╣`);
  console.log(`║  Family distribution:                                ║`);
  for (const [family, count] of sorted) {
    console.log(`║    ${family.padEnd(16)} ${String(count).padStart(3)} item(s)              ║`);
  }
  console.log(`╚══════════════════════════════════════════════════════╝\n`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
