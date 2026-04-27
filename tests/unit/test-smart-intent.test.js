/**
 * Unit tests for Smart Intent Resolution (classic + Vertex fallback)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { smartResolveIntent } from '../../api/brain/ai/smartIntent.js';

const mockDetectIntent = vi.fn();
const mockGenerateJsonWithVertex = vi.fn();
const mockIsVertexTextConfigured = vi.fn(() => true);

vi.mock('../../api/brain/intents/intentRouterGlue.js', () => ({
  detectIntent: (...args) => mockDetectIntent(...args),
}));

vi.mock('../../api/brain/ai/vertexTextClient.js', () => ({
  generateJsonWithVertex: (...args) => mockGenerateJsonWithVertex(...args),
  isVertexTextConfigured: (...args) => mockIsVertexTextConfigured(...args),
}));

describe('Smart Intent Resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.USE_LLM_INTENT;
    delete process.env.FORCE_LLM_TEST;
    mockIsVertexTextConfigured.mockReturnValue(true);
  });

  describe('Empty Input Handling', () => {
    it('returns smalltalk for empty text', async () => {
      const result = await smartResolveIntent({
        text: '',
        session: {},
        restaurants: [],
        previousIntent: null,
      });

      expect(result.intent).toBe('smalltalk');
      expect(result.confidence).toBe(0);
      expect(result.source).toBe('empty');
    });

    it('returns smalltalk for whitespace-only text', async () => {
      const result = await smartResolveIntent({
        text: '   ',
        session: {},
        restaurants: [],
        previousIntent: null,
      });

      expect(result.intent).toBe('smalltalk');
      expect(result.source).toBe('empty');
    });
  });

  describe('Classic NLU Path', () => {
    it('uses classic result when confidence is high', async () => {
      mockDetectIntent.mockResolvedValueOnce({
        intent: 'find_nearby',
        confidence: 0.85,
        entities: { location: 'Warsaw' },
      });

      const result = await smartResolveIntent({
        text: 'co jest dostepne w poblizu',
        session: {},
        restaurants: [],
        previousIntent: null,
      });

      expect(result.intent).toBe('find_nearby');
      expect(result.confidence).toBe(0.85);
      expect(result.source).toBe('classic');
      expect(result.slots).toEqual({ location: 'Warsaw' });
      expect(mockGenerateJsonWithVertex).not.toHaveBeenCalled();
    });

    it('skips LLM when expectedContext exists', async () => {
      mockDetectIntent.mockResolvedValueOnce({
        intent: 'none',
        confidence: 0.5,
        entities: {},
      });

      const result = await smartResolveIntent({
        text: 'pokaz wiecej',
        session: { expectedContext: 'show_more_options' },
        restaurants: [],
        previousIntent: null,
      });

      expect(result.source).toBe('classic');
      expect(mockGenerateJsonWithVertex).not.toHaveBeenCalled();
    });

    it('handles classic NLU errors gracefully', async () => {
      mockDetectIntent.mockRejectedValueOnce(new Error('NLU failed'));

      const result = await smartResolveIntent({
        text: 'test',
        session: {},
        restaurants: [],
        previousIntent: null,
      });

      expect(result.intent).toBe('unknown');
      expect(result.confidence).toBe(0);
      expect(result.source).toBe('classic');
    });
  });

  describe('LLM Fallback Path', () => {
    it('calls Vertex fallback when classic confidence is low', async () => {
      mockDetectIntent.mockResolvedValueOnce({
        intent: 'none',
        confidence: 0.4,
        entities: {},
      });

      mockGenerateJsonWithVertex.mockResolvedValueOnce({
        intent: 'find_nearby',
        confidence: 0.9,
        slots: { cuisine: 'pizza' },
      });

      const result = await smartResolveIntent({
        text: 'gdzie moge zjesc pizze',
        session: {},
        restaurants: [],
        previousIntent: null,
      });

      expect(result.intent).toBe('find_nearby');
      expect(result.confidence).toBe(0.9);
      expect(result.source).toBe('llm');
      expect(result.slots).toMatchObject({ cuisine: 'pizza' });
      expect(mockGenerateJsonWithVertex).toHaveBeenCalledTimes(1);
    });

    it('includes context in Vertex prompt', async () => {
      mockDetectIntent.mockResolvedValueOnce({ intent: 'none', confidence: 0.4, entities: {} });
      mockGenerateJsonWithVertex.mockResolvedValueOnce({
        intent: 'show_menu',
        confidence: 0.85,
        slots: {},
      });

      await smartResolveIntent({
        text: 'pokaz menu',
        session: {
          lastRestaurant: { name: 'Pizzeria Roma' },
          last_location: 'Warsaw',
        },
        restaurants: [],
        previousIntent: 'find_nearby',
      });

      const arg = mockGenerateJsonWithVertex.mock.calls[0][0];
      expect(arg.systemPrompt).toContain('lastIntent');
      expect(arg.systemPrompt).toContain('Pizzeria Roma');
      expect(arg.systemPrompt).toContain('Warsaw');
    });

    it('falls back to classic when Vertex returns unknown', async () => {
      mockDetectIntent.mockResolvedValueOnce({ intent: 'none', confidence: 0.4, entities: {} });
      mockGenerateJsonWithVertex.mockResolvedValueOnce({ intent: 'unknown', confidence: 0.3, slots: {} });

      const result = await smartResolveIntent({
        text: 'random gibberish',
        session: {},
        restaurants: [],
        previousIntent: null,
      });

      expect(result.intent).toBe('none');
      expect(result.source).toBe('classic');
    });

    it('handles Vertex errors gracefully', async () => {
      mockDetectIntent.mockResolvedValueOnce({ intent: 'none', confidence: 0.4, entities: {} });
      mockGenerateJsonWithVertex.mockRejectedValueOnce(new Error('vertex_error'));

      const result = await smartResolveIntent({
        text: 'test',
        session: {},
        restaurants: [],
        previousIntent: null,
      });

      expect(result.intent).toBe('none');
      expect(result.source).toBe('classic');
    });

    it('handles empty Vertex payload', async () => {
      mockDetectIntent.mockResolvedValueOnce({ intent: 'none', confidence: 0.4, entities: {} });
      mockGenerateJsonWithVertex.mockResolvedValueOnce(null);

      const result = await smartResolveIntent({
        text: 'test',
        session: {},
        restaurants: [],
        previousIntent: null,
      });

      expect(result.source).toBe('classic');
    });

    it('merges classic and Vertex slots', async () => {
      mockDetectIntent.mockResolvedValueOnce({
        intent: 'none',
        confidence: 0.4,
        entities: { location: 'Warsaw' },
      });

      mockGenerateJsonWithVertex.mockResolvedValueOnce({
        intent: 'find_nearby',
        confidence: 0.9,
        slots: { cuisine: 'pizza' },
      });

      const result = await smartResolveIntent({
        text: 'gdzie pizza w Warszawie',
        session: {},
        restaurants: [],
        previousIntent: null,
      });

      expect(result.slots).toMatchObject({
        location: 'Warsaw',
        cuisine: 'pizza',
      });
    });
  });

  describe('Environment Configuration', () => {
    it('skips LLM when USE_LLM_INTENT is not set and Vertex is not configured', async () => {
      delete process.env.USE_LLM_INTENT;
      mockIsVertexTextConfigured.mockReturnValue(false);

      mockDetectIntent.mockResolvedValueOnce({ intent: 'none', confidence: 0.4, entities: {} });

      const result = await smartResolveIntent({
        text: 'test',
        session: {},
        restaurants: [],
        previousIntent: null,
      });

      expect(result.source).toBe('classic');
      expect(mockGenerateJsonWithVertex).not.toHaveBeenCalled();
    });

    it('attempts LLM when USE_LLM_INTENT is true', async () => {
      process.env.USE_LLM_INTENT = 'true';
      mockIsVertexTextConfigured.mockReturnValue(false);
      mockDetectIntent.mockResolvedValueOnce({ intent: 'none', confidence: 0.4, entities: {} });
      mockGenerateJsonWithVertex.mockRejectedValueOnce(new Error('Missing Vertex project id'));

      await smartResolveIntent({
        text: 'test',
        session: {},
        restaurants: [],
        previousIntent: null,
      });

      expect(mockGenerateJsonWithVertex).toHaveBeenCalled();
    });
  });

  describe('Intent Mapping', () => {
    it('maps classic intents correctly', async () => {
      mockDetectIntent.mockResolvedValueOnce({ intent: 'menu_request', confidence: 0.8, entities: {} });

      const result = await smartResolveIntent({
        text: 'pokaz menu',
        session: {},
        restaurants: [],
        previousIntent: null,
      });

      expect(result.intent).toBe('menu_request');
      expect(result.source).toBe('classic');
    });

    it('handles missing confidence gracefully', async () => {
      mockDetectIntent.mockResolvedValueOnce({ intent: 'find_nearby', entities: {} });

      const result = await smartResolveIntent({
        text: 'co w poblizu',
        session: {},
        restaurants: [],
        previousIntent: null,
      });

      expect(result.confidence).toBe(0);
      expect(result.intent).toBe('find_nearby');
    });

    it('handles missing entities gracefully', async () => {
      mockDetectIntent.mockResolvedValueOnce({ intent: 'create_order', confidence: 0.7 });

      const result = await smartResolveIntent({
        text: 'zamow pizze',
        session: {},
        restaurants: [],
        previousIntent: null,
      });

      expect(result.slots).toEqual({});
    });
  });
});
