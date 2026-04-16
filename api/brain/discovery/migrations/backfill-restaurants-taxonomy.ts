/**
 * backfill-restaurants-taxonomy.ts
 * ─────────────────────────────────────────────────────────────
 * Populates these new columns on the `restaurants` table:
 *   - taxonomy_groups  (TEXT[])
 *   - taxonomy_cats    (TEXT[])
 *   - taxonomy_tags    (TEXT[]) — 'open_now' is NEVER stored
 *   - price_level      (SMALLINT 1-4)
 *
 * Logic mirrors restaurantFeatureAdapter.ts + taxonomy.runtime.ts.
 * Inline to avoid ES module import chain issues at runtime.
 *
 * Usage:
 *   DRY_RUN=true npx ts-node backfill-restaurants-taxonomy.ts
 *   DRY_RUN=false npx ts-node backfill-restaurants-taxonomy.ts
 *
 * Project: FreeFlow (ezemaacyyvbpjlagchds)
 */

import { createClient } from '@supabase/supabase-js';

// ─── Config ────────────────────────────────────────────────────

const SUPABASE_URL = 'https://ezemaacyyvbpjlagchds.supabase.co';
// Use service role key for write access (set as env var in production).
// Falls back to anon key for read-only dry-run if SERVICE_KEY not set.
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV6ZW1hYWN5eXZicGpsYWdjaGRzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk3ODU1MzYsImV4cCI6MjA3NTM2MTUzNn0.uRKmqxL0Isx3DmOxmgc_zPwG5foYXft9WpIROoTTgGU';

const DRY_RUN = process.env.DRY_RUN !== 'false'; // default: true

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── Inline taxonomy maps (from taxonomy.runtime.ts) ──────────

const TOP_GROUP_KEYWORDS: Record<string, string[]> = {
  fast_food:     ['fast food', 'burger', 'burgery', 'hot dog', 'hotdog', 'zapiekanka', 'frytki', 'nuggets', 'szybkie jedzenie', 'na szybko'],
  pizza_italian: ['pizza', 'pizzę', 'pizzy', 'pizzeria', 'pizzerii', 'pizzerię', 'pasta', 'spaghetti', 'carbonara', 'bolognese', 'lasagne', 'risotto', 'włoska', 'włoskie'],
  asian:         ['sushi', 'ramen', 'wok', 'maki', 'nigiri', 'pho', 'pad thai', 'dim sum', 'azjatyckie', 'azja', 'chińskie', 'chinka', 'tajskie', 'japońskie', 'wietnamskie', 'wietnamska', 'wietnam'],
  polish:        ['pierogi', 'żurek', 'barszcz', 'schabowy', 'bigos', 'kotlet', 'rosół', 'gołąbki', 'polskie', 'polska kuchnia', 'domowe', 'tradycyjne', 'polska', 'śląska', 'kuchnia polska'],
  grill:         ['kebab', 'döner', 'doner', 'stek', 'steki', 'wołowina', 'żeberka', 'bbq', 'z rusztu', 'grill', 'grillowane'],
  desserts_cafe: ['kawa', 'kawę', 'cappuccino', 'latte', 'espresso', 'ciasto', 'tort', 'lody', 'naleśniki', 'waffle', 'gofry', 'deser', 'desery', 'kawiarnia', 'cukiernia'],
};

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  burgers:        ['burger', 'burgery', 'hamburger', 'cheeseburger', 'smash burger'],
  kebab:          ['kebab', 'döner', 'doner', 'shawarma', 'falafel', 'gyros'],
  pizza_takeaway: ['pizza na wynos', 'pizza z dostawą'],
  hot_snacks:     ['frytki', 'nuggets', 'hot dog', 'hotdog', 'zapiekanka', 'tortilla'],
  pizza:          ['pizza', 'pizzę', 'pizzy', 'pizzeria', 'pizzerii', 'pizzerię', 'neapolitańska', 'margarita'],
  pasta:          ['pasta', 'spaghetti', 'carbonara', 'bolognese', 'lasagne', 'tagliatelle'],
  risotto:        ['risotto', 'bruschetta', 'tiramisu'],
  sushi:          ['sushi', 'maki', 'nigiri', 'temaki', 'sashimi', 'uramaki', 'japońskie'],
  ramen_noodles:  ['ramen', 'udon', 'soba', 'pad thai', 'lo mein', 'makaron azjatycki'],
  vietnamese:     ['pho', 'bun bo', 'banh mi', 'wietnamskie', 'wietnam'],
  chinese:        ['chińskie', 'wok', 'dim sum', 'chow mein', 'chinka'],
  thai:           ['tajskie', 'pad thai', 'green curry', 'tom yum'],
  pierogi:        ['pierogi', 'kopytka', 'uszka'],
  zupy:           ['żurek', 'barszcz', 'rosół', 'zupa', 'flaki', 'grochówka', 'zupy'],
  tradycyjne:     ['schabowy', 'bigos', 'kotlet', 'gołąbki', 'zrazy', 'tradycyjne'],
  kebab_grill:    ['kebab z grilla', 'kebab sit-down'],
  steak:          ['stek', 'steki', 'wołowina', 't-bone', 'ribeye', 'antrykot'],
  bbq:            ['bbq', 'żeberka', 'pulled pork', 'smoker', 'wędzony'],
  cafe:           ['kawa', 'kawę', 'espresso', 'cappuccino', 'latte', 'americano', 'kawiarnia'],
  cake_bakery:    ['ciasto', 'tort', 'croissant', 'muffin', 'chleb', 'piekarnia', 'cukiernia'],
  ice_cream:      ['lody', 'gelato', 'naleśniki', 'waffle', 'gofry'],
};

