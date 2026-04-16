/**
 * testDiscovery.ts — v2
 * ─────────────────────────────────────────────────────────────
 * Walidacja: taxonomy + adapter + filter + scoring + ranking + fallback
 *
 * Uruchom: npx tsx testDiscovery.ts
 * ─────────────────────────────────────────────────────────────
 */

import { matchQueryToTaxonomy, filterRestaurantsByDiscovery, rankRestaurantsByDiscovery, scoreRestaurant, runDiscovery, explainFilter } from './discoveryFilter.js';
import { mapRestaurantToFeatures, LegacyRestaurant } from './restaurantFeatureAdapter.js';

// ─── Terminal colors ──────────────────────────────────────────
const G = '\x1b[32m';
const R = '\x1b[31m';
const Y = '\x1b[33m';
const B = '\x1b[36m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string, detail = ''): void {
  if (condition) {
    console.log(`${G}  ✓${RESET} ${name}`);
    passed++;
  } else {
    console.log(`${R}  ✗${RESET} ${name}${detail ? `\n    ${DIM}→ ${detail}${RESET}` : ''}`);
    failed++;
  }
}

function section(title: string): void {
  console.log(`\n${B}══ ${title} ══${RESET}`);
}

function assertGt(a: number, b: number, name: string): void {
  assert(a > b, name, `expected ${a} > ${b}`);
}

// ─── Mock data ────────────────────────────────────────────────
// 8 restauracji — mix kuchni, tagów, delivery flags

const RESTAURANTS: LegacyRestaurant[] = [
  {
    id: 'r1',
    name: 'Burger House Bytom',
    city: 'Bytom',
    cuisine_type: 'Burgery, Fast Food',
    description: 'Najlepsze smash burgery w Bytomiu, frytki, napoje. Szybka obsługa.',
    tags: ['fast food', 'burger', 'frytki'],
    supportsDelivery: true,
    price_level: 1,
  },
  {
    id: 'r2',
    name: 'Kebab u Mustafy',
    city: 'Piekary Śląskie',
    description: 'Kebab, döner, gyros. Ostre sosy. Czynne otwarte teraz.',
    cuisine_type: 'Kebab, Fast Food',
    tags: ['kebab', 'ostre', 'szybko'],
    supportsDelivery: false,
    price_level: 1,
  },
  {
    id: 'r3',
    name: 'Zielony Talerz',
    city: 'Bytom',
    cuisine_type: 'Kuchnia wegetariańska',
    description: 'Lunche wege, pierogi z kapustą, zupy roślinne. Bez mięsa.',
    tags: ['wege', 'wegetariańskie'],
    supportsDelivery: true,
    price_level: 2,
  },
  {
    id: 'r4',
    name: 'Sushi Sakura',
    city: 'Bytom',
    cuisine_type: 'Sushi, Kuchnia japońska',
    description: 'Maki, nigiri, uramaki, sashimi. Spicy roll z łososiem i chilli. Dostawa gratis.',
    tags: ['sushi', 'japońskie', 'premium'],
    supportsDelivery: true,
    price_level: 3,
    menu: { bestseller: 'Spicy Salmon Roll', dostawa: 'wolt, glovo' },
  },
  {
    id: 'r5',
    name: 'Pizzeria da Mario',
    city: 'Piekary Śląskie',
    cuisine_type: 'Pizza, Kuchnia włoska',
    description: 'Neapolitańska pizza, pasta carbonara, tiramisu. Stolik przy oknie.',
    tags: ['pizza', 'włoska', 'pasta'],
    supportsDelivery: false,
    price_level: 2,
  },
  {
    id: 'r6',
    name: 'Grillhouse Panzer',
    city: 'Bytom',
    cuisine_type: 'Grill, Steki, BBQ',
    description: 'Steki wołowe, żeberka BBQ, ribeye, pulled pork. Grill na żywo.',
    tags: ['grill', 'bbq', 'steki'],
    supportsDelivery: false,
    price_level: 3,
  },
  {
    id: 'r7',
    name: 'Kawiarnia Artystyczna',
    city: 'Bytom',
    cuisine_type: 'Kawiarnia, Desery',
    description: 'Kawa espresso, cappuccino, latte. Ciasto, tort, muffiny.',
    tags: ['kawa', 'ciasto', 'deser'],
    supportsDelivery: false,
    price_level: 2,
  },
  {
    id: 'r8',
    name: 'Pho Hanoi',
    city: 'Bytom',
    cuisine_type: 'Kuchnia wietnamska',
    description: 'Autentyczne pho, bun bo, banh mi. Pikantne sosy. Wege wersje dostępne.',
    tags: ['wietnamskie', 'pho', 'pikantne', 'wege'],
    supportsDelivery: true,
    price_level: 2,
  },
];

