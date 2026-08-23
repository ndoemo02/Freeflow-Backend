import { describe, expect, it } from 'vitest';

import { buildLocationFallbackMessage } from '../locationService.js';
import { resolveDemoCatalogScope } from '../../demo/demoContext.js';

/**
 * Sesja 18g, punkt K: `menu_request` wypisywal z nazwy REALNE restauracje
 * o `publication_status='private'`, ktore nie wyrazily zgody na publikacje (§8).
 *
 * Wiersze ponizej sa skopiowane z nowej bazy, a nie zmyslone — §9 CLAUDE.md:
 * fixture ma miec ksztalt realnego wiersza, inaczej utrwala ksztalt,
 * ktorego zywa baza nie ma.
 */
const PIEKARY_ROWS = [
    { id: '72c76694-f533-46b8-b831-1965210a0cb4', name: 'Kebs & Roll', city: 'Piekary Śląskie', publication_status: 'demo_fictional', cuisine_type: 'Kebab / Street food' },
    { id: '6cce66fb-4d2d-402f-abe5-22e9784d559c', name: 'Ruszt i Ogień', city: 'Piekary Śląskie', publication_status: 'demo_fictional', cuisine_type: 'Grill / Steakhouse' },
    { id: 'acced74f-ddac-43a0-9f78-016c397f4b8e', name: 'Silesiana Italiana', city: 'Piekary Śląskie', publication_status: 'demo_fictional', cuisine_type: 'Włoska / Śląska fusion' },
    { id: '4ad6b301-671b-4343-bf91-9bab7cda37b4', name: 'Śląski Szynk', city: 'Piekary Śląskie', publication_status: 'demo_fictional', cuisine_type: 'Nowoczesna kuchnia śląska' },
    { id: 'a2be7ddb-d1dd-49d6-9026-57ecd4c94d60', name: 'Syto po Naszymu', city: 'Piekary Śląskie', publication_status: 'demo_fictional', cuisine_type: 'Polska domowa' },
    { id: '8b00b05e-72f7-4a5f-b50c-5630a75d6312', name: 'Bar Praha', city: 'Piekary Śląskie', publication_status: 'private', cuisine_type: 'Czeska / Polska' },
    { id: '222d1e64-5d87-4f78-a0ca-f92da4f76d65', name: 'LAWASZ KEBAB', city: 'Piekary Śląskie', publication_status: 'private', cuisine_type: 'Kebab' },
    { id: '83566974-1017-4408-90ee-2571ccc06978', name: 'Pizzeria Monte Carlo', city: 'Piekary Śląskie', publication_status: 'private', cuisine_type: null },
    { id: '1fc1e782-bac6-47b2-978a-f6f2b38000cd', name: 'Restauracja Stara Kamienica', city: 'Piekary Śląskie', publication_status: 'private', cuisine_type: 'Polska' },
    { id: '4d27fbe3-20d0-4eb4-b003-1935be53af25', name: 'Rezydencja Luxury Hotel', city: 'Piekary Śląskie', publication_status: 'private', cuisine_type: 'Międzynarodowa' }
];

/**
 * DOSLOWNY szablon, ktory podaje `menuHandler.js` — skopiowany z wywolania,
 * nie wymyslony. Zwrocic uwage: **nie ma w nim `{count}`**.
 */
const TEMPLATE = 'Najpierw wybierz restauracje w {location}, a potem pokaze menu:\n{list}\n\nKtora Cie interesuje?';

/**
 * Szablon z licznikiem. `buildLocationFallbackMessage` obsluguje `{count}`, ale
 * ZADEN dzisiejszy wolajacy go nie uzywa — pokrycie jest defensywne, na wypadek
 * dodania licznika do tresci. Trzymane osobno, zeby nie udawac, ze produkcyjny
 * komunikat ma pole, ktorego nie ma.
 */
const TEMPLATE_WITH_COUNT = 'W {location} mam {count} miejsc:\n{list}';

/** Nazwy, ktore w sesji 18g wyciekly na ekran i do TTS. */
const LEAKED_REAL_NAMES = [
    'Pizzeria Monte Carlo',
    'LAWASZ KEBAB',
    'Bar Praha',
    'Rezydencja Luxury Hotel',
    'Restauracja Stara Kamienica'
];

const demoScope = { demoOnly: true, datasetId: 'piekary-v1' };

const listedLines = (message) => message.split('\n').filter((line) => /^\d+\.\s/.test(line));

