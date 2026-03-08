import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../_supabase.js', () => {
  const empty = { data: [], error: null };
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(empty),
    then: vi.fn((onSuccess) => Promise.resolve(empty).then(onSuccess))
  };

  return {
    supabase: {
      from: vi.fn(() => builder)
    }
  };
});

vi.mock('../../debug.js', () => ({
  updateDebugSession: vi.fn()
}));

vi.mock('../../brain/supabaseClient.js', () => ({
  default: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null })
    }))
  }
}));

const CALLZONE_ID = 'bd9f2244-7618-4071-aa96-52616a7b4c70';
const REZYDENCJA_ID = '4d27fbe3-20d0-4eb4-b003-1935be53af25';

const CALLZONE_MENU = [
  { id: 'call-v1', name: 'Vege Burger', base_name: 'Vege Burger', price_pln: 28, description: 'Burger vege', category: 'burger', available: true },
  { id: 'call-b1', name: 'Bacon Burger', base_name: 'Bacon Burger', price_pln: 32, description: 'Burger z bekonem', category: 'burger', available: true },
  { id: 'call-p1', name: 'Pizza Margherita', base_name: 'Pizza Margherita', price_pln: 29, description: 'Klasyczna pizza', category: 'pizza', available: true }
];

const REZYDENCJA_MENU = [
  { id: 'rez-1', name: 'Tagliatelle z krewetkami', base_name: 'Tagliatelle z krewetkami', price_pln: 28, description: 'Makaron', category: 'makaron', available: true }
];

vi.mock('../menuService.js', () => ({
  loadMenuPreview: vi.fn(async (restaurantId) => {
    if (restaurantId === CALLZONE_ID) {
      return { menu: CALLZONE_MENU, shortlist: CALLZONE_MENU.slice(0, 3), fallbackUsed: false };
    }

    if (restaurantId === REZYDENCJA_ID) {
      return { menu: REZYDENCJA_MENU, shortlist: REZYDENCJA_MENU.slice(0, 3), fallbackUsed: false };
    }

    return { menu: [], shortlist: [], fallbackUsed: false };
  })
}));

import { BrainPipeline } from '../core/pipeline.js';
import { NLURouter } from '../nlu/router.js';
import { InMemoryRestaurantRepository } from '../core/repository.js';
import { getSession, updateSession, closeConversation, getOrCreateActiveSession } from '../session/sessionStore.js';

const RESTAURANTS = [
  { id: CALLZONE_ID, name: 'Callzone', city: 'Piekary �l�skie', cuisine_type: 'Pizzeria', lat: 50.3801, lng: 18.9502 },
  { id: REZYDENCJA_ID, name: 'Rezydencja Luxury Hotel', city: 'Piekary �l�skie', cuisine_type: 'Mi�dzynarodowa', lat: 50.381, lng: 18.9521 },
  { id: '569a7d29-57be-4224-bdf3-09c483415cea', name: 'Klaps Burgers', city: 'Piekary �l�skie', cuisine_type: 'Ameryka�ska', lat: 50.3794, lng: 18.9487 }
];

function createPipeline() {
  return new BrainPipeline({
    nlu: new NLURouter(),
    repository: new InMemoryRestaurantRepository({ restaurants: RESTAURANTS })
  });
}

async function selectCallzone(pipeline, sessionId) {
  const result = await pipeline.process(sessionId, 'calzone');
  const session = getSession(sessionId);

  expect(result.intent).toBe('select_restaurant');
  expect(result.reply).toContain('Callzone');
  expect(session.currentRestaurant?.name).toBe('Callzone');
  expect(Array.isArray(session.last_menu)).toBe(true);
  expect(session.last_menu.length).toBeGreaterThan(0);

  return { result, session };
}