// ─── BLOK 1: mapRestaurantToFeatures (regression) ────────────
section('BLOK 1: mapRestaurantToFeatures — regression');

const fBurger  = mapRestaurantToFeatures(RESTAURANTS[0]);
const fKebab   = mapRestaurantToFeatures(RESTAURANTS[1]);
const fVege    = mapRestaurantToFeatures(RESTAURANTS[2]);
const fSushi   = mapRestaurantToFeatures(RESTAURANTS[3]);
const fGrill   = mapRestaurantToFeatures(RESTAURANTS[5]);
const fPho     = mapRestaurantToFeatures(RESTAURANTS[7]);

assert(fBurger.topGroups.includes('fast_food'),    'BurgerHouse → fast_food');
assert(fBurger.tags.includes('quick'),             'BurgerHouse → quick (implicit)');
assert(fBurger.tags.includes('delivery'),          'BurgerHouse → delivery');
assert(fKebab.tags.includes('spicy'),              'Kebab → spicy');
assert(!fKebab.tags.includes('delivery'),          'Kebab → NIE delivery');
assert(fVege.tags.includes('vege'),                'Zielony Talerz → vege');
assert(fSushi.tags.includes('spicy'),              'Sushi Sakura → spicy (chilli)');
assert(fSushi.tags.includes('delivery'),           'Sushi Sakura → delivery');
assert(fGrill.categories.includes('steak'),        'Grillhouse → steak');
assert(fGrill.categories.includes('bbq'),          'Grillhouse → bbq');
assert(fPho.categories.includes('vietnamese'),     'Pho Hanoi → vietnamese');
assert(fPho.tags.includes('vege'),                 'Pho Hanoi → vege');

// ─── BLOK 2: matchQueryToTaxonomy (regression) ───────────────
section('BLOK 2: matchQueryToTaxonomy — regression + confidence');

const q1 = matchQueryToTaxonomy('ostre sushi z dostawą');
assert(q1.topGroups.includes('asian'),        'q1 → topGroup: asian');
assert(q1.categories.includes('sushi'),       'q1 → category: sushi');
assert(q1.tags.includes('spicy'),             'q1 → tag: spicy');
assert(q1.tags.includes('delivery'),          'q1 → tag: delivery');
assert(q1.confidence === 'deterministic',     'q1 → confidence: deterministic');
assert(q1.open_now === false,                 'q1 → open_now: false');

const q2 = matchQueryToTaxonomy('wege burger teraz');
assert(q2.tags.includes('vege'),              'q2 → tag: vege');
assert(q2.open_now === true,                  'q2 → open_now: true');
assert(q2.confidence === 'deterministic',     'q2 → confidence: deterministic');

const q3 = matchQueryToTaxonomy('co macie dzisiaj');
assert(q3.confidence === 'empty',             'q3 → confidence: empty');
assert(q3.topGroups.length === 0,             'q3 → brak topGroups');

