import { describe, it, expect, vi } from 'vitest';
import { FindRestaurantHandler } from '../domains/food/findHandler.js';

describe('FindRestaurantHandler service city boundary', () => {
    it('blocks explicit non-service city requests and asks for Piekary Slaskie', async () => {
        const repo = {
            searchRestaurants: vi.fn(),
            searchNearby: vi.fn(),
        };

        const handler = new FindRestaurantHandler(repo);

        const result = await handler.execute({
            text: 'pokaz restauracje w Bytomiu',
            entities: { location: 'Bytom' },
            session: {},
            body: {},
        });

        expect(result.reply).toMatch(/tylko w Piekary Śląskie|tylko w Piekarach Śląskich/i);
        expect(result.contextUpdates?.expectedContext).toBe('find_nearby_ask_location');
        expect(repo.searchRestaurants).not.toHaveBeenCalled();
        expect(repo.searchNearby).not.toHaveBeenCalled();
    });

    it('does not fallback to nearby cities when service city has no results', async () => {
        const repo = {
            searchRestaurants: vi.fn().mockResolvedValue([]),
            searchNearby: vi.fn().mockResolvedValue([]),
        };

        const handler = new FindRestaurantHandler(repo);

        const result = await handler.execute({
            text: 'pizza w piekarach',
            entities: { location: 'Piekary Slaskie' },
            session: {},
            body: {},
        });

        expect(repo.searchRestaurants).toHaveBeenCalled();
        for (const [location] of repo.searchRestaurants.mock.calls) {
            expect(String(location)).toMatch(/Piekary/i);
        }
        expect(result.reply).toMatch(/Nie znalazłam żadnych restauracji w Piekary Śląskie/i);
    });

    it('filters out restaurants outside Piekary Slaskie in discovery results', async () => {
        const repo = {
            searchRestaurants: vi.fn().mockResolvedValue([
                { id: 'r1', name: 'Callzone', city: 'Piekary Śląskie', cuisine_type: 'Pizzeria' },
                { id: 'r2', name: 'Example Katowice', city: 'Katowice', cuisine_type: 'Pizzeria' },
            ]),
            searchNearby: vi.fn().mockResolvedValue([]),
        };

        const handler = new FindRestaurantHandler(repo);

        const result = await handler.execute({
            text: 'pokaż restauracje w piekarach',
            entities: { location: 'Piekary Slaskie' },
            session: {},
            body: {},
        });

        const names = (result.restaurants || []).map((r) => r.name);
        expect(names).toContain('Callzone');
        expect(names).not.toContain('Example Katowice');
    });

    it('defaults to Piekary Slaskie when city and GPS are missing (no hard ask for city)', async () => {
        const repo = {
            searchRestaurants: vi.fn().mockResolvedValue([
                { id: 'r1', name: 'Callzone', city: 'Piekary Śląskie', cuisine_type: 'Pizzeria' },
            ]),
            searchNearby: vi.fn().mockResolvedValue([]),
        };

        const handler = new FindRestaurantHandler(repo);

        const result = await handler.execute({
            text: 'szukam restauracji',
            entities: {},
            session: {},
            body: {},
        });

        expect(repo.searchRestaurants).toHaveBeenCalled();
        expect(String(repo.searchRestaurants.mock.calls[0][0])).toMatch(/Piekary/i);
        expect(result.contextUpdates?.expectedContext).toBe('select_restaurant');
        expect(result.reply).toMatch(/Znalazłam .* w Piekary Śląskie/i);
    });
});
