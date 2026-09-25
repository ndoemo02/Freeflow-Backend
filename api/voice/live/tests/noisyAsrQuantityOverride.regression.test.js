import { expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({ menu: [] }));

vi.mock('../../../brain/menuService.js', async (original) => ({
    ...await original(),
    getMenuItems: async () => fixture.menu,
    loadMenuPreview: async () => fixture.menu,
}));

import { ToolRouter } from '../ToolRouter.js';
import { validateAndSanitize } from '../ToolValidator.js';

const NOISY_TRANSCRIPT = '2000, pesci, la pizza bianca, la 26 60 cm, buongustaio.';
const restaurant = {
    id: 'acced74f-ddac-43a0-9f78-016c397f4b8e',
    name: 'Silesiana Italiana',
};

async function runToolCall(toolName, args, transcript = NOISY_TRANSCRIPT) {
    fixture.menu = [{
        id: 'pizza-bianca-32',
        name: 'Pizza Bianca z gruszką 32 cm',
        base_name: 'Pizza Bianca z gruszką',
        size_or_variant: '32 cm',
        price_pln: 36,
        category: 'Pizza',
        type: 'MAIN',
        restaurant_id: restaurant.id,
        available: true,
    }];

    let session = {
        currentRestaurant: restaurant,
        lastRestaurant: restaurant,
        last_menu: fixture.menu,
        lastMenu: fixture.menu,
        menuItems: fixture.menu,
        cart: { items: [], total: 0 },
        conversationPhase: 'restaurant_selected',
        orderMode: 'restaurant_selected',
    };
    const router = new ToolRouter({
        getSession: () => session,
        updateSession: (_, patch) => (session = { ...session, ...patch }),
    });

    vi.stubGlobal('fetch', vi.fn(() => {
        throw new Error('External request forbidden');
    }));

    try {
        await router.executeToolCall({
            sessionId: `sess_noisy_asr_${toolName}`,
            toolName,
            transcript,
            args: { ...args, restaurant_id: restaurant.id, restaurant_name: restaurant.name },
            requestId: `noisy_asr_${toolName}`,
            turnId: `noisy_asr_${toolName}`,
        });
        return session;
    } finally {
        vi.unstubAllGlobals();
    }
}

function expectSinglePizza(session) {
    expect(session.cart.items).toHaveLength(1);
    expect(session.cart.items[0]).toMatchObject({
        name: 'Pizza Bianca z gruszką 32 cm',
        size_or_variant: '32 cm',
        qty: 1,
    });
    expect(session.cart.total).toBe(36);
}

it('noisy-asr-quantity-override: add_item_to_cart quantity=1 remains authoritative', async () => {
    const session = await runToolCall('add_item_to_cart', {
        dish: 'Pizza Bianca z gruszką',
        quantity: 1,
    });
    expectSinglePizza(session);
});

it('noisy-asr-quantity-override: single-item add_items_to_cart quantity=1 remains authoritative', async () => {
    const session = await runToolCall('add_items_to_cart', {
        items: [{ dish: 'Pizza Bianca z gruszką', quantity: 1 }],
    });
    expectSinglePizza(session);
});

const SPOKEN_TWO = 'poproszę dwie pizze bianca z gruszką';

function expectPizzaQty(session, qty) {
    expect(session.cart.items).toHaveLength(1);
    expect(session.cart.items[0]).toMatchObject({ name: 'Pizza Bianca z gruszką 32 cm', qty });
}

it('omitted tool quantity still takes the spoken quantity (add_item_to_cart)', async () => {
    const session = await runToolCall('add_item_to_cart', { dish: 'Pizza Bianca z gruszką' }, SPOKEN_TWO);
    expectPizzaQty(session, 2);
});

it('omitted tool quantity still takes the spoken quantity (single-item add_items_to_cart)', async () => {
    const session = await runToolCall('add_items_to_cart', { items: [{ dish: 'Pizza Bianca z gruszką' }] }, SPOKEN_TWO);
    expectPizzaQty(session, 2);
});

it('validator-sanitized args with omitted item quantity keep the spoken quantity', async () => {
    const validation = validateAndSanitize('add_items_to_cart', { items: [{ dish: 'Pizza Bianca z gruszką' }] });
    expect(validation.valid).toBe(true);
    expect(validation.sanitized.items[0]).not.toHaveProperty('quantity');
    const session = await runToolCall('add_items_to_cart', validation.sanitized, SPOKEN_TWO);
    expectPizzaQty(session, 2);
});

it('explicit tool quantity=2 is kept', async () => {
    const session = await runToolCall('add_item_to_cart', { dish: 'Pizza Bianca z gruszką', quantity: 2 });
    expectPizzaQty(session, 2);
});

it('invalid tool quantity=0 does not block the spoken quantity', async () => {
    const session = await runToolCall('add_item_to_cart', { dish: 'Pizza Bianca z gruszką', quantity: 0 }, SPOKEN_TWO);
    expectPizzaQty(session, 2);
});