// 'pizzeria' musi być wspierana jawnie (query + feature adapter parity)
const q4 = matchQueryToTaxonomy('pizzeria');
assert(q4.confidence !== 'empty',             'q4 → confidence: not empty ("pizzeria" jest w keyword list)');
assert(q4.topGroups.includes('pizza_italian'),'q4 → topGroup: pizza_italian');
assert(q4.categories.includes('pizza'),       'q4 → category: pizza');

// ─── BLOK 3: scoreRestaurant ──────────────────────────────────
section('BLOK 3: scoreRestaurant — scoring breakdown');

const qS = matchQueryToTaxonomy('ostre sushi z dostawą');

const scoreSushi  = scoreRestaurant(qS, RESTAURANTS[3]); // Sushi Sakura
const scoreBurger = scoreRestaurant(qS, RESTAURANTS[0]); // Burger House
const scorePho    = scoreRestaurant(qS, RESTAURANTS[7]); // Pho Hanoi (asian, not sushi)

console.log(`\n  ${DIM}Query: "ostre sushi z dostawą"${RESET}`);
console.log(`  Sushi Sakura : score=${scoreSushi.total}  (group:${scoreSushi.topGroupScore} cat:${scoreSushi.categoryScore} tag:${scoreSushi.tagScore} kw:${scoreSushi.keywordScore})`);
console.log(`  Burger House : score=${scoreBurger.total} (group:${scoreBurger.topGroupScore} cat:${scoreBurger.categoryScore} tag:${scoreBurger.tagScore} kw:${scoreBurger.keywordScore})`);
console.log(`  Pho Hanoi    : score=${scorePho.total}  (group:${scorePho.topGroupScore} cat:${scorePho.categoryScore} tag:${scorePho.tagScore} kw:${scorePho.keywordScore})`);

assert(scoreSushi.topGroupScore > 0,                'Sushi Sakura → topGroupScore > 0');
assert(scoreSushi.categoryScore > 0,               'Sushi Sakura → categoryScore > 0');
assert(scoreSushi.tagScore > 0,                    'Sushi Sakura → tagScore > 0');
assert(scoreSushi.total > scoreBurger.total,       'Sushi Sakura score > Burger House score');
assert(scoreSushi.total > scorePho.total,          'Sushi Sakura score > Pho Hanoi score (Pho nie ma sushi)');
assert(scorePho.topGroupScore > 0,                 'Pho Hanoi → topGroupScore > 0 (both asian)');
assert(scorePho.categoryScore === 0,               'Pho Hanoi → categoryScore = 0 (nie sushi)');
assert(scoreBurger.topGroupScore === 0,            'Burger House → topGroupScore = 0 (nie asian)');

// open_now boost test
const qOpen = matchQueryToTaxonomy('kebab otwarte teraz');
const scoreKebabOpen = scoreRestaurant(qOpen, RESTAURANTS[1]); // Kebab u Mustafy — ma "otwarte teraz" w opisie
console.log(`\n  ${DIM}Query: "kebab otwarte teraz"${RESET}`);
console.log(`  Kebab u Mustafy: score=${scoreKebabOpen.total} (openNowBoost:${scoreKebabOpen.openNowBoost})`);
assert(scoreKebabOpen.openNowBoost > 0,            'Kebab u Mustafy → open_now boost > 0 (ma "otwarte" w opisie)');

// ─── BLOK 4: filterRestaurantsByDiscovery + sort ─────────────
section('BLOK 4: filterRestaurantsByDiscovery — filter + sort by score');

// A: "ostre sushi z dostawą" → Sushi Sakura first
const resA = filterRestaurantsByDiscovery(qS, RESTAURANTS);
assert(resA.length > 0,                            'A: wyniki nie są puste');
assert(resA[0].id === 'r4',                        'A: Sushi Sakura jest pierwsza (highest score)');
assert(!resA.some(r => r.id === 'r1'),             'A: Burger House odpada (nie asian)');
assert(!resA.some(r => r.id === 'r2'),             'A: Kebab odpada (nie asian, nie delivery: AND enforced)');

