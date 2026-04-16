import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NLURouter } from '../nlu/router.js';

vi.mock('../../_supabase.js', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => {
        const responseBase = { data: [], error: null };
        const queryBuilder = Promise.resolve(responseBase);
        queryBuilder.eq = vi.fn().mockReturnValue(Promise.resolve(responseBase));
        queryBuilder.in = vi.fn().mockReturnValue(Promise.resolve(responseBase));
        queryBuilder.limit = vi.fn().mockReturnValue(Promise.resolve(responseBase));
        return queryBuilder;
      })
    }))
  }
}));

describe('NLU regression matrix', () => {
  beforeEach(() => {
    global.BRAIN_DEBUG = false;
    process.env.USE_LLM_INTENT = 'false';
  });

  it('maps discovery phrases to find_nearby without restaurant context', async () => {
    const nlu = new NLURouter();

    const result = await nlu.detect({
      text: 'znajdz restauracje w poblizu',
      body: { text: 'znajdz restauracje w poblizu' },
      session: {}
    });

    expect(result.intent).toBe('find_nearby');
    expect(['discovery_guard_block', 'regex_v2']).toContain(result.source);
  });

  it('maps restaurant shortname to select_restaurant', async () => {
    const nlu = new NLURouter();

    const result = await nlu.detect({
      text: 'calzone',
      body: { text: 'calzone' },
      session: {}
    });

    expect(result.intent).toBe('select_restaurant');
    expect(result.source).toBe('catalog_match_explicit');
    expect(result.entities?.restaurant).toBe('Callzone');
  });

  it('maps "pokaz restauracje Calzone" to select_restaurant (not discovery fallback)', async () => {
    const nlu = new NLURouter();

    const result = await nlu.detect({
      text: 'pokaz restauracje Calzone',
      body: { text: 'pokaz restauracje Calzone' },
      session: {}
    });

    expect(result.intent).toBe('select_restaurant');
    expect(result.source).toBe('catalog_match_explicit');
    expect(result.entities?.restaurant).toBe('Callzone');
  });

  it('keeps explicit restaurant context for item+restaurant utterance', async () => {
    const nlu = new NLURouter();

    const result = await nlu.detect({
      text: 'chcialbym nalesniki z nutella z restauracji Stara Kamienica',
      body: { text: 'chcialbym nalesniki z nutella z restauracji Stara Kamienica' },
      session: {}
    });

    expect(result.intent).toBe('create_order');
    expect(result.entities?.restaurant).toBe('Restauracja Stara Kamienica');
    expect(result.entities?.restaurantId).toBe('1fc1e782-bac6-47b2-978a-f6f2b38000cd');
  });

  it('maps loose menu questions to menu_request inside restaurant context', async () => {
    const nlu = new NLURouter();
    const session = {
      currentRestaurant: { id: 'CALL', name: 'Callzone' },
      last_menu: [
        { id: 'v1', name: 'Vege Burger', base_name: 'Vege Burger', price_pln: '28.00' },
        { id: 'b1', name: 'Bacon Burger', base_name: 'Bacon Burger', price_pln: '32.00' }
      ]
    };

    for (const text of ['co maja', 'co serwuja', 'cos smacznego', 'co polecasz']) {
      const result = await nlu.detect({ text, body: { text }, session });
      expect(result.intent).toBe('menu_request');
      expect(result.source).toBe('soft_menu_request_guard');
    }
  });

  it('maps quantity-prefixed dish phrases to create_order with quantity', async () => {
    const nlu = new NLURouter();
    const session = {
      currentRestaurant: { id: 'CALL', name: 'Callzone' },
      last_menu: [
        { id: 'v1', name: 'Vege Burger', base_name: 'Vege Burger', price_pln: '28.00' },
        { id: 'b1', name: 'Bacon Burger', base_name: 'Bacon Burger', price_pln: '32.00' }
      ]
    };

    const result = await nlu.detect({
      text: '2 wege burgery',
      body: { text: '2 wege burgery' },
      session
    });

    expect(result.intent).toBe('create_order');
    expect(result.source).toBe('compound_parser'); // dish_guard renamed to compound_parser for this path
    expect(result.entities?.dish).toBe('Vege Burger');
    expect(result.entities?.quantity).toBe(2);
  });

  it('maps ordering escape phrases to cancel_order', async () => {
    const nlu = new NLURouter();

    const result = await nlu.detect({
      text: 'anuluj',
      body: { text: 'anuluj' },
      session: {
        conversationPhase: 'ordering',
        currentRestaurant: { id: 'CALL', name: 'Callzone' }
      }
    });

    expect(result.intent).toBe('cancel_order');
    expect(result.source).toBe('ordering_escape_guard');
  });

  it('keeps discovery intent inside restaurant context for "gdzie zjem w Piekarach"', async () => {
    const nlu = new NLURouter();
    const session = {
      currentRestaurant: { id: 'TKK', name: 'Tasty King Kebab' },
      last_menu: [
        { id: 'n1', name: 'Nuggets box', base_name: 'Nuggets box', price_pln: '15.00' },
        { id: 'k1', name: 'Kebab amerykanski', base_name: 'Kebab amerykanski', price_pln: '20.00' }
      ]
    };

    const result = await nlu.detect({
      text: 'gdzie zjem w Piekarach',
      body: { text: 'gdzie zjem w Piekarach' },
      session
    });

    expect(result.intent).toBe('find_nearby');
    expect(result.source).toBe('restaurant_navigation_override');
  });

  it('routes spicy preference refinement to discovery and never treats "ostro" as location', async () => {
    const nlu = new NLURouter();
    const cases = ['coś na ostro', 'coś pikantnego', 'coś ostrego'];

    for (const text of cases) {
      const result = await nlu.detect({
        text,
        body: { text },
        session: {
          expectedContext: 'select_restaurant',
          lastIntent: 'find_nearby'
        }
      });

      expect(result.intent).toBe('find_nearby');
      expect(result.source).toBe('nlu_spicy_refinement');
      expect(result.entities?.tag).toBe('spicy');
      expect(result.entities?.tags).toContain('spicy');
      expect(result.entities?.location).toBeNull();
    }
  });

  it('keeps context_lock selection when there is a real selection signal', async () => {
    const nlu = new NLURouter();

    const result = await nlu.detect({
      text: '2',
      body: { text: '2' },
      session: {
        expectedContext: 'select_restaurant',
        lastIntent: 'find_nearby'
      }
    });

    expect(result.intent).toBe('select_restaurant');
    expect(result.source).toBe('context_lock');
  });
});
