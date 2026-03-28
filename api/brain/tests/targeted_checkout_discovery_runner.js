import assert from 'node:assert/strict';
import { NLURouter } from '../nlu/router.js';
import { findRestaurantInText } from '../data/restaurantCatalog.js';

async function run() {
    const nlu = new NLURouter();
    const session = {
        currentRestaurant: {
            id: 'fc844513-2869-4f42-b04f-c21e1e4cceb7',
            name: 'Tasty King Kebab',
        },
        last_menu: [
            { id: 'm1', name: 'Nuggets box', base_name: 'Nuggets box' },
            { id: 'm2', name: 'Kebab amerykański', base_name: 'Kebab amerykański' },
        ],
    };

    const checkoutPhrases = [
        'Pokaż koszyk',
        'Chciałbym podejrzeć koszyk',
        'Chciałbym podejrzeć zamówienie',
        'podejrzyj koszyk',
    ];

    for (const phrase of checkoutPhrases) {
        const result = await nlu.detect({
            text: phrase,
            body: { text: phrase },
            session,
        });
        assert.equal(
            result.intent,
            'open_checkout',
            `Expected open_checkout for "${phrase}", got ${result.intent} (${result.source})`
        );
    }

    const discovery = await nlu.detect({
        text: 'gdzie zjem w Piekarach',
        body: { text: 'gdzie zjem w Piekarach' },
        session,
    });
    assert.equal(
        discovery.intent,
        'find_nearby',
        `Expected find_nearby for discovery phrase, got ${discovery.intent} (${discovery.source})`
    );

    const lawaszByName = findRestaurantInText('lawasz kebab');
    assert.equal(lawaszByName?.name, 'LAWASZ KEBAB', 'LAWASZ should resolve in catalog by name');

    const lawaszByAlias = findRestaurantInText('lawasz');
    assert.equal(lawaszByAlias?.name, 'LAWASZ KEBAB', 'LAWASZ should resolve in catalog by alias');

    console.log('[TARGETED_RUNNER] PASS');
}

run().catch((err) => {
    console.error('[TARGETED_RUNNER] FAIL');
    console.error(err?.stack || err);
    process.exit(1);
});