describe('Golden ordering flows', () => {
  beforeEach(() => {
    global.BRAIN_DEBUG = false;
    process.env.USE_LLM_INTENT = 'false';
  });

  it('flow 1: restaurant selection -> menu -> dish alias -> add to cart', async () => {
    const pipeline = createPipeline();
    const sessionId = `golden_alias_${Date.now()}`;

    await selectCallzone(pipeline, sessionId);
    const result = await pipeline.process(sessionId, 'wege burger');
    const session = getSession(sessionId);

    expect(result.intent).toBe('create_order');
    expect(result.reply).toContain('Vege Burger');
    expect(result.meta?.addedToCart).toBe(true);
    expect(session.cart?.items?.length).toBe(1);
    expect(session.cart.items[0].name).toBe('Vege Burger');
    expect(session.currentRestaurant?.name).toBe('Callzone');
  });

  it('flow 2: restaurant selection -> full dish name -> add to cart', async () => {
    const pipeline = createPipeline();
    const sessionId = `golden_full_${Date.now()}`;

    await selectCallzone(pipeline, sessionId);
    const result = await pipeline.process(sessionId, 'Bacon Burger');
    const session = getSession(sessionId);

    expect(result.intent).toBe('create_order');
    expect(result.reply).toContain('Bacon Burger');
    expect(result.meta?.addedToCart).toBe(true);
    expect(session.cart?.items?.length).toBe(1);
    expect(session.cart.items[0].name).toBe('Bacon Burger');
  });

  it('flow 3: restaurant selection -> qty=2 -> add to cart', async () => {
    const pipeline = createPipeline();
    const sessionId = `golden_qty_${Date.now()}`;

    await selectCallzone(pipeline, sessionId);
    const result = await pipeline.process(sessionId, '2 wege burgery');
    const session = getSession(sessionId);

    expect(result.intent).toBe('create_order');
    expect(result.reply).toContain('2 sztuki Vege Burger');
    expect(result.meta?.addedToCart).toBe(true);
    expect(session.cart?.items?.length).toBe(1);
    expect(session.cart.items[0].name).toBe('Vege Burger');
    expect(session.cart.items[0].qty || session.cart.items[0].quantity).toBe(2);
  });

  it('flow 4: after add-to-cart, escape to restaurant list is not blocked', async () => {
    const pipeline = createPipeline();
    const sessionId = `golden_escape_${Date.now()}`;

    await selectCallzone(pipeline, sessionId);
    await pipeline.process(sessionId, 'wege burger');

    updateSession(sessionId, {
      last_location: 'Piekary �l�skie'
    });

    const result = await pipeline.process(sessionId, 'poka� restauracje');
    const session = getSession(sessionId);

    expect(result.intent).toBe('find_nearby');
    expect(session.cart?.items?.length).toBe(1);
    expect(session.cart.items[0].name).toBe('Vege Burger');
  });

  it('flow 5: after checkout close, a new session starts without ghost cart', async () => {
    const sessionId = `golden_checkout_${Date.now()}`;

    updateSession(sessionId, {
      currentRestaurant: { id: CALLZONE_ID, name: 'Callzone' },
      lastRestaurant: { id: CALLZONE_ID, name: 'Callzone' },
      cart: {
        items: [{ id: 'call-v1', name: 'Vege Burger', price_pln: 28, qty: 1 }],
        total: 28,
        restaurantId: CALLZONE_ID
      },
      conversationPhase: 'ordering'
    });

    const closeResult = closeConversation(sessionId, 'ORDER_CONFIRMED');
    const next = getOrCreateActiveSession(sessionId);

    expect(closeResult.newSessionId).toBeTruthy();
    expect(next.isNew).toBe(true);
    expect(next.sessionId).not.toBe(sessionId);
    expect(next.session.cart?.items || []).toHaveLength(0);
    expect(next.session.currentRestaurant?.name).toBe('Callzone');
    expect(next.session.closedReason).toBeNull();
  });

  it('flow 6: dish alias inside restaurant context does not fall back to restaurant choice', async () => {
    const pipeline = createPipeline();
    const sessionId = `golden_context_${Date.now()}`;

    await selectCallzone(pipeline, sessionId);
    const result = await pipeline.process(sessionId, 'wege burger');
    const session = getSession(sessionId);

    expect(result.intent).toBe('create_order');
    expect(result.reply).toContain('Vege Burger');
    expect(result.reply).not.toContain('Z kt�rej restauracji');
    expect(session.currentRestaurant?.name).toBe('Callzone');
    expect(session.cart?.items?.length).toBe(1);
  });

  it('flow 7: menu request prefers currentRestaurant over stale lastRestaurant', async () => {
    const pipeline = createPipeline();
    const sessionId = `golden_menu_ctx_${Date.now()}`;

    updateSession(sessionId, {
      currentRestaurant: { id: CALLZONE_ID, name: 'Callzone' },
      lastRestaurant: { id: REZYDENCJA_ID, name: 'Rezydencja Luxury Hotel' },
      conversationPhase: 'restaurant_selected'
    });

    const result = await pipeline.process(sessionId, 'pokaz menu');
    const session = getSession(sessionId);

    expect(result.intent).toBe('menu_request');
    expect(Array.isArray(result.menuItems)).toBe(true);
    expect(result.menuItems[0]?.name).toBe('Vege Burger');
    expect(session.currentRestaurant?.name).toBe('Callzone');
    expect(session.lastRestaurant?.name).toBe('Callzone');
    expect(session.last_menu_restaurant_id).toBe(CALLZONE_ID);
  });

});
