import { beforeEach, describe, expect, it, vi } from 'vitest';

const restaurantsInCity = [
    { id: 'r_callzone', name: 'Pizzeria Callzone', city: 'Piekary Slaskie', cuisine_type: 'Pizzeria', lat: 50.39, lng: 18.95 },
    { id: 'r_monte', name: 'Pizzeria Monte Carlo', city: 'Piekary Slaskie', cuisine_type: 'Wloska', lat: 50.38, lng: 18.98 },
];

const menuRows = [
    { id: 'm1', restaurant_id: 'r_callzone', name: 'Rollo wolowe', base_name: 'Rollo wolowe', available: true },
    { id: 'm2', restaurant_id: 'r_monte', name: 'Pizza Pepperoni', base_name: 'Pizza Pepperoni', available: true },
    {
        id: 'm3',
        restaurant_id: 'r_callzone',
        name: 'Pozycja dnia',
        base_name: 'Pozycja dnia',
        item_family: 'lawasz',
        item_aliases: ['lawasz kebab', 'kebab lawasz'],
        available: true,
    },
];

const supabaseFromMock = vi.fn();

vi.mock('../../_supabase.js', () => ({
    supabase: {
        from: (...args) => supabaseFromMock(...args),
    },
}));

describe('FindRestaurantHandler item-led discovery', () => {
    beforeEach(() => {
        supabaseFromMock.mockReset();

        supabaseFromMock.mockImplementation((table) => {
            if (table === 'restaurants') {
                const limit = vi.fn().mockResolvedValue({ data: restaurantsInCity, error: null });
                const ilike = vi.fn().mockReturnValue({ limit });
                const select = vi.fn().mockReturnValue({ ilike });
                return { select };
            }

            if (table === 'menu_items_v2') {
                const limit = vi.fn().mockResolvedValue({ data: menuRows, error: null });
                const inFn = vi.fn().mockReturnValue({ limit });
                const select = vi.fn().mockReturnValue({ in: inFn });
                return { select };
            }

            throw new Error(`Unexpected table: ${table}`);
        });
    });

    it('prefers restaurants with exact dish matches for item-led city query', async () => {
        const { FindRestaurantHandler } = await import('../domains/food/findHandler.js');

        const repo = {
            searchRestaurants: vi.fn().mockResolvedValue([]),
            searchNearby: vi.fn().mockResolvedValue([]),
        };

        const handler = new FindRestaurantHandler(repo);

        const result = await handler.execute({
            text: 'gdzie zjem rollo w piekarach',
            entities: { location: 'Piekary Slaskie' },
            session: {},
        });

        const names = (result.restaurants || []).map((restaurant) => restaurant.name);
        expect(names[0]).toBe('Pizzeria Callzone');
        expect(names).not.toContain('Pizzeria Monte Carlo');
        expect(repo.searchRestaurants).not.toHaveBeenCalled();
    });

    it('matches item_family/item_aliases when menu name does not contain query token', async () => {
        const { FindRestaurantHandler } = await import('../domains/food/findHandler.js');

        const repo = {
            searchRestaurants: vi.fn().mockResolvedValue([]),
            searchNearby: vi.fn().mockResolvedValue([]),
        };

        const handler = new FindRestaurantHandler(repo);

        const result = await handler.execute({
            text: 'lawasz kebab w piekarach',
            entities: { location: 'Piekary Slaskie', dish: 'lawasz' },
            session: {},
        });

        const names = (result.restaurants || []).map((restaurant) => restaurant.name);
        expect(names[0]).toBe('Pizzeria Callzone');
        expect(repo.searchRestaurants).not.toHaveBeenCalled();
    });

    it('uses cuisine entity as item query when dish entity is missing', async () => {
        const { FindRestaurantHandler } = await import('../domains/food/findHandler.js');

        const repo = {
            searchRestaurants: vi.fn().mockResolvedValue([]),
            searchNearby: vi.fn().mockResolvedValue([]),
        };

        const handler = new FindRestaurantHandler(repo);

        const result = await handler.execute({
            text: 'pokaz restauracje w piekarach',
            entities: { location: 'Piekary Slaskie', cuisine: 'lawasz' },
            session: {},
        });

        const names = (result.restaurants || []).map((restaurant) => restaurant.name);
        expect(names[0]).toBe('Pizzeria Callzone');
        expect(repo.searchRestaurants).not.toHaveBeenCalled();
    });

    it('normalizes cuisine aliases before repository search (Italian -> Wloska)', async () => {
        const { FindRestaurantHandler } = await import('../domains/food/findHandler.js');

        const repo = {
            searchRestaurants: vi.fn().mockResolvedValue([
                { id: 'r_monte', name: 'Pizzeria Monte Carlo', city: 'Piekary Slaskie', cuisine_type: 'Wloska' },
            ]),
            searchNearby: vi.fn().mockResolvedValue([]),
        };

        const handler = new FindRestaurantHandler(repo);

        const result = await handler.execute({
            text: 'pokaz cos w piekarach',
            entities: { location: 'Piekary Slaskie', cuisine: 'Italian' },
            session: {},
        });

        expect(repo.searchRestaurants).toHaveBeenCalledWith(expect.stringMatching(/Piekary/i), 'Wloska');
        expect((result.restaurants || [])[0]?.name).toBe('Pizzeria Monte Carlo');
    });

    it('normalizes cuisine aliases before repository search (Vietnamese -> Azjatycka)', async () => {
        const { FindRestaurantHandler } = await import('../domains/food/findHandler.js');

        const repo = {
            searchRestaurants: vi.fn().mockResolvedValue([
                { id: 'r_viet', name: 'Vien-Thien', city: 'Piekary Slaskie', cuisine_type: 'Azjatycka' },
            ]),
            searchNearby: vi.fn().mockResolvedValue([]),
        };

        const handler = new FindRestaurantHandler(repo);

        await handler.execute({
            text: 'pokaz cos w piekarach',
            entities: { location: 'Piekary Slaskie', cuisine: 'Vietnamese' },
            session: {},
        });

        expect(repo.searchRestaurants).toHaveBeenCalledWith(expect.stringMatching(/Piekary/i), 'Azjatycka');
    });

    it('normalizes cuisine aliases before repository search (Thai -> Azjatycka)', async () => {
        const { FindRestaurantHandler } = await import('../domains/food/findHandler.js');

        const repo = {
            searchRestaurants: vi.fn().mockResolvedValue([
                { id: 'r_viet', name: 'Vien-Thien', city: 'Piekary Slaskie', cuisine_type: 'Azjatycka' },
            ]),
            searchNearby: vi.fn().mockResolvedValue([]),
        };

        const handler = new FindRestaurantHandler(repo);

        await handler.execute({
            text: 'pokaz cos w piekarach',
            entities: { location: 'Piekary Slaskie', cuisine: 'Thai' },
            session: {},
        });

        expect(repo.searchRestaurants).toHaveBeenCalledWith(expect.stringMatching(/Piekary/i), 'Azjatycka');
    });

    it('broadens Azjatycka search to concrete cuisine_type variants (Wietnamska/Tajska/Chinska)', async () => {
        const { FindRestaurantHandler } = await import('../domains/food/findHandler.js');

        const repo = {
            searchRestaurants: vi.fn().mockImplementation(async (_city, cuisine) => {
                if (cuisine === 'Wietnamska') {
                    return [{ id: 'r_vien', name: 'Vien-Thien', city: 'Piekary Slaskie', cuisine_type: 'Wietnamska' }];
                }
                return [];
            }),
            searchNearby: vi.fn().mockResolvedValue([]),
        };

        const handler = new FindRestaurantHandler(repo);

        const result = await handler.execute({
            text: 'szukam wietnamskiego w piekarach',
            entities: { location: 'Piekary Slaskie', cuisine: 'vietnamese' },
            session: {},
        });

        expect((result.restaurants || []).map((r) => r.name)).toContain('Vien-Thien');
        expect(repo.searchRestaurants).toHaveBeenCalledWith(expect.stringMatching(/Piekary/i), 'Azjatycka');
        expect(repo.searchRestaurants).toHaveBeenCalledWith(expect.stringMatching(/Piekary/i), 'Wietnamska');
    });

    it('broadens Fast Food search to concrete cuisine_type variants (Amerykanska/Kebab/Burger)', async () => {
        const { FindRestaurantHandler } = await import('../domains/food/findHandler.js');

        const repo = {
            searchRestaurants: vi.fn().mockImplementation(async (_city, cuisine) => {
                if (cuisine === 'Kebab') {
                    return [{ id: 'r_lawasz', name: 'LAWASZ KEBAB', city: 'Piekary Slaskie', cuisine_type: 'Kebab' }];
                }
                return [];
            }),
            searchNearby: vi.fn().mockResolvedValue([]),
        };

        const handler = new FindRestaurantHandler(repo);

        const result = await handler.execute({
            text: 'fast food w piekarach',
            entities: { location: 'Piekary Slaskie', cuisine: 'fast food' },
            session: {},
        });

        expect((result.restaurants || []).map((r) => r.name)).toContain('LAWASZ KEBAB');
        expect(repo.searchRestaurants).toHaveBeenCalledWith(expect.stringMatching(/Piekary/i), 'Fast Food');
        expect(repo.searchRestaurants).toHaveBeenCalledWith(expect.stringMatching(/Piekary/i), 'Kebab');
    });
});
