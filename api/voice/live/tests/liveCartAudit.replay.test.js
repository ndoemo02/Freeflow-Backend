import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ menu: [] }));
vi.mock('../../../brain/menuService.js', async importOriginal => ({
  ...await importOriginal(), getMenuItems: async () => fixture.menu,
  loadMenuPreview: async () => fixture.menu,
}));
import { ToolRouter } from '../ToolRouter.js';

describe('controlled three-item Live replay with real router and handlers', () => {
  it('records two dishes, category question and dessert', async () => {
    const sessionId = 'sess_live_cart_audit';
    const restaurant = { id: 'acced74f-ddac-43a0-9f78-016c397f4b8e', name: 'Silesiana Italiana' };
    fixture.menu = [
      { id: 'e36203d6-808d-4e73-9c09-147825fb87bb', name: 'Arancini z krupniokiem', price_pln: 27, category: 'Na początek' },
      { id: 'bae6c2a6-a0ec-4f67-b6cb-c86656572edf', name: 'Ravioli z dynią', price_pln: 39, category: 'Makarony' },
      { id: 'bf15a927-82bb-4ec3-94fc-285df9bb0b49', name: 'Panna cotta makowa', price_pln: 21, category: 'Desery' },
    ].map(item => ({ ...item, base_name: item.name, restaurant_id: restaurant.id, available: true }));
    let session = { currentRestaurant: restaurant, lastRestaurant: restaurant, last_menu: fixture.menu,
      lastMenu: fixture.menu, menuItems: fixture.menu, cart: { items: [], total: 0 },
      conversationPhase: 'restaurant_selected', orderMode: 'restaurant_selected', demoDatasetId: 'piekary-v1' };
    const router = new ToolRouter({ getSession: () => session,
      updateSession: (_, patch) => { session = { ...session, ...patch }; return session; } });
    const traces = [];
    const log = vi.spyOn(console, 'info').mockImplementation((prefix, data) => {
      if (prefix === '[LIVE_CART_AUDIT]') traces.push(JSON.parse(data));
    });
    vi.stubEnv('LIVE_CART_AUDIT_SESSION_ID', sessionId);
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected external request'); }));
    const steps = [];
    try {
      for (const [index, entry] of [
        ['add_item_to_cart', 'Dodaj Arancini z krupniokiem', { dish: fixture.menu[0].name, quantity: 1 }],
        ['add_item_to_cart', 'Dodaj Ravioli z dynią', { dish: fixture.menu[1].name, quantity: 1 }],
        ['search_menu_items', 'Jakie macie desery?', { query: 'Desery' }],
        ['add_item_to_cart', 'Dodaj Panna cotta makowa', { dish: fixture.menu[2].name, quantity: 1 }],
      ].entries()) {
        const [toolName, transcript, args] = entry;
        const result = await router.executeToolCall({ sessionId, toolName, transcript,
          args: { ...args, restaurant_id: restaurant.id }, requestId: `audit_${index}`, turnId: `turn_${index}` });
        steps.push(structuredClone({ tool: toolName, transcript, args, result, serverCart: session.cart }));
      }
      if (process.env.LIVE_CART_AUDIT_OUTPUT) fs.writeFileSync(process.env.LIVE_CART_AUDIT_OUTPUT, JSON.stringify({ sessionId, restaurant, menu: fixture.menu, steps, traces }, null, 2));
      expect(session.cart.items.map(i => i.id)).toEqual(fixture.menu.map(i => i.id));
      expect(session.cart.total).toBe(87);
    } finally { log.mockRestore(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); }
  });
});
