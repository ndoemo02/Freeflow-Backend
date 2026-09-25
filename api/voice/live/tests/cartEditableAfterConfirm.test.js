import { expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({ menu: [] }));

vi.mock('../../../brain/menuService.js', async (original) => ({
    ...await original(),
    getMenuItems: async () => fixture.menu,
    loadMenuPreview: async () => fixture.menu,
}));

import { ToolRouter } from '../ToolRouter.js';

it('voice confirm_order keeps the session editable: add → confirm pending item → add lands in the same cart', async () => {
    const restaurant = { id: 'acced74f-ddac-43a0-9f78-016c397f4b8e', name: 'Silesiana Italiana' };
    fixture.menu = [
        {
            id: 'pizza-bianca-32', name: 'Pizza Bianca z gruszką 32 cm', base_name: 'Pizza Bianca z gruszką',
            size_or_variant: '32 cm', price_pln: 36, category: 'Pizza', type: 'MAIN',
            restaurant_id: restaurant.id, available: true,
        },
        {
            id: 'pizza-margherita-32', name: 'Pizza Margherita 32 cm', base_name: 'Pizza Margherita',
            size_or_variant: '32 cm', price_pln: 29, category: 'Pizza', type: 'MAIN',
            restaurant_id: restaurant.id, available: true,
        },
    ];

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
    const sessionId = 'sess_cart_editable_after_confirm';
    const router = new ToolRouter({
        getSession: () => session,
        updateSession: (_, patch) => (session = { ...session, ...patch }),
    });
    const call = (toolName, args, transcript) => router.executeToolCall({
        sessionId,
        toolName,
        transcript,
        args: { ...args, restaurant_id: restaurant.id, restaurant_name: restaurant.name },
        requestId: `req_${toolName}_${Math.random().toString(36).slice(2, 8)}`,
        turnId: `turn_${toolName}`,
    });

    vi.stubGlobal('fetch', vi.fn(() => {
        throw new Error('External request forbidden');
    }));

    try {
        await call('add_item_to_cart', { dish: 'Pizza Bianca z gruszką', quantity: 1 }, 'pizza bianca z gruszką');
        expect(session.cart.items.map((item) => item.name)).toEqual(['Pizza Bianca z gruszką 32 cm']);

        // A proposed item awaiting confirmation ("czy dodać Margheritę?") is the state in which
        // IVL lets confirm_order through to ConfirmOrderHandler.
        session = {
            ...session,
            expectedContext: 'confirm_order',
            pendingOrder: {
                restaurant_id: restaurant.id,
                restaurant: restaurant.name,
                items: [{ id: 'pizza-margherita-32', name: 'Pizza Margherita 32 cm', price_pln: 29, quantity: 1 }],
            },
        };
        const confirmed = await call('confirm_order', {}, 'tak, to wszystko');
        expect(session.cart.items).toHaveLength(2);
        const serialized = JSON.stringify(confirmed);
        expect(serialized).not.toContain('EVENT_ORDER_COMPLETED');
        expect(serialized).not.toContain('"conversationClosed":true');
        expect(serialized).not.toContain('newSessionId');
        expect(session.status).not.toBe('closed');
        expect(session.currentRestaurant).toEqual(restaurant);

        await call('add_item_to_cart', { dish: 'Pizza Bianca z gruszką', quantity: 1 }, 'a jeszcze jedną biankę');
    } finally {
        vi.unstubAllGlobals();
    }

    expect(session.currentRestaurant).toEqual(restaurant);
    expect(session.cart.items.map((item) => [item.name, item.qty ?? item.quantity])).toEqual([
        ['Pizza Bianca z gruszką 32 cm', 2],
        ['Pizza Margherita 32 cm', 1],
    ]);
});
