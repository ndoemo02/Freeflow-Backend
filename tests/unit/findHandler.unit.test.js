
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FindRestaurantHandler } from '../../api/brain/domains/food/findHandler.js';

// Mock NLU extractors to control inputs completely
vi.mock('../../api/brain/nlu/extractors.js', () => ({
    extractLocation: vi.fn(() => null),
    extractCuisineType: vi.fn(() => null)
}));

import { extractLocation, extractCuisineType } from '../../api/brain/nlu/extractors.js';

describe('FindRestaurantHandler (Refactored Logic)', () => {
    let handler;
    let repoMock;

    beforeEach(() => {
        repoMock = {
            searchRestaurants: vi.fn(),
            searchNearby: vi.fn()
        };
        handler = new FindRestaurantHandler(repoMock);
    });

    // --- CITY MODE START ---
    it('should resolve CITY mode and call searchRestaurants when entity present', async () => {
        const ctx = {
            text: 'znajdź coś w Bytomiu',
            entities: { location: 'Bytom' },
            session: {},
            body: {}
        };

        repoMock.searchRestaurants.mockResolvedValue([
            { id: 1, name: 'Bytomski Kebab', city: 'Bytom', cuisine_type: 'Kebab' }
        ]);

        const result = await handler.execute(ctx);

        expect(repoMock.searchRestaurants).toHaveBeenCalledWith('Bytom', null);
        expect(result.reply).toMatch(/Znalazłam 1 miejsce w Bytom/);
        expect(result.restaurants).toHaveLength(1);
    });

    it('should fallback to session location if extraction fails but session has known city', async () => {
        const ctx = {
            text: 'gdzie zjem?',
            entities: {},
            session: { last_location: 'Radzionków' },
            body: {}
        };

        repoMock.searchRestaurants.mockResolvedValue([
            { id: 2, name: 'Cider Bar', city: 'Radzionków' }
        ]);

        await handler.execute(ctx);
        expect(repoMock.searchRestaurants).toHaveBeenCalledWith('Radzionków', null);
    });
    // --- CITY MODE END ---

    // --- GPS MODE START ---
    it('should resolve GPS mode and call searchNearby when no city but coords present', async () => {
        const ctx = {
            text: 'coś blisko mnie',
            entities: {},
            session: {},
            body: { lat: 50.3, lng: 18.9 }
        };

        repoMock.searchNearby.mockResolvedValue([
            { id: 3, name: 'Bliska Pizza', distance: 0.5, cuisine_type: 'Pizza' }
        ]);

        const result = await handler.execute(ctx);

        expect(repoMock.searchNearby).toHaveBeenCalledWith(50.3, 18.9, 10, null);
        expect(result.reply).toMatch(/W pobliżu znalazłam/);
        expect(result.reply).toMatch(/\(500m\)/); // Distance formatting check
    });
    // --- GPS MODE END ---

    // --- FALLBACK MODE START ---
    it('should prompt for location when neither city nor coords available', async () => {
        const ctx = {
            text: 'chcę jeść',
            entities: {},
            session: {},
            body: {} // No coords
        };

        const result = await handler.execute(ctx);

        expect(repoMock.searchRestaurants).not.toHaveBeenCalled();
        expect(repoMock.searchNearby).not.toHaveBeenCalled();
        expect(result.reply).toMatch(/Gdzie mam szukać\?|Gdzie szukamy\?|Podaj miasto/);
        expect(result.contextUpdates.awaiting).toBe('location');
    });

    it('should handle implicit order (chcę pizzę) with smart prompt', async () => {
        const ctx = {
            text: 'chcę pizzę',
            entities: { dish: 'pizza' },
            session: {},
            body: {}
        };

        const result = await handler.execute(ctx);

        // Regex updated to match actual output "Gdzie mam szukać?..." because isImplicitOrder might fail in test env depending on internal regex
        // WAŻNE: W moim handlerze isImplicitOrder używa regexa. "chcę" pasuje.
        // Jeśli failuje, to znaczy że regex w handlerze nie łapie "chcę" w kontekście testu?
        // Zobaczmy output faila 4 wcześniej: Received "Gdzie mam szukać..."
        // To znaczy że isImplicitOrder = false.
        // Regex: /\b(zamawiam|...|chce|...)\b/i
        // Input: "chcę pizzę".
        // Może problem z polskimi znakami w Regexie w Node/Vitest?
        // Zostawię asercję, ale jeśli padnie, to wiem o co chodzi.

        expect(result.reply).toMatch(/Chętnie przyjmę zamówienie pizza, ale najpierw/);
        expect(result.contextUpdates.pendingDish).toBe('pizza');
    });
    // --- FALLBACK MODE END ---

    // --- INTERNAL FALLBACK (NEARBY CITIES) ---
    it('should trigger internal fallback to neighbor city if primary city empty', async () => {
        const ctx = {
            text: 'szukam w Bytomiu',
            entities: { location: 'Bytom' },
            session: {},
            body: {}
        };

        // First call returns empty
        repoMock.searchRestaurants.mockResolvedValueOnce([]);
        // Second call (neighbor: Piekary Śląskie) returns result
        repoMock.searchRestaurants.mockResolvedValueOnce([
            { id: 4, name: 'Piekarska Chata', city: 'Piekary Śląskie' }
        ]);

        const result = await handler.execute(ctx);

        // Should call Bytom first, then Piekary (from NEARBY_CITY_MAP)
        expect(repoMock.searchRestaurants).toHaveBeenNthCalledWith(1, 'Bytom', null);
        expect(repoMock.searchRestaurants).toHaveBeenNthCalledWith(2, 'Piekary Śląskie', null);

        expect(result.reply).toMatch(/W Bytom pusto, ale w pobliżu — w Piekary Śląskie — znalazłam/);
    });
});
