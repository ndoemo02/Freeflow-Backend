import { describe, it, expect } from 'vitest';
import { parseCompoundOrder } from '../nlu/compoundOrderParser.js';

/**
 * Regresja z sesji 18g (produkcja).
 *
 * "dodaj Pizza Margherita 32 cm" dawalo DWIE pozycje:
 *   [{ dish: 'Pizza Margherita', quantity: 1 }, { dish: 'Cm', quantity: 32 }]
 * czyli 33 sztuki za 1181 zl zamiast jednej pizzy za 29 zl.
 *
 * Przyczyna: INLINE_QTY_BREAK_REGEX dzielil tekst przed KAZDA liczba, po ktorej
 * stoi litera — takze przed jednostka miary nalezaca do nazwy dania. Powstawala
 * fikcyjna pozycja "Cm" z iloscia 32, dopasowywana potem rozmyciem do dania
 * zawierajacego "cm" w nazwie.
 *
 * `extractQuantity` w helpers.js ma ochrone przed tym od dawna (lista jednostek
 * menu). Compound parser jej nie mial — ta sama logika w dwoch miejscach,
 * naprawiona w jednym. Patrz §9 CLAUDE.md.
 */
const PIZZA_MENU = [
    { id: 'pizza_margherita_32', name: 'Pizza Margherita 32 cm', base_name: 'Pizza Margherita', type: 'MAIN' },
    { id: 'pizza_margherita_40', name: 'Pizza Margherita 40 cm', base_name: 'Pizza Margherita', type: 'MAIN' },
    { id: 'pizza_bianca_32', name: 'Pizza Bianca z gruszką 32 cm', base_name: 'Pizza Bianca z gruszką', type: 'MAIN' },
    { id: 'side_fries', name: 'Frytki', base_name: 'Frytki', type: 'ADDON' },
    { id: 'main_burger', name: 'Burger Klasyczny', base_name: 'Burger Klasyczny', type: 'MAIN' },
];

describe('compoundOrderParser — jednostki miary w nazwie dania', () => {
    it('nie tworzy osobnej pozycji z rozmiaru "32 cm"', () => {
        const result = parseCompoundOrder('dodaj Pizza Margherita 32 cm', PIZZA_MENU);

        expect(result.items.length).toBe(1);
    });

    it('nie czyta rozmiaru "32 cm" jako ilosci sztuk', () => {
        const result = parseCompoundOrder('dodaj Pizza Margherita 32 cm', PIZZA_MENU);

        expect(result.items[0].quantity).toBe(1);
    });

    // Rozmiar musi PRZEZYC parsowanie, inaczej naprawa zamienilaby 33 pizze na
    // wlasciwa liczbe, ale zlego wariantu. Nosnikiem jest `meta.rawLabel` —
    // pole `dish` to juz wynik dopasowania do karty (oba warianty dziela
    // `base_name`), a wybor 32 vs 40 cm rozstrzyga sie dalej, w orderHandler.
    it('zachowuje rozmiar w surowej etykiecie pozycji', () => {
        const result = parseCompoundOrder('dodaj Pizza Margherita 32 cm', PIZZA_MENU);

        expect(result.items[0].meta.rawLabel).toMatch(/32\s*cm/i);
    });

    it('rozroznia rozmiary w surowej etykiecie', () => {
        const r32 = parseCompoundOrder('dodaj Pizza Margherita 32 cm', PIZZA_MENU);
        const r40 = parseCompoundOrder('dodaj Pizza Margherita 40 cm', PIZZA_MENU);

        expect(r32.items[0].meta.rawLabel).toMatch(/32/);
        expect(r40.items[0].meta.rawLabel).toMatch(/40/);
    });

    it('nie gubi jawnej ilosci podanej przed nazwa z rozmiarem', () => {
        const result = parseCompoundOrder('dodaj 2 Pizza Margherita 32 cm', PIZZA_MENU);

        expect(result.items.length).toBe(1);
        expect(result.items[0].quantity).toBe(2);
    });

    it('traktuje tak samo inne jednostki menu (ml)', () => {
        const result = parseCompoundOrder('poprosze Cola 500 ml', [
            { id: 'drink_cola_500', name: 'Cola 500 ml', base_name: 'Cola', type: 'ADDON' },
        ]);

        expect(result.items.length).toBe(1);
        expect(result.items[0].quantity).toBe(1);
    });

    // Kontrole negatywne — prawdziwe zamowienia wieloelementowe maja dzialac jak dotad.
    it('nadal dzieli prawdziwe zamowienie wieloelementowe', () => {
        const result = parseCompoundOrder('poprosze 2 burgery i 3 frytki', PIZZA_MENU);

        expect(result.items.length).toBe(2);
        expect(result.items.map((i) => i.quantity).sort()).toEqual([2, 3]);
    });

    it('nadal czyta ilosc z liczby stojacej przed nazwa dania', () => {
        const result = parseCompoundOrder('dodaj 3 frytki', PIZZA_MENU);

        expect(result.items.length).toBe(1);
        expect(result.items[0].quantity).toBe(3);
    });
});
