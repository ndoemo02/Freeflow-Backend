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

// Dodajemy mock z cechami vibe/dietary do testowania nowych wymiarów
const EXTRA_RESTAURANTS: LegacyRestaurant[] = [
  ...RESTAURANTS,
  {
    id: 'r9',
    name: 'Tawerna Grecka',
    city: 'Bytom',
    cuisine_type: 'Kuchnia grecka',
    description: 'Romantyczna kolacja przy świecach, domowa atmosfera, dania wegańskie i bezglutenowe. Muzyka na żywo, przytulnie.',
    tags: ['grecka', 'romantyczna', 'wege'],
    supportsDelivery: false,
    price_level: 3,
  },
  {
    id: 'r10',
    name: 'Rodzinny Ogródek',
    city: 'Bytom',
    cuisine_type: 'Kuchnia polska, desery',
    description: 'Restauracja rodzinna z placem zabaw i kącikiem dla dzieci. Dania bezglutenowe, opcje wegetariańskie.',
    tags: ['polska', 'rodzinna', 'plac zabaw'],
    supportsDelivery: true,
    price_level: 2,
  },
];

// ─── BLOK 9: Vibe Dimension Detection ─────────────────────────
section('BLOK 9: Vibe Dimension Detection w matchQueryToTaxonomy');

const qV1 = matchQueryToTaxonomy('romantyczna kolacja we dwoje');
assert(qV1.vibes.includes('romantic'),      'qV1 → vibe: romantic (romantyczna + kolacja we dwoje)');
assert(qV1.confidence !== 'empty',          'qV1 → confidence ≠ empty');

const qV2 = matchQueryToTaxonomy('restauracja dla dzieci z placem zabaw');
assert(qV2.vibes.includes('family'),        'qV2 → vibe: family (dla dzieci + plac zabaw)');

const qV3 = matchQueryToTaxonomy('biznesowy lunch');
assert(qV3.vibes.includes('business'),      'qV3 → vibe: business (biznesowy lunch)');

const qV4 = matchQueryToTaxonomy('pub z muzyką na żywo');
assert(qV4.vibes.includes('loud'),          'qV4 → vibe: loud (pub + muzyka na żywo)');

const qV5 = matchQueryToTaxonomy('przytulna kameralna knajpka');
assert(qV5.vibes.includes('cozy'),          'qV5 → vibe: cozy (przytulna + kameralna)');

// Vibe nie zakłóca detekcji kuchni
const qV6 = matchQueryToTaxonomy('romantyczna pizzeria');
assert(qV6.vibes.includes('romantic'),      'qV6 → vibe: romantic');
assert(qV6.topGroups.includes('pizza_italian'), 'qV6 → topGroup: pizza_italian (wciąż działa)');
assert(qV6.categories.includes('pizza'),    'qV6 → category: pizza (wciąż działa)');

// ─── BLOK 10: Dietary Dimension Detection ─────────────────────
section('BLOK 10: Dietary Dimension Detection');

const qD1 = matchQueryToTaxonomy('dania bezglutenowe');
assert(qD1.dietarys.includes('gluten_free'), 'qD1 → dietary: gluten_free');

const qD2 = matchQueryToTaxonomy('restauracja keto');
assert(qD2.dietarys.includes('keto'),       'qD2 → dietary: keto');

const qD3 = matchQueryToTaxonomy('halal friendly');
assert(qD3.dietarys.includes('halal'),      'qD3 → dietary: halal');

const qD4 = matchQueryToTaxonomy('bez laktozy');
assert(qD4.dietarys.includes('lactose_free'), 'qD4 → dietary: lactose_free');

const qD5 = matchQueryToTaxonomy('wege');
assert(qD5.tags.includes('vege'),           'qD5 → tag: vege (backward compat)');
assert(qD5.dietarys.includes('vegetarian'), 'qD5 → dietary: vegetarian (cross-cutting)');

const qD6 = matchQueryToTaxonomy('vegańskie dania');
assert(qD6.dietarys.includes('vegan'),      'qD6 → dietary: vegan');

// Dietary + kuchnia razem
const qD7 = matchQueryToTaxonomy('wege burgery bez glutenu');
assert(qD7.dietarys.includes('vegetarian'), 'qD7 → dietary: vegetarian');
assert(qD7.dietarys.includes('gluten_free'),'qD7 → dietary: gluten_free');
assert(qD7.tags.includes('vege'),           'qD7 → tag: vege');
assert(qD7.confidence === 'deterministic',  'qD7 → confidence: deterministic (≥2 sygnały)');