// B: "wege burger" → 0 wyników (wege AND burgers — Burger House nie jest wege)
const qB = matchQueryToTaxonomy('wege burger');
const resB = filterRestaurantsByDiscovery(qB, RESTAURANTS);
assert(resB.length === 0,                          'B: "wege burger" → 0 wyników (AND: fast_food + vege — nikt nie spełnia)');

// C: "kebab" (partial) → Kebab u Mustafy bez AND enforcement dla spicy
const qC = matchQueryToTaxonomy('kebab');
const resC = filterRestaurantsByDiscovery(qC, RESTAURANTS);
assert(resC.some(r => r.id === 'r2'),              'C: "kebab" → Kebab u Mustafy przechodzi');

// D: empty → wszystkie bez sortowania
const qD = matchQueryToTaxonomy('coś pysznego');
const resD = filterRestaurantsByDiscovery(qD, RESTAURANTS);
assert(resD.length === RESTAURANTS.length,         'D: empty query → wszystkie restauracje bez filtrów');

// E: "wege z dostawą" → Zielony Talerz + Pho Hanoi (oba: vege AND delivery)
const qE = matchQueryToTaxonomy('wege z dostawą');
const resE = filterRestaurantsByDiscovery(qE, RESTAURANTS);
assert(resE.some(r => r.id === 'r3'),              'E: "wege z dostawą" → Zielony Talerz ✓');
assert(resE.some(r => r.id === 'r8'),              'E: "wege z dostawą" → Pho Hanoi ✓');
assert(!resE.some(r => r.id === 'r2'),             'E: "wege z dostawą" → Kebab odpada (nie vege)');
assert(!resE.some(r => r.id === 'r6'),             'E: "wege z dostawą" → Grillhouse odpada (nie vege, nie delivery)');

// ─── BLOK 5: rankRestaurantsByDiscovery ──────────────────────
section('BLOK 5: rankRestaurantsByDiscovery — z score breakdown');

const qR = matchQueryToTaxonomy('ostre sushi z dostawą');
const ranked = rankRestaurantsByDiscovery(qR, RESTAURANTS);

console.log(`\n  ${DIM}Ranking dla "ostre sushi z dostawą":${RESET}`);
ranked.forEach((sr, i) => {
  const bd = sr.scoreBreakdown;
  console.log(`  ${i + 1}. [${sr.score}pts] ${sr.restaurant.name} — group:${bd.topGroupScore} cat:${bd.categoryScore} tag:${bd.tagScore} kw:${bd.keywordScore}`);
});

assert(ranked.length > 0,                          'Ranking: nie jest pusty');
assert(ranked[0].restaurant.id === 'r4',           'Ranking: Sushi Sakura na #1');
// Jeśli jest tylko 1 wynik — porównaj sam ze sobą (brak ranked[1])
const secondScore = ranked.length > 1 ? ranked[1].score : ranked[0].score;
assert(ranked[0].score >= secondScore,             'Ranking: score[0] >= score[1]');

// Weryfikacja malejącej kolejności
const scores = ranked.map(sr => sr.score);
const isSorted = scores.every((s, i) => i === 0 || s <= scores[i - 1]);
assert(isSorted,                                   'Ranking: wyniki posortowane score DESC');

// ─── BLOK 6: runDiscovery — LLM fallback signal ──────────────
section('BLOK 6: runDiscovery — fallback i DiscoveryResult');

// LLM fallback trigger
const qEmpty = matchQueryToTaxonomy('co macie dzisiaj');
const resultEmpty = runDiscovery(qEmpty, RESTAURANTS);
assert(resultEmpty.fallback === 'llm',             'empty query → fallback: "llm"');
assert(resultEmpty.items.length === 0,             'empty query → items: []');
assert(!!resultEmpty.fallbackReason,               'empty query → fallbackReason istnieje');
assert(resultEmpty.totalBeforeFilter === 8,        'empty → totalBeforeFilter: 8');
console.log(`  ${DIM}fallbackReason: "${resultEmpty.fallbackReason}"${RESET}`);