// open_now is NEVER stored — filtered out below
const CORE_TAG_KEYWORDS: Record<string, string[]> = {
  spicy:    ['ostre', 'pikantne', 'pikantny', 'chilli', 'sriracha', 'piekące'],
  vege:     ['wege', 'wegetariańskie', 'wegetariański', 'bez mięsa', 'wegańskie', 'vegan', 'roślinne'],
  quick:    ['szybko', 'szybkie', 'szybki', 'na szybko', 'express', 'fast'],
  delivery: ['dostawa', 'dowóz', 'przynieś', 'wolt', 'uber eats', 'glovo', 'z dostawą', 'na wynos z dostawą'],
  // open_now intentionally omitted
};

// ─── Inline inference logic (mirrors adapter) ───────────────────

type RestaurantRow = {
  id: string;
  name: string;
  cuisine_type?: string | null;
  delivery_available?: boolean | null;
  price_level?: number | null;
  taxonomy_groups?: string[] | null;
};

function buildCorpus(r: RestaurantRow): string {
  return [r.name, r.cuisine_type ?? ''].join(' ').toLowerCase();
}

function inferFromCorpus(corpus: string): {
  taxonomy_groups: string[];
  taxonomy_cats: string[];
  taxonomy_tags: string[];
} {
  const groups: string[] = [];
  const cats: string[] = [];
  const tags: string[] = [];

  for (const [group, keywords] of Object.entries(TOP_GROUP_KEYWORDS)) {
    if (keywords.some((kw) => corpus.includes(kw))) groups.push(group);
  }

  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => corpus.includes(kw))) cats.push(cat);
  }

  for (const [tag, keywords] of Object.entries(CORE_TAG_KEYWORDS)) {
    if (keywords.some((kw) => corpus.includes(kw))) tags.push(tag);
  }

  // fast_food → always add 'quick' tag
  if (groups.includes('fast_food') && !tags.includes('quick')) tags.push('quick');

  // delivery signal from existing column
  return { taxonomy_groups: groups, taxonomy_cats: cats, taxonomy_tags: tags };
}

function resolvePriceLevel(r: RestaurantRow, corpus: string): number {
  if (typeof r.price_level === 'number' && r.price_level >= 1 && r.price_level <= 4) return r.price_level;
  if (corpus.includes('fine dining') || corpus.includes('wykwintne')) return 4;
  if (corpus.includes('premium') || corpus.includes('eleganckie')) return 3;
  if (corpus.includes('tanie') || corpus.includes('budżet') || corpus.includes('najtaniej')) return 1;
  return 2;
}

// ─── Main ────────────────────────────────────────────────────────

