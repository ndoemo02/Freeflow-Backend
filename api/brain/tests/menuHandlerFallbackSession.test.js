import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../menuService.js', () => ({
    loadMenuPreview: vi.fn(async () => ({ menu: [], shortlist: [], fallbackUsed: false })),
}));

vi.mock('../locationService.js', () => ({
    findRestaurantByName: vi.fn(async () => null),
    getLocationFallback: vi.fn(async () => null),
}));

vi.mock('../data/restaurantCatalog.js', () => ({
    RESTAURANT_CATALOG: [],
}));

import { MenuHandler } from '../domains/food/menuHandler.js';
import { getLocationFallback } from '../locationService.js';

/**
 * Sesja 18h. `getLocationFallback` wyliczalo zasieg katalogu demo z sesji pobranej
 * przez `getSession()` z `brain/context.js` — a to JEST INNY MAGAZYN niz ten,
 * do ktorego pisze pipeline (`brain/session/sessionStore.js`). Kazdy modul trzyma
 * wlasna `new Map()`, a `context.js` nie jest w runtime zapisywany przez nikogo,
 * wiec odczyt zwracal `null` i filtr katalogu nigdy sie nie wlaczal.
 *
 * Dlatego sesje podaje WOLAJACY, ktory ma ja z `ctx` — tak samo jak `findHandler`.
 * Ten test pilnuje wlasnie tego przekazania: bez niego naprawa wycieku z 18g §K
 * jest cicho bezskuteczna, a testy jednostkowe samego filtra nadal swieca na zielono.
 */
describe('MenuHandler → getLocationFallback: przekazanie sesji', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const buildCtx = (session) => ({
        text: 'pokaz wszystkie miejsca demo',
        sessionId: 'sess_18h_fallback_scope',
        entities: {},
        session,
    });

    it('podaje obiekt sesji do getLocationFallback, a nie tylko sessionId', async () => {
        const session = {
            last_location: 'Piekary Śląskie',
            demoScenarioId: 'piekary-local',
            demoDatasetId: 'piekary-v1',
            demoContext: { scenarioId: 'piekary-local', datasetId: 'piekary-v1' },
        };

        await new MenuHandler().execute(buildCtx(session));

        expect(getLocationFallback).toHaveBeenCalledTimes(1);
        const args = getLocationFallback.mock.calls[0];

        expect(args[0]).toBe('sess_18h_fallback_scope');
        expect(args[1]).toBe('Piekary Śląskie');
        expect(typeof args[2]).toBe('string');
        // Bez tego argumentu filtr katalogu demo nie ma z czego wyliczyc zasiegu.
        expect(args[3]).toBe(session);
    });

    it('przekazuje sesje takze wtedy, gdy nie ma w niej kontekstu demo', async () => {
        const session = { last_location: 'Piekary Śląskie' };

        await new MenuHandler().execute(buildCtx(session));

        expect(getLocationFallback.mock.calls[0][3]).toBe(session);
    });
});
