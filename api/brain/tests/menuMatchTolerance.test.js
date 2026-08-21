import { describe, it, expect } from 'vitest';
import { findBestDishMatch, tokensMatchWithTolerance } from '../helpers.js';
import { scoreGroundedMenuItem } from '../grounding/menuGrounding.js';

/**
 * Tolerancja literowa w dopasowaniu nazw dan — skalowana DLUGOSCIA tokenu.
 *
 * Powod: uzytkownik mowi „margarita" (tak sie to wymawia), a karta ma
 * „Pizza Margherita". Dystans Levenshteina wynosi 1, ale oba mechanizmy
 * dopasowania porownywaly tokeny znakowo:
 *   - `menuGrounding.scoreGroundedMenuItem` przez `Set.has()` (sciezka live),
 *   - `helpers.findBestDishMatch` przez `Array.includes()` (sciezka tekstowa).
 * Jedna litera zerowala oba najwieksze skladniki punktacji, wiec zapytanie
 * przepadalo mimo oczywistego podobienstwa.
 *
 * Budzet bledu ROSNIE z dlugoscia slowa i to jest sedno rozwiazania:
 *   < 5 znakow  -> 0 (dokladnie)
 *   5-7 znakow  -> 1
 *   >= 8 znakow -> 2
 *
 * Krotkie slowa gesto wypelniaja przestrzen jezyka — „kawa" i „lawa" roznia sie
 * jedna litera i OBA sa prawdziwymi slowami. Przy dziewieciu znakach szansa, ze
 * literowka zamienia jedno danie w inne ISTNIEJACE danie, jest znikoma.
 * Dlatego prog nie moze byc wspolny dla wszystkich dlugosci.
 */

describe('tokensMatchWithTolerance — budzet bledu zalezny od dlugosci', () => {
    it('nie toleruje zadnej roznicy w krotkich slowach (kawa/lawa)', () => {
        expect(tokensMatchWithTolerance('kawa', 'lawa')).toBe(false);
    });

    it('toleruje jedna litere w slowach 5-7 znakow', () => {
        expect(tokensMatchWithTolerance('rosol', 'rosow')).toBe(true);
    });

    it('toleruje dwie litery w slowach od 8 znakow', () => {
        expect(tokensMatchWithTolerance('margarita', 'margherita')).toBe(true);
    });

    it('budzet bierze z KROTSZEGO tokenu, wiec dlugi nie rozluznia krotkiego', () => {
        // 'lawa' (4) obok 'lawenda' (7): gdyby budzet szedl z dluzszego, doszloby
        // do falszywego trafienia. min(0, 1) = 0 -> brak tolerancji.
        expect(tokensMatchWithTolerance('lawa', 'lawenda')).toBe(false);
    });

    it('rowne tokeny pasuja zawsze', () => {
        expect(tokensMatchWithTolerance('pizza', 'pizza')).toBe(true);
    });

    it('nie laczy roznych dan mimo podobnej dlugosci', () => {
        expect(tokensMatchWithTolerance('pierogi', 'placki')).toBe(false);
    });
});

describe('scoreGroundedMenuItem — sciezka live', () => {
    const margherita = { base_name: 'Pizza Margherita', name: 'Pizza Margherita 40 cm', category: 'Pizza' };

    it('znajduje Margherite po fonetycznym „margarita"', () => {
        expect(scoreGroundedMenuItem(margherita, 'margarita')).toBeGreaterThan(0);
    });

    it('nadal znajduje po poprawnej pisowni', () => {
        expect(scoreGroundedMenuItem(margherita, 'margherita')).toBeGreaterThan(0);
    });

    it('nie dopasowuje dania o zupelnie innej nazwie', () => {
        expect(scoreGroundedMenuItem(margherita, 'pierogi')).toBe(0);
    });

    it('nie myli krotkich nazw roznych pozycji', () => {
        const lawa = { base_name: 'Lawa czekoladowa', name: 'Lawa czekoladowa' };
        expect(scoreGroundedMenuItem(lawa, 'kawa')).toBe(0);
    });
});

describe('findBestDishMatch — sciezka tekstowa', () => {
    const catalog = [
        { id: 'p32', base_name: 'Pizza Margherita', name: 'Pizza Margherita 32 cm', price_pln: 29 },
        { id: 'p40', base_name: 'Pizza Margherita', name: 'Pizza Margherita 40 cm', price_pln: 39 },
        { id: 'z1', base_name: 'Rosol z domowym makaronem', name: 'Rosol', price_pln: 18 },
    ];

    it('znajduje Margherite po fonetycznym „margarita"', () => {
        const match = findBestDishMatch('margarita', catalog);
        expect(match).toBeTruthy();
        expect(String(match.base_name || match.name)).toContain('Margherita');
    });

    it('nadal znajduje po poprawnej pisowni', () => {
        const match = findBestDishMatch('margherita', catalog);
        expect(match).toBeTruthy();
        expect(String(match.base_name || match.name)).toContain('Margherita');
    });

    it('nie zwraca dopasowania dla obcego zapytania', () => {
        expect(findBestDishMatch('sushi', catalog)).toBeNull();
    });
});