// ─── BLOK 11: Vibe/Dietary Scoring ────────────────────────────
section('BLOK 11: Vibe/Dietary Scoring');

const qRomantic = matchQueryToTaxonomy('romantyczna kolacja');
const scoreGreekRomantic = scoreRestaurant(qRomantic, EXTRA_RESTAURANTS[8]); // Tawerna Grecka
const scoreFamily = scoreRestaurant(qRomantic, EXTRA_RESTAURANTS[9]); // Rodzinny Ogródek

console.log(`\n  ${DIM}Query: "romantyczna kolacja"${RESET}`);
console.log(`  Tawerna Grecka: score=${scoreGreekRomantic.total} (vibe:${scoreGreekRomantic.vibeScore})`);
console.log(`  Rodzinny Ogródek: score=${scoreFamily.total} (vibe:${scoreFamily.vibeScore})`);

assert(scoreGreekRomantic.vibeScore > 0,    'Tawerna Grecka → vibeScore > 0 (ma "romantyczna" w opisie)');
assert(scoreGreekRomantic.total > scoreFamily.total, 'Tawerna Grecka → wyższy score niż Rodzinny Ogródek dla romantic');

// Dietary filtering — hard AND
const qGlutenFree = matchQueryToTaxonomy('dania bezglutenowe');
const resGF = filterRestaurantsByDiscovery(qGlutenFree, EXTRA_RESTAURANTS);
assert(resGF.some(r => r.id === 'r10'),     'Gluten-free → Rodzinny Ogródek przechodzi (ma "bezglutenowe" w opisie)');
assert(!resGF.some(r => r.id === 'r2'),     'Gluten-free → Kebab u Mustafy ODPADA (brak gluten-free)');

// Dietary + Vibe combined
const qVeganRomantic = matchQueryToTaxonomy('romantyczna kolacja wegańska');
const scoreTawerna = scoreRestaurant(qVeganRomantic, EXTRA_RESTAURANTS[8]);
console.log(`\n  ${DIM}Query: "romantyczna kolacja wegańska"${RESET}`);
console.log(`  Tawerna Grecka: score=${scoreTawerna.total} (vibe:${scoreTawerna.vibeScore} dietary:${scoreTawerna.dietaryScore})`);
// Tawerna ma "wegańskie" w opisie
assert(scoreTawerna.vibeScore > 0,          'Tawerna Grecka → vibeScore > 0 dla romantic');
assert(scoreTawerna.dietaryScore > 0,       'Tawerna Grecka → dietaryScore > 0 dla vegan');

// ─── BLOK 12: Display Map — emoji + etykiety ──────────────────
section('BLOK 12: TAXONOMY_DISPLAY — emoji i etykiety');

// Dynamiczny import z nowego modułu
import { TAXONOMY_DISPLAY } from './queryUnderstanding.js';

// Wszystkie TopGroupID mają wpis
const allTopGroups: string[] = ['fast_food', 'pizza_italian', 'asian', 'polish', 'grill', 'desserts_cafe'];
for (const id of allTopGroups) {
  assert(!!TAXONOMY_DISPLAY[id],           `TAXONOMY_DISPLAY['${id}'] istnieje`);
  assert(TAXONOMY_DISPLAY[id].emoji.length > 0, `TAXONOMY_DISPLAY['${id}'].emoji niepuste`);
  assert(TAXONOMY_DISPLAY[id].labelPl.length > 0, `TAXONOMY_DISPLAY['${id}'].labelPl niepuste`);
}

// Wszystkie VibeID mają wpis
const allVibes: string[] = ['romantic', 'cozy', 'business', 'loud', 'family'];
for (const id of allVibes) {
  assert(!!TAXONOMY_DISPLAY[id],           `TAXONOMY_DISPLAY['${id}'] istnieje`);
  assert(TAXONOMY_DISPLAY[id].emoji.length > 0, `TAXONOMY_DISPLAY['${id}'].emoji niepuste`);
}

// Wszystkie DietaryID mają wpis
const allDietarys: string[] = ['vegan', 'vegetarian', 'gluten_free', 'keto', 'halal', 'lactose_free'];
for (const id of allDietarys) {
  assert(!!TAXONOMY_DISPLAY[id],           `TAXONOMY_DISPLAY['${id}'] istnieje`);
  assert(TAXONOMY_DISPLAY[id].emoji.length > 0, `TAXONOMY_DISPLAY['${id}'].emoji niepuste`);
}