// Normal discovery result
const qNormal = matchQueryToTaxonomy('sushi');
const resultNormal = runDiscovery(qNormal, RESTAURANTS);
assert(resultNormal.fallback === null,             '"sushi" → fallback: null (parser wystarczający)');
assert(resultNormal.items.length > 0,             '"sushi" → items nie puste');
assert(resultNormal.totalAfterFilter <= resultNormal.totalBeforeFilter, 'totalAfterFilter <= totalBeforeFilter');
console.log(`  ${DIM}"sushi": ${resultNormal.totalAfterFilter}/${resultNormal.totalBeforeFilter} restauracji przeszło${RESET}`);

// ─── BLOK 7: AND enforcement — deterministic vs partial ───────
section('BLOK 7: AND enforcement — deterministic vs partial');

// "ostre sushi" (deterministic) → spicy staje się hard requirement
const qDet = matchQueryToTaxonomy('ostre sushi');
assert(qDet.confidence === 'deterministic',        '"ostre sushi" → deterministic');
const resDet = filterRestaurantsByDiscovery(qDet, RESTAURANTS);
// Pho Hanoi jest asian i ma spicy → powinno przejść
// Kawiarnia jest desserts_cafe i nie ma spicy → odpada
assert(!resDet.some(r => r.id === 'r7'),           'AND enforcement: Kawiarnia odpada (nie asian)');
// Pho Hanoi jest asian ale nie ma category sushi — ale category filter to OR
// Sprawdzamy że restauracja bez spicy odpada jeśli mamy structure + tags (deterministic)
assert(resDet.every(r => {
  const f = mapRestaurantToFeatures(r);
  return f.tags.includes('spicy');
}), 'AND enforcement (deterministic): WSZYSTKIE wyniki mają spicy tag');

// "ostre" samo (partial) → spicy NIE jest hard requirement
// Uwaga: samo "ostre" to 1 sygnał = partial, a ALWAYS_STRICT_TAGS nie zawiera 'spicy'
// Więc wyniki nie są filtrowane przez spicy
const qPart = matchQueryToTaxonomy('ostre');  
assert(qPart.confidence === 'partial',             '"ostre" → confidence: partial');
const resPart = filterRestaurantsByDiscovery(qPart, RESTAURANTS);
// Brak topGroup filter → wszystkie przechodzą, ale są sortowane (spicy na górze)
assert(resPart.length === RESTAURANTS.length,      '"ostre" (partial, bez struktury) → brak filtrów = wszystkie');
assert(resPart[0].id === 'r2' || resPart[0].id === 'r4' || resPart[0].id === 'r8',
                                                   '"ostre" → na górze restauracja spicy (score boost)');

// ─── BLOK 8: explainFilter — score widoczny w debug ──────────
section('BLOK 8: explainFilter — score breakdown visible');

const qDebug = matchQueryToTaxonomy('ostre sushi z dostawą');
console.log(`\n  ${Y}Debug "ostre sushi z dostawą" — po każdej restauracji:${RESET}`);
RESTAURANTS.forEach(r => {
  const { passed: p, score, reasons } = explainFilter(qDebug, r);
  const icon = p ? `${G}✓${RESET}` : `${R}✗${RESET}`;
  console.log(`  ${icon} [${score}pts] ${r.name}`);
  reasons.forEach(reason => console.log(`       ${DIM}${reason}${RESET}`));
});

// ─── Wynik ────────────────────────────────────────────────────
section('WYNIK');
const total = passed + failed;
if (failed === 0) {
  console.log(`${G}  Wszystkie ${total} asercji przeszły ✓${RESET}\n`);
  process.exit(0);
} else {
  console.log(`${R}  ${failed}/${total} FAILED ✗${RESET}\n`);
  process.exit(1);
}
