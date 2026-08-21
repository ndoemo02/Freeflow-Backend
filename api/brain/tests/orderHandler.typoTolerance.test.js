import { describe, it, expect, vi, beforeEach } from 'vitest';

const { resolveMenuItemConflictMock } = vi.hoisted(() => ({
    resolveMenuItemConflictMock: vi.fn(async () => ({ status: 'ITEM_NOT_FOUND' })),
}));

vi.mock('../services/DisambiguationService.js', () => ({
    DISAMBIGUATION_RESULT: {
        ITEM_NOT_FOUND: 'ITEM_NOT_FOUND',
        ADD_ITEM: 'ADD_ITEM',
        DISAMBIGUATION_REQUIRED: 'DISAMBIGUATION_REQUIRED',
    },
    resolveMenuItemConflict: resolveMenuItemConflictMock,
}));

import { OrderHandler } from '../domains/food/orderHandler.js';

/**
 * Tolerancja literowa w SCIEZCE TEKSTOWEJ (bez sesji live).
 *
 * `hasDishSignalCompatibility` (orderHandler) porownuje tokeny przez `Set.has()`,
 * czyli znakowo — to TRZECIA warstwa dopasowania z tym samym problemem, obok
 * `menuGrounding.scoreGroundedMenuItem` i `helpers.findBestDishMatch`.
 *
 * Skutek byl mylacy: `findBestDishMatch` znajdowal juz „Pizza Margherita" dla
 * zapytania „margarita", po czym ta bramka odrzucala trafienie i uzytkownik
 * dostawal „Nie jestem pewna co chcesz zamowic".
 *
 * Sciezka tekstowa jest istotna, bo gdy sesja live NIE jest aktywna, tekst
 * z docka idzie przez `/api/brain/v2`, a nie przez ToolRouter (`Home.tsx:239`).
 * Tam nie ma modelu, ktory przeformulowalby zapytanie.
 */

const MENU_PIZZERIA = [
    {
        id: 'margherita-32',
        name: 'Pizza Margherita 32 cm',
        base_name: 'Pizza Margherita',
        size_or_variant: '32 cm',
        category: 'Pizza',
        type: 'MAIN',
        price_pln: 29,
    },
    {
        id: 'silesiana-32',
        name: 'Pizza Silesiana 32 cm',
        base_name: 'Pizza Silesiana',
        size_or_variant: '32 cm',
        category: 'Pizza',
        type: 'MAIN',
        price_pln: 35,
    },
    {
        id: 'kawa',
        name: 'Kawa czarna',
        base_name: 'Kawa czarna',
        category: 'Napoje',
        type: 'DRINK',
        price_pln: 10,
    },
];

function makeSession(overrides = {}) {
    return {
        currentRestaurant: { id: 'R1', name: 'Silesiana Italiana' },
        lastRestaurant: { id: 'R1', name: 'Silesiana Italiana' },
        last_menu: MENU_PIZZERIA,
        cart: { items: [], total: 0 },
        ...overrides,
    };
}

describe('OrderHandler — tolerancja literowa w nazwie dania', () => {
    let handler;

    beforeEach(() => {
        handler = new OrderHandler();
        resolveMenuItemConflictMock.mockClear();
    });

    it('rozpoznaje „margarita" jako Pizza Margherita', async () => {
        const session = makeSession();
        const ctx = {
            text: 'poprosze margarita',
            session,
            entities: { dish: 'margarita', quantity: 1 },
            body: { text: 'poprosze margarita' },
        };

        const result = await handler.execute(ctx);
        const serialized = JSON.stringify(result);

        expect(serialized).toContain('Margherita');
    });

    it('nadal rozpoznaje poprawna pisownie', async () => {
        const session = makeSession();
        const ctx = {
            text: 'poprosze margherita',
            session,
            entities: { dish: 'margherita', quantity: 1 },
            body: { text: 'poprosze margherita' },
        };

        const result = await handler.execute(ctx);

        expect(JSON.stringify(result)).toContain('Margherita');
    });

    it('nie podstawia dania o krotkiej, podobnej nazwie', async () => {
        // „lawa" wobec „Kawa czarna" — jedna litera, ale cztery znaki.
        // Budzet bledu na tej dlugosci wynosi 0, wiec trafienia byc nie moze.
        const session = makeSession();
        const ctx = {
            text: 'poprosze lawa',
            session,
            entities: { dish: 'lawa', quantity: 1 },
            body: { text: 'poprosze lawa' },
        };

        const result = await handler.execute(ctx);

        expect(JSON.stringify(result)).not.toContain('Kawa czarna');
    });
});