// Konkretne emoji
assert(TAXONOMY_DISPLAY['romantic'].emoji === '🕯️', 'romantic → 🕯️');
assert(TAXONOMY_DISPLAY['spicy'].emoji === '🌶️',    'spicy → 🌶️');
assert(TAXONOMY_DISPLAY['vegan'].emoji === '🌱',     'vegan → 🌱');
assert(TAXONOMY_DISPLAY['gluten_free'].emoji === '🌾', 'gluten_free → 🌾');
assert(TAXONOMY_DISPLAY['pizza'].emoji === '🍕',     'pizza → 🍕');
assert(TAXONOMY_DISPLAY['family'].emoji === '👨‍👩‍👧‍👦', 'family → 👨‍👩‍👧‍👦');

// ─── BLOK 13: Backward Compatibility Regression ───────────────
section('BLOK 13: Regression — wszystkie asercje z BLOK 1-8');

// BLOK 1: mapRestaurantToFeatures
const fBurger3  = mapRestaurantToFeatures(RESTAURANTS[0]);
const fKebab3   = mapRestaurantToFeatures(RESTAURANTS[1]);
const fVege3    = mapRestaurantToFeatures(RESTAURANTS[2]);
const fSushi3   = mapRestaurantToFeatures(RESTAURANTS[3]);
const fGrill3   = mapRestaurantToFeatures(RESTAURANTS[5]);
const fPho3     = mapRestaurantToFeatures(RESTAURANTS[7]);

assert(fBurger3.topGroups.includes('fast_food'),  'REGR: BurgerHouse → fast_food');
assert(fBurger3.tags.includes('quick'),           'REGR: BurgerHouse → quick');
assert(fBurger3.tags.includes('delivery'),        'REGR: BurgerHouse → delivery');
assert(fKebab3.tags.includes('spicy'),            'REGR: Kebab → spicy');
assert(!fKebab3.tags.includes('delivery'),        'REGR: Kebab → NIE delivery');
assert(fVege3.tags.includes('vege'),              'REGR: Zielony Talerz → vege');
assert(fSushi3.tags.includes('spicy'),            'REGR: Sushi Sakura → spicy');
assert(fSushi3.tags.includes('delivery'),         'REGR: Sushi Sakura → delivery');
assert(fGrill3.categories.includes('steak'),      'REGR: Grillhouse → steak');
assert(fGrill3.categories.includes('bbq'),        'REGR: Grillhouse → bbq');
assert(fPho3.categories.includes('vietnamese'),   'REGR: Pho Hanoi → vietnamese');
assert(fPho3.tags.includes('vege'),               'REGR: Pho Hanoi → vege');

// BLOK 2: matchQueryToTaxonomy regression
const q1r = matchQueryToTaxonomy('ostre sushi z dostawą');
assert(q1r.confidence === 'deterministic',   'REGR: q1 → deterministic');
assert(q1r.topGroups.includes('asian'),       'REGR: q1 → asian');

const q3r = matchQueryToTaxonomy('co macie dzisiaj');
assert(q3r.confidence === 'empty',           'REGR: q3 → empty');

const q4r = matchQueryToTaxonomy('pizzeria');
assert(q4r.confidence !== 'empty',           'REGR: q4 → not empty');
assert(q4r.topGroups.includes('pizza_italian'), 'REGR: q4 → pizza_italian');

// BLOK 3: scoreRestaurant regression
const qSr = matchQueryToTaxonomy('ostre sushi z dostawą');
const scoreSushiR = scoreRestaurant(qSr, RESTAURANTS[3]);
const scoreBurgerR = scoreRestaurant(qSr, RESTAURANTS[0]);
assert(scoreSushiR.total > scoreBurgerR.total, 'REGR: Sushi > Burger');

// BLOK 4: filter regression
const resAr = filterRestaurantsByDiscovery(qSr, RESTAURANTS);
assert(resAr.length > 0,                     'REGR: filter niepusty');
assert(resAr[0].id === 'r4',                 'REGR: Sushi Sakura #1');

const qDr = matchQueryToTaxonomy('coś pysznego');
const resDr = filterRestaurantsByDiscovery(qDr, RESTAURANTS);
assert(resDr.length === RESTAURANTS.length,   'REGR: empty query → wszystkie');

// BLOK 6: runDiscovery fallback regression
const qEmptyR = matchQueryToTaxonomy('co macie dzisiaj');
const resultEmptyR = runDiscovery(qEmptyR, RESTAURANTS);
assert(resultEmptyR.fallback === 'llm',      'REGR: empty → fallback llm');

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
