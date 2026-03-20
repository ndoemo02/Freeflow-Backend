import { describe, it, expect } from 'vitest';
import { extractQuantity } from '../helpers.js';

describe('extractQuantity', () => {
    it('extracts quantity from bare number ordering phrase', () => {
        expect(extractQuantity('2 wege burgery')).toBe(2);
    });

    it('extracts quantity from explicit "sztuki" ordering prefix', () => {
        expect(extractQuantity('poprosze 2 sztuki vege burger')).toBe(2);
    });

    it('does not treat piece count in dish name as portions', () => {
        expect(extractQuantity('Pierogi (ruskie lub z miesem) 6 szt.')).toBe(1);
        expect(extractQuantity('Placki ziemniaczane 4 szt.')).toBe(1);
    });

    it('prefers strong order marker over dish-name piece count', () => {
        expect(extractQuantity('2x pierogi (ruskie lub z miesem) 6 szt.')).toBe(2);
    });
});

