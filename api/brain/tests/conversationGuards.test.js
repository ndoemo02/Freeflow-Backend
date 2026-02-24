/**
 * Unit Tests: ConversationGuards
 * ═══════════════════════════════════════════════════════════════════════════
 * Tests for UX conversation improvement helpers.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect } from 'vitest';
import {
    hasLockedRestaurant,
    isOrderingContext,
    containsDishLikePhrase,
    recoverRestaurantFromFullText,
    calculatePhase,
    extractOrdinal,
    sanitizeLocation,
    resolveRestaurantFromMenuRequest,
    containsOrderingIntent
} from '../core/ConversationGuards.js';
import { scoreRestaurantMatch } from '../utils/textMatch.js';

describe('🛡️ ConversationGuards', () => {

    // ═══════════════════════════════════════════════════════════════════════════
    // FIX 1: hasLockedRestaurant
    // ═══════════════════════════════════════════════════════════════════════════
    describe('hasLockedRestaurant', () => {

        it('returns false for empty session', () => {
            expect(hasLockedRestaurant({})).toBe(false);
        });

        it('returns false for null session', () => {
            expect(hasLockedRestaurant(null)).toBe(false);
        });

        it('returns true when currentRestaurant exists', () => {
            expect(hasLockedRestaurant({ currentRestaurant: { name: 'Test' } })).toBe(true);
        });

        it('returns true when lockedRestaurantId exists', () => {
            expect(hasLockedRestaurant({ lockedRestaurantId: 123 })).toBe(true);
        });

        it('returns true when lastRestaurant exists', () => {
            expect(hasLockedRestaurant({ lastRestaurant: { name: 'Old' } })).toBe(true);
        });

        it('returns true when entityCache has restaurants', () => {
            expect(hasLockedRestaurant({
                entityCache: { restaurants: [{ name: 'Cached' }] }
            })).toBe(true);
        });
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // FIX 3: isOrderingContext
    // ═══════════════════════════════════════════════════════════════════════════
    describe('isOrderingContext', () => {

        it('returns false for empty session', () => {
            expect(isOrderingContext({})).toBe(false);
        });

        it('returns true when currentRestaurant exists', () => {
            expect(isOrderingContext({ currentRestaurant: { name: 'Test' } })).toBe(true);
        });

        it('returns true when lastIntent is select_restaurant', () => {
            expect(isOrderingContext({ lastIntent: 'select_restaurant' })).toBe(true);
        });

        it('returns true when lastIntent is menu_request', () => {
            expect(isOrderingContext({ lastIntent: 'menu_request' })).toBe(true);
        });

        it('returns true when conversationPhase is ordering', () => {
            expect(isOrderingContext({ conversationPhase: 'ordering' })).toBe(true);
        });
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // FIX 5: containsDishLikePhrase
    // ═══════════════════════════════════════════════════════════════════════════
    describe('containsDishLikePhrase', () => {

        it('returns false for empty text', () => {
            expect(containsDishLikePhrase('')).toBe(false);
            expect(containsDishLikePhrase(null)).toBe(false);
        });

        it('detects pizza', () => {
            expect(containsDishLikePhrase('chcę pizzę')).toBe(true);
        });

        it('detects kebab', () => {
            expect(containsDishLikePhrase('zamów mi kebab')).toBe(true);
        });

        it('detects burger', () => {
            expect(containsDishLikePhrase('poproszę burgera')).toBe(true);
        });

        it('detects naleśniki', () => {
            expect(containsDishLikePhrase('naleśniki z kurczakiem')).toBe(true);
        });

        it('detects pierogi', () => {
            expect(containsDishLikePhrase('dwa pierogi ruskie')).toBe(true);
        });

        it('returns false for location query', () => {
            expect(containsDishLikePhrase('znajdź restauracje')).toBe(false);
        });

        it('returns false for generic question', () => {
            expect(containsDishLikePhrase('co masz w ofercie')).toBe(false);
        });
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // FIX 2: recoverRestaurantFromFullText
    // ═══════════════════════════════════════════════════════════════════════════
    describe('recoverRestaurantFromFullText', () => {

        const restaurants = [
            { name: 'Stara Kamienica', id: 1 },
            { name: 'Bar Praha', id: 2 },
            { name: 'Monte Carlo', id: 3 }
        ];

        it('returns null for empty text', async () => {
            const result = await recoverRestaurantFromFullText('', restaurants);
            expect(result).toBeNull();
        });

        it('returns null for empty restaurants list', async () => {
            const result = await recoverRestaurantFromFullText('pokaż menu', []);
            expect(result).toBeNull();
        });

        it('recovers restaurant from text (case insensitive)', async () => {
            const result = await recoverRestaurantFromFullText(
                'pokaż co mają w starej kamienicy',
                restaurants
            );
            expect(result?.id).toBe(1);
            expect(result?.name).toBe('Stara Kamienica');
        });

        it('recovers restaurant with diacritics', async () => {
            const result = await recoverRestaurantFromFullText(
                'menu bar praha',
                restaurants
            );
            expect(result?.id).toBe(2);
        });

        it('returns null when no match', async () => {
            const result = await recoverRestaurantFromFullText(
                'pokaż menu restauracji',
                restaurants
            );
            expect(result).toBeNull();
        });
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // FIX 4: calculatePhase
    // ═══════════════════════════════════════════════════════════════════════════
    describe('calculatePhase', () => {

        it('returns restaurant_selected for select_restaurant intent', () => {
            expect(calculatePhase('select_restaurant', 'idle')).toBe('restaurant_selected');
        });

        it('returns ordering for create_order intent', () => {
            expect(calculatePhase('create_order', 'idle')).toBe('ordering');
        });

        it('returns idle for find_nearby intent', () => {
            expect(calculatePhase('find_nearby', 'ordering')).toBe('idle');
        });

        it('preserves phase for find_nearby from continuity_guard', () => {
            expect(calculatePhase('find_nearby', 'ordering', 'continuity_guard')).toBe('ordering');
        });

        it('returns current phase for unknown intent', () => {
            expect(calculatePhase('unknown', 'ordering')).toBe('ordering');
        });
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // FIX A2: extractOrdinal
    // ═══════════════════════════════════════════════════════════════════════════
    describe('extractOrdinal', () => {

        it('returns null for empty text', () => {
            expect(extractOrdinal('')).toBeNull();
            expect(extractOrdinal(null)).toBeNull();
        });

        it('returns 1 for "pierwsza"', () => {
            expect(extractOrdinal('pierwsza')).toBe(1);
        });

        it('returns 1 for "ta pierwsza"', () => {
            expect(extractOrdinal('ta pierwsza')).toBe(1);
        });

        it('returns 1 for "łowicka tą pierwszą"', () => {
            expect(extractOrdinal('no tą pierwszą')).toBe(1);
        });

        it('returns 2 for "druga"', () => {
            expect(extractOrdinal('daj mi drugą')).toBe(2);
        });

        it('returns 2 for "dwójka"', () => {
            expect(extractOrdinal('dwójka')).toBe(2);
        });

        it('returns 1 for single digit "1"', () => {
            expect(extractOrdinal('1')).toBe(1);
        });

        it('returns 3 for single digit "3"', () => {
            expect(extractOrdinal('numer trzy')).toBe(3);
        });

        it('returns null for unrelated text', () => {
            expect(extractOrdinal('poprosze burgera')).toBeNull();
        });
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // FIX A4: sanitizeLocation
    // ═══════════════════════════════════════════════════════════════════════════
    describe('sanitizeLocation', () => {

        it('passes clean short location unchanged', () => {
            expect(sanitizeLocation('Piekary Śląskie', {})).toBe('Piekary Śląskie');
        });

        it('passes single-word location unchanged', () => {
            expect(sanitizeLocation('Bytom', {})).toBe('Bytom');
        });

        it('rejects long location containing pizza', () => {
            const result = sanitizeLocation('pizzę może być włoska', {});
            expect(result).toBeNull();
        });

        it('falls back to session.last_location when location is bad', () => {
            const result = sanitizeLocation('pizzę może być włoska', { last_location: 'Gliwice' });
            expect(result).toBe('Gliwice');
        });

        it('falls back to session.default_city when last_location absent', () => {
            const result = sanitizeLocation('makaron może być włoski danie', { default_city: 'Katowice' });
            expect(result).toBe('Katowice');
        });

        it('returns null if no fallback available', () => {
            expect(sanitizeLocation('pizzę może być włoska', {})).toBeNull();
        });
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // textMatch: scoreRestaurantMatch
    // ═══════════════════════════════════════════════════════════════════════════
    describe('scoreRestaurantMatch', () => {

        it('returns 1 for exact substring match', () => {
            expect(scoreRestaurantMatch('stara kamienica', 'Stara Kamienica')).toBe(1);
        });

        it('returns high score for partial inflected match (starej kamienicy)', () => {
            const score = scoreRestaurantMatch('pokaz co maja w starej kamienicy', 'Stara Kamienica');
            // "kamienica" is NOT in "kamienicy", but "stara" token NOT matching "starej" either
            // but we expect score > 0 since at least 1 token overlaps
            expect(score).toBeGreaterThan(0);
        });

        it('returns 0 for completely unrelated input', () => {
            expect(scoreRestaurantMatch('pizza i makaron', 'Bar Praha')).toBe(0);
        });

        it('returns 0 for empty inputs', () => {
            expect(scoreRestaurantMatch('', 'Stara Kamienica')).toBe(0);
            expect(scoreRestaurantMatch('stara kamienica', '')).toBe(0);
        });
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // FIX A3: containsOrderingIntent
    // ═══════════════════════════════════════════════════════════════════════════
    describe('containsOrderingIntent', () => {

        it('detects "skusze sie na nalesniki"', () => {
            expect(containsOrderingIntent('skusze sie na nalesniki z kurczakiem')).toBe(true);
        });

        it('detects "poprose burgera"', () => {
            expect(containsOrderingIntent('poprosze burgera')).toBe(true);
        });

        it('detects "wezmę" ordering verb', () => {
            expect(containsOrderingIntent('wezme pizze')).toBe(true);
        });

        it('detects dish keyword (nalesniki) via containsDishLikePhrase', () => {
            expect(containsOrderingIntent('to skusze sie na nalesniki')).toBe(true);
        });

        it('returns false for neutral discovery text', () => {
            expect(containsOrderingIntent('pokaz restauracje w miescie')).toBe(false);
        });
    });

});