async function main() {
  console.log(`\n╔══════════════════════════════════════════════════════╗`);
  console.log(`║  Restaurant Taxonomy Backfill                        ║`);
  console.log(`║  Mode: ${DRY_RUN ? 'DRY RUN — no writes will occur        ' : 'LIVE    — writing to production DB     '}║`);
  console.log(`╚══════════════════════════════════════════════════════╝\n`);

  // Fetch all restaurants
  const { data: restaurants, error } = await supabase
    .from('restaurants')
    .select('id, name, cuisine_type, delivery_available, price_level, taxonomy_groups')
    .order('name');

  if (error) {
    console.error('❌ Failed to fetch restaurants:', error.message);
    process.exit(1);
  }

  if (!restaurants || restaurants.length === 0) {
    console.log('⚠️  No restaurants found.');
    return;
  }

  console.log(`📋 Fetched ${restaurants.length} restaurant(s)\n`);
  console.log('─'.repeat(60));

  // ── Stats counters
  let updated = 0;
  let skipped = 0;
  let uncertain = 0;

  const updates: Array<{
    id: string;
    name: string;
    taxonomy_groups: string[];
    taxonomy_cats: string[];
    taxonomy_tags: string[];
    price_level: number;
    uncertain: boolean;
  }> = [];

  for (const r of restaurants as RestaurantRow[]) {
    const corpus = buildCorpus(r);
    const inferred = inferFromCorpus(corpus);
    const price_level = resolvePriceLevel(r, corpus);

    // Add delivery tag if delivery_available is true
    if (r.delivery_available === true && !inferred.taxonomy_tags.includes('delivery')) {
      inferred.taxonomy_tags.push('delivery');
    }

    const isUncertain = inferred.taxonomy_groups.length === 0;

    updates.push({
      id: r.id,
      name: r.name,
      ...inferred,
      price_level,
      uncertain: isUncertain,
    });

    // ── Per-restaurant log
    const status = isUncertain ? '⚠️  UNCERTAIN' : '✅';
    console.log(`${status} ${r.name}`);
    if (inferred.taxonomy_groups.length > 0) {
      console.log(`   groups: [${inferred.taxonomy_groups.join(', ')}]`);
      console.log(`   cats:   [${inferred.taxonomy_cats.join(', ')}]`);
      console.log(`   tags:   [${inferred.taxonomy_tags.join(', ')}]`);
    } else {
      console.log(`   corpus: "${corpus.slice(0, 80)}..."`);
      console.log(`   → No taxonomy match. Will store empty arrays.`);
    }
    console.log(`   price_level: ${price_level}`);
    console.log();

    if (isUncertain) uncertain++;
  }

  console.log('─'.repeat(60));
  console.log(`\n📊 DRY-RUN SUMMARY`);
  console.log(`   Total rows:   ${restaurants.length}`);
  console.log(`   Would update: ${updates.length}`);
  console.log(`   Uncertain:    ${uncertain} (taxonomy_groups will be [])`);

  if (DRY_RUN) {
    console.log(`\n⚠️  DRY RUN — no changes written.`);
    console.log(`   Re-run with DRY_RUN=false to apply.\n`);
    return;
  }

  // ── LIVE WRITE
  console.log(`\n🚀 Writing to DB...`);

  for (const u of updates) {
    const { error: updateError } = await supabase
      .from('restaurants')
      .update({
        taxonomy_groups: u.taxonomy_groups,
        taxonomy_cats: u.taxonomy_cats,
        taxonomy_tags: u.taxonomy_tags,
        price_level: u.price_level,
      })
      .eq('id', u.id);

    if (updateError) {
      console.error(`❌ Failed to update "${u.name}": ${updateError.message}`);
    } else {
      console.log(`✅ Updated: ${u.name}`);
      updated++;
    }
  }

  const failed = updates.length - updated;

  console.log(`\n╔══════════════════════════════════════════════════════╗`);
  console.log(`║  BACKFILL COMPLETE                                   ║`);
  console.log(`╠══════════════════════════════════════════════════════╣`);
  console.log(`║  Updated:           ${String(updated).padEnd(32)}║`);
  console.log(`║  Failed:            ${String(failed).padEnd(32)}║`);
  console.log(`║  Uncertain (empty): ${String(uncertain).padEnd(32)}║`);
  console.log(`╚══════════════════════════════════════════════════════╝\n`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
