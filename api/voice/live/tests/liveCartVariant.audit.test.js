import fs from 'node:fs';
import { expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ menu: [] }));
vi.mock('../../../brain/menuService.js', async original => ({ ...await original(), getMenuItems: async () => fixture.menu, loadMenuPreview: async () => fixture.menu }));
import { ToolRouter } from '../ToolRouter.js';

it('audits size requests and quantity control through real handlers (synthetic menu)', async () => {
  const restaurant = { id: 'acced74f-ddac-43a0-9f78-016c397f4b8e', name: 'Silesiana Italiana' };
  fixture.menu = [
    ['bianca-small', 'Bianca', 'mała', 30, 'Pizza'],
    ['bianca-large', 'Bianca', 'duża', 40, 'Pizza'],
    ['ravioli', 'Ravioli z dynią', null, 39, 'Makarony'],
    ['lemon-small', 'Lemoniada', 'mała', 10, 'Napoje'],
    ['lemon-large', 'Lemoniada', 'duża', 15, 'Napoje'],
  ].map(([id, name, size_or_variant, price_pln, category]) => ({ id, name, base_name: name, size_or_variant, price_pln, category, restaurant_id: restaurant.id, available: true }));
  let session = { currentRestaurant: restaurant, lastRestaurant: restaurant, last_menu: fixture.menu, lastMenu: fixture.menu, menuItems: fixture.menu, cart: { items: [], total: 0 }, conversationPhase: 'restaurant_selected', orderMode: 'restaurant_selected' };
  const router = new ToolRouter({ getSession: () => session, updateSession: (_, patch) => (session = { ...session, ...patch }) });
  const steps = [];
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('External request forbidden'); }));
  try {
    for (const [index, [toolName, transcript, args]] of [
      ['add_item_to_cart', 'Dodaj dużą Biancę', { dish: 'Bianca', quantity: 1 }],
      ['add_item_to_cart', 'Dodaj dwa ravioli z dynią', { dish: 'Ravioli z dynią', quantity: 2 }],
      ['add_item_to_cart', 'Dodaj dużą lemoniadę', { dish: 'Lemoniada', quantity: 1 }],
      ['replace_cart_item', 'Chciałem dużą lemoniadę', { from_dish: 'Lemoniada', to_dish: 'Lemoniada' }],
      ['get_cart_state', 'Co faktycznie jest w koszyku?', {}],
    ].entries()) {
      const result = await router.executeToolCall({ sessionId: 'sess_variant_audit', toolName, transcript, args: { ...args, restaurant_id: restaurant.id }, requestId: `variant_${index}`, turnId: `variant_${index}` });
      steps.push(structuredClone({ toolName, transcript, args, result, cart: session.cart }));
    }
    if (process.env.LIVE_VARIANT_AUDIT_OUTPUT) fs.writeFileSync(process.env.LIVE_VARIANT_AUDIT_OUTPUT, JSON.stringify({ source: 'synthetic variant menu, controlled tool args, not production transcript', steps }, null, 2));
    expect(session.cart.items.find(i => i.id === 'ravioli')?.qty ?? session.cart.items.find(i => i.id === 'ravioli')?.quantity).toBe(2);
    expect(steps).toHaveLength(5);
    expect(steps[0].cart.items).toEqual([]);
    expect(steps[0].result.response.intent).toBe('clarify_order');
    expect(steps[2].cart.items.map(i => i.id)).toEqual(['ravioli']);
    expect(steps[2].result.response.meta.liveTool.cartChanged).toBe(false);
    expect(steps[3].result.response.meta.liveTool.cartChanged).toBe(false);
    expect(steps[4].result.response.cart).toEqual(steps[4].cart);

    // Deliberately seed the old small variant via a successful, explicit small add.
    await router.executeToolCall({ sessionId: 'sess_variant_audit', toolName: 'add_item_to_cart', transcript: 'Dodaj małą lemoniadę', args: { dish: 'Lemoniada', quantity: 1 } });
    expect(session.cart.items.find(i => i.id === 'lemon-small')?.size_or_variant).toBe('mała');
    const correction = await router.executeToolCall({ sessionId: 'sess_variant_audit', toolName: 'replace_cart_item', transcript: 'Chciałem dużą lemoniadę', args: { from_dish: 'Lemoniada', to_dish: 'Lemoniada' } });
    expect(correction.response.meta.liveTool.cartChanged).toBe(false);
    expect(session.cart.items.find(i => i.id === 'lemon-small')?.qty).toBe(1);
    const rejectedReplacement = await router.executeToolCall({ sessionId: 'sess_variant_audit', toolName: 'replace_cart_item', transcript: 'Chciałem dużą lemoniadę', args: { from_dish: 'Lemoniada', to_dish: 'duża Lemoniada' } });
    expect(session.cart.items.find(i => i.id === 'lemon-small')?.qty).toBe(1);
    expect(rejectedReplacement.response.meta.liveTool.cartChanged).toBe(false);
    const quantity = await router.executeToolCall({ sessionId: 'sess_variant_audit', toolName: 'update_cart_item_quantity', transcript: 'Zmień ilość ravioli na trzy', args: { dish: 'Ravioli z dynią', quantity: 3 } });
    expect(quantity.response.meta.liveTool.cartChanged).toBe(true);
    fixture.menu.sort((a, b) => Number(b.id === 'bianca-large') - Number(a.id === 'bianca-large'));
    const correctLarge = await router.executeToolCall({ sessionId: 'sess_variant_audit', toolName: 'add_item_to_cart', transcript: 'Dodaj dużą Biancę', args: { dish: 'Bianca', quantity: 1 } });
    expect(correctLarge.response.meta.liveTool.cartChanged).toBe(true);
    expect(session.cart.items.find(i => i.id === 'bianca-large')?.size_or_variant).toBe('duża');
  } finally { vi.unstubAllGlobals(); }
});
