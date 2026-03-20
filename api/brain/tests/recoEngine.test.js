/**
 * recoEngine.test.js — Reco V1 unit tests
 *
 * Rules:
 *  - Does NOT touch cascade suite semantics.
 *  - No DB calls; all input is in-memory.
 *  - Tests cover: scoring, availability filtering, fallback paths, topN cap.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getRecommendations, WEIGHTS, RECO_ELIGIBLE_INTENTS } from '../../../api/brain/recommendations/recoEngine.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MENU = [
  { id: '1', name: 'Burger Klasyczny',   category: 'burgery',        price_pln: 28,  available: true  },
  { id: '2', name: 'Pizza Margherita',   category: 'pizza',           price_pln: 35,  available: true  },
  { id: '3', name: 'Sałatka Grecka',     category: 'sałatki',         price_pln: 22,  available: true  },
  { id: '4', name: 'Stek Wołowy',        category: 'dania główne',    price_pln: 65,  available: true  },
  { id: '5', name: 'Kotlet Schabowy',    category: 'dania główne',    price_pln: 38,  available: true  },
  { id: '6', name: 'NIEDOSTĘPNE DANIE',  category: 'burgery',         price_pln: 30,  available: false },
];

const MENU_IS_AVAILABLE = [
  { id: '7', name: 'Zupa Dnia',  category: 'zupy', price_pln: 18, is_available: false },
  { id: '8', name: 'Pierogi',    category: 'zupy', price_pln: 24, is_available: true  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function ids(results) {
  return results.map(r => r.item.id);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('getRecommendations — fallback / edge cases', () => {
  it('returns [] for empty array', () => {
    expect(getRecommendations([])).toEqual([]);
  });

  it('returns [] for null input', () => {
    expect(getRecommendations(null)).toEqual([]);
  });

  it('returns [] for undefined input', () => {
    expect(getRecommendations(undefined)).toEqual([]);
  });

  it('returns [] when all items are unavailable (available:false)', () => {
    const unavailable = MENU.map(i => ({ ...i, available: false }));
    expect(getRecommendations(unavailable)).toEqual([]);
  });

  it('returns [] when all items are unavailable (is_available:false)', () => {
    const items = [{ id: 'x', name: 'Test', price_pln: 20, is_available: false }];
    expect(getRecommendations(items)).toEqual([]);
  });

  it('handles single available item', () => {
    const single = [{ id: '1', name: 'Burger', category: 'burgery', price_pln: 25, available: true }];
    const result = getRecommendations(single);
    expect(result).toHaveLength(1);
    expect(result[0].item.id).toBe('1');
  });

  it('skips non-eligible intents', () => {
    const result = getRecommendations(MENU, { intent: 'smalltalk' });
    expect(result).toEqual([]);
  });

  it('skips non-eligible intent: find_nearby', () => {
    const result = getRecommendations(MENU, { intent: 'find_nearby' });
    expect(result).toEqual([]);
  });
});

describe('getRecommendations — availability filtering', () => {
  it('excludes items with available:false', () => {
    const result = getRecommendations(MENU, { intent: 'menu_request' });
    expect(ids(result)).not.toContain('6');
  });

  it('excludes items with is_available:false', () => {
    const result = getRecommendations(MENU_IS_AVAILABLE, { intent: 'menu_request' });
    expect(ids(result)).not.toContain('7');
    expect(ids(result)).toContain('8');
  });
});

describe('getRecommendations — topN cap', () => {
  it('returns at most 5 items regardless of menu size', () => {
    const large = Array.from({ length: 20 }, (_, i) => ({
      id: String(i), name: `Danie ${i}`, category: 'main', price_pln: 20 + i, available: true,
    }));
    expect(getRecommendations(large, { intent: 'menu_request' }).length).toBeLessThanOrEqual(5);
  });

  it('topN=3 returns at most 3', () => {
    expect(getRecommendations(MENU, { intent: 'menu_request', topN: 3 }).length).toBeLessThanOrEqual(3);
  });

  it('topN hard-capped at 5 even if caller passes larger value', () => {
    const large = Array.from({ length: 10 }, (_, i) => ({
      id: String(i), name: `Danie ${i}`, category: 'main', price_pln: 20 + i, available: true,
    }));
    expect(getRecommendations(large, { intent: 'menu_request', topN: 10 }).length).toBeLessThanOrEqual(5);
  });
});

describe('getRecommendations — result shape', () => {
  it('each result has item, score (number), and why (string)', () => {
    const result = getRecommendations(MENU, { intent: 'menu_request' });
    expect(result.length).toBeGreaterThan(0);
    for (const r of result) {
      expect(r).toHaveProperty('item');
      expect(r).toHaveProperty('score');
      expect(r).toHaveProperty('why');
      expect(typeof r.score).toBe('number');
      expect(typeof r.why).toBe('string');
      expect(r.why.length).toBeGreaterThan(0);
    }
  });

  it('all scores are in [0, 1]', () => {
    const result = getRecommendations(MENU, { intent: 'menu_request' });
    for (const r of result) {
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(1);
    }
  });

  it('results are sorted descending by score', () => {
    const result = getRecommendations(MENU, { intent: 'menu_request' });
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].score).toBeGreaterThanOrEqual(result[i].score);
    }
  });
});

describe('getRecommendations — intent match scoring', () => {
  it('item matching targetItems appears at top', () => {
    const result = getRecommendations(MENU, {
      intent: 'create_order',
      targetItems: ['burger'],
    });
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].item.name.toLowerCase()).toContain('burger');
  });

  it('partial prefix match still scores above zero', () => {
    const result = getRecommendations(MENU, {
      intent: 'create_order',
      targetItems: ['sal'],   // prefix of 'sałatka'
    });
    // Sałatka Grecka should score higher than items with no match
    const salatkaResult = result.find(r => r.item.name.includes('Sałatka'));
    expect(salatkaResult).toBeDefined();
    expect(salatkaResult.score).toBeGreaterThan(0.1);
  });

  it('empty targetItems does not crash', () => {
    const result = getRecommendations(MENU, { intent: 'menu_request', targetItems: [] });
    expect(result.length).toBeGreaterThan(0);
  });

  it('null targetItems does not crash', () => {
    const result = getRecommendations(MENU, { intent: 'menu_request', targetItems: null });
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('getRecommendations — eligible intents', () => {
  const ELIGIBLE = ['menu_request', 'show_menu', 'create_order', 'recommend'];
  for (const intent of ELIGIBLE) {
    it(`returns results for intent="${intent}"`, () => {
      const result = getRecommendations(MENU, { intent });
      expect(result.length).toBeGreaterThan(0);
    });
  }
});

describe('WEIGHTS config sanity', () => {
  it('weights sum to 1.0', () => {
    const sum = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
    expect(Math.abs(sum - 1.0)).toBeLessThan(0.001);
  });

  it('all weights are positive', () => {
    for (const w of Object.values(WEIGHTS)) {
      expect(w).toBeGreaterThan(0);
    }
  });
});

describe('RECO_ELIGIBLE_INTENTS export', () => {
  it('is a Set', () => {
    expect(RECO_ELIGIBLE_INTENTS).toBeInstanceOf(Set);
  });

  it('contains menu_request and create_order', () => {
    expect(RECO_ELIGIBLE_INTENTS.has('menu_request')).toBe(true);
    expect(RECO_ELIGIBLE_INTENTS.has('create_order')).toBe(true);
  });
});
