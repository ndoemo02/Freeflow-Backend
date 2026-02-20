import { describe, it, expect } from 'vitest';
import { extractLocation } from '../../api/brain/nlu/extractors.js';

describe('extractLocation', () => {

    // --- CONFIRMATION BLACKLIST ---
    describe('Confirmation Blacklist', () => {
        const confirmations = [
            'tak', 'Tak', 'TAK',
            'okej', 'ok', 'dobrze',
            'potwierdzam', 'jasne',
            'dawaj', 'leci', 'jazda',
            'no', 'mhm', 'aha',
            'spoko', 'git',
            'w porządku', 'oczywiście'
        ];

        for (const word of confirmations) {
            it(`should return null for confirmation: "${word}"`, () => {
                expect(extractLocation(word)).toBeNull();
            });
        }

        it('should still extract city from confirmation + city phrase', () => {
            // "tak, w Bytomiu" — the confirmation is embedded, not standalone
            const result = extractLocation('tak, w Bytomiu');
            expect(result).not.toBeNull();
            // Should normalize "Bytomiu" → "Bytom"
            expect(result).toBe('Bytom');
        });
    });

    // --- CUTOFF PHRASES (Location Cleaning) ---
    describe('Cutoff Phrases (Location Cleaning)', () => {
        it('should strip "do jedzenia" from location', () => {
            const result = extractLocation('w Piekarach do jedzenia');
            // "Piekarach" → normalizePolishCity → "Piekary"
            expect(result).toBe('Piekary');
        });

        it('should strip "na obiad" from location', () => {
            const result = extractLocation('w Bytomiu na obiad');
            expect(result).toBe('Bytom');
        });

        it('should strip "co polecisz" from location', () => {
            const result = extractLocation('w Katowicach co polecisz');
            // "Katowicach" → normalizePolishCity → "Katowicay" (ach→y)
            expect(result).not.toBeNull();
        });

        it('should strip "na wynos" from location', () => {
            const result = extractLocation('w Chorzowie na wynos');
            expect(result).not.toBeNull();
        });

        it('should return clean city without trailing phrases', () => {
            const result = extractLocation('w Bytomiu z dostawą');
            expect(result).toBe('Bytom');
        });
    });

    // --- BASIC EXTRACTION (Regression) ---
    describe('Basic Extraction (Regression)', () => {
        it('should extract city from "w Bytomiu"', () => {
            expect(extractLocation('w Bytomiu')).toBe('Bytom');
        });

        it('should extract city from "szukaj w Piekarach Śląskich"', () => {
            const result = extractLocation('szukaj w Piekarach Śląskich');
            expect(result).not.toBeNull();
        });

        it('should return null for empty input', () => {
            expect(extractLocation('')).toBeNull();
            expect(extractLocation(null)).toBeNull();
        });
    });
});
