import { beforeEach, describe, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({ tables: {}, calls: [], error: null }));
vi.mock('../../_supabase.js', () => ({ supabase: { from(table) {
    db.calls.push(table); const filters = [];
    const q = {
        select: () => q, order: () => q, limit: () => q, gte: () => q, lte: () => q,
        eq(key, value) { filters.push(row => row[key] === value); return q; },
        in(key, values) { filters.push(row => values.includes(row[key])); return q; },
        ilike(key, value) { filters.push(row => String(row[key] || '').toLowerCase().includes(value.replaceAll('%', '').toLowerCase())); return q; },
        maybeSingle() { return q.then(result => ({ ...result, data: result.data?.[0] || null })); },
        then(resolve, reject) { return Promise.resolve({ data: (db.tables[table] || []).filter(row => filters.every(test => test(row))), error: db.error }).then(resolve, reject); },
    }; return q;
} } }));
import { requireDemoSessionVenues, requireDemoVenues } from '../../demo/demoVenueAccess.js';
import { getMenuItems, invalidateMenuCache } from '../menuService.js';
import { SupabaseRestaurantRepository } from '../core/repository.js';
import { findRestaurantsByLocation } from '../locationService.js';
import { MenuHandler } from '../domains/food/menuHandler.js';
beforeEach(() => {
    db.calls = []; db.error = null; invalidateMenuCache('demo');
    const common = { is_active: true, city: 'Test City', lat: 50, lng: 19, cuisine_type: 'Polska' };
    db.tables = {
        restaurants: [
            { ...common, id: 'demo', name: 'Demo', publication_status: 'demo_fictional' },
            { ...common, id: 'private', name: 'Private', publication_status: 'private' },
            { ...common, id: 'live', name: 'Live', publication_status: 'consented_live' },
            { ...common, id: 'inactive', name: 'Inactive', publication_status: 'demo_fictional', is_active: false },
        ],
        menu_items_v2: [{ id: 'dish', restaurant_id: 'demo', name: 'Dish', available: true }],
    };
});
describe('current publication is required even for remembered data', () => {
    it.each(['private', 'live', 'inactive', 'missing'])('rejects %s and permits active fictional demo', async id => {
        await requireDemoVenues(['demo']);
        await expect(requireDemoVenues([id])).rejects.toMatchObject({ code: 'venue_not_available' });
    });
    it('does not serve cached menu after publication is revoked', async () => {
        expect(await getMenuItems('demo')).toHaveLength(1);
        db.tables.restaurants[0].publication_status = 'private'; db.calls = [];
        expect(await getMenuItems('demo')).toEqual([]);
        expect(db.calls).not.toContain('menu_items_v2');
    });
    it.each([
        { currentRestaurant: { id: 'private' } },
        { lastRestaurantsList: [{ id: 'private' }] },
        { cart: { items: [{ restaurant_id: 'private' }] } },
        { last_menu_restaurant_id: 'private' },
        { lockedRestaurantId: 'private' },
    ])('rejects hidden venue references in session %j', async state => {
        await expect(requireDemoSessionVenues(state)).rejects.toMatchObject({ statusCode: 403 });
    });
    it('checks MenuHandler before the session menu cache shortcut', async () => {
        await expect(new MenuHandler().execute({ sessionId: 'sess_catalog', text: 'menu', entities: {}, session: {
            currentRestaurant: { id: 'private', name: 'Private' }, last_menu_restaurant_id: 'private', last_menu: [{ name: 'Hidden dish' }],
        } })).rejects.toMatchObject({ code: 'venue_not_available' });
        expect(db.calls).not.toContain('menu_items_v2');
    });
    it('filters every repository lookup and checks parent access for a direct menu ID', async () => {
        const repo = new SupabaseRestaurantRepository();
        expect((await repo.searchRestaurants('Test')).map(row => row.id)).toEqual(['demo']);
        expect((await repo.searchNearby(50, 19)).map(row => row.id)).toEqual(['demo']);
        expect(await repo.getRestaurantById('private')).toBeNull();
        expect(await repo.getRestaurantByName('Private')).toBeNull();
        await expect(repo.getMenu('private')).rejects.toMatchObject({ statusCode: 403 });
    });
    it('replaces a stale location cache with currently published rows', async () => {
        const session = { locationCache: { test_all: { data: [{ id: 'private' }], timestamp: Date.now() } } };
        expect((await findRestaurantsByLocation('Test', null, session)).map(row => row.id)).toEqual(['demo']);
    });
    it('fails closed when publication cannot be checked', async () => {
        db.error = { message: 'database unavailable' };
        await expect(requireDemoVenues(['demo'])).rejects.toMatchObject({ code: 'catalog_unavailable', statusCode: 503 });
    });
});