describe('getLocationFallback — filtr katalogu demo (P0 z sesji 18g)', () => {
    it('nie wymienia z nazwy zadnej realnej restauracji w kontekscie demo', () => {
        const message = buildLocationFallbackMessage(
            PIEKARY_ROWS, 'Piekary Śląskie', TEMPLATE, demoScope
        );

        for (const name of LEAKED_REAL_NAMES) {
            expect(message).not.toContain(name);
        }
    });

    it('wypisuje wylacznie lokale fikcyjne', () => {
        const message = buildLocationFallbackMessage(
            PIEKARY_ROWS, 'Piekary Śląskie', TEMPLATE, demoScope
        );

        expect(message).toContain('Silesiana Italiana');
        expect(message).toContain('Śląski Szynk');
        expect(listedLines(message)).toHaveLength(5);
    });

    it('numeruje pozycje po kolei od 1 po odfiltrowaniu', () => {
        const message = buildLocationFallbackMessage(
            PIEKARY_ROWS, 'Piekary Śląskie', TEMPLATE, demoScope
        );

        expect(message).toContain('1. Kebs & Roll');
        expect(message).toContain('5. Syto po Naszymu');
    });

    it('zachowuje reszte szablonu, nie tylko liste', () => {
        const message = buildLocationFallbackMessage(
            PIEKARY_ROWS, 'Piekary Śląskie', TEMPLATE, demoScope
        );

        expect(message).toContain('Najpierw wybierz restauracje w Piekary Śląskie');
        expect(message).toContain('Ktora Cie interesuje?');
    });

    it('zwraca null, gdy po filtrze nie zostaje nic do pokazania', () => {
        const onlyPrivate = PIEKARY_ROWS.filter((r) => r.publication_status === 'private');

        expect(buildLocationFallbackMessage(
            onlyPrivate, 'Piekary Śląskie', TEMPLATE, demoScope
        )).toBeNull();
    });

    it('poza kontekstem demo zachowuje sie jak dotad — nie tnie listy', () => {
        const message = buildLocationFallbackMessage(
            PIEKARY_ROWS, 'Piekary Śląskie', TEMPLATE, { demoOnly: false, datasetId: null }
        );

        expect(message).toContain('Bar Praha');
        expect(listedLines(message)).toHaveLength(10);
    });

    it('izoluje katalogi po datasetId — Piekary nie pokazuja sie w scenariuszu krakowskim', () => {
        const message = buildLocationFallbackMessage(
            PIEKARY_ROWS, 'Piekary Śląskie', TEMPLATE, { demoOnly: true, datasetId: 'krakow-v1' }
        );

        expect(message).toBeNull();
    });

    it('gdy szablon ma {count}, licznik idzie z listy PO filtrze', () => {
        // Defensywnie: dzisiejszy szablon nie ma tego pola, ale kod je podstawia.
        // Przed naprawa licznik czytal surowa liste, wiec komunikat mowilby „10"
        // i wypisal 5 pozycji — zdradzajac istnienie ukrytych lokali.
        const message = buildLocationFallbackMessage(
            PIEKARY_ROWS, 'Piekary Śląskie', TEMPLATE_WITH_COUNT, demoScope
        );

        expect(message).toContain('mam 5 miejsc');
        expect(message).not.toContain('mam 10 miejsc');
        expect(listedLines(message)).toHaveLength(5);
    });
});

describe('resolveDemoCatalogScope — wspolny predykat kontekstu demo', () => {
    it('rozpoznaje sesje demo po demoScenarioId i podaje jej datasetId', () => {
        // Ksztalt wziety z `brain_sessions` dla sesji sondujacych z 18g.
        const scope = resolveDemoCatalogScope({
            demoScenarioId: 'piekary-local',
            demoDatasetId: 'piekary-v1',
            demoContext: { scenarioId: 'piekary-local', datasetId: 'piekary-v1' }
        });

        expect(scope.hasExplicitDemoContext).toBe(true);
        expect(scope.datasetId).toBe('piekary-v1');
    });

    it('rozpoznaje sesje demo takze po samym demoContext', () => {
        const scope = resolveDemoCatalogScope({
            demoContext: { scenarioId: 'krakow-tourist' }
        });

        expect(scope.hasExplicitDemoContext).toBe(true);
        expect(scope.datasetId).toBe('krakow-v1');
    });

    it('sesja bez kontekstu demo nie jest traktowana jak demo', () => {
        expect(resolveDemoCatalogScope({}).hasExplicitDemoContext).toBe(false);
        expect(resolveDemoCatalogScope(null).hasExplicitDemoContext).toBe(false);
        expect(resolveDemoCatalogScope(undefined).hasExplicitDemoContext).toBe(false);
    });

    it('nieznany scenariusz schodzi na domyslny zamiast wysypywac sie', () => {
        const scope = resolveDemoCatalogScope({ demoScenarioId: 'nie-istnieje' });

        expect(scope.hasExplicitDemoContext).toBe(true);
        expect(scope.datasetId).toBe('piekary-v1');
    });
});
