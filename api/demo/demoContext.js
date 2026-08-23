export const DEFAULT_DEMO_SCENARIO_ID = 'piekary-local';

export const DEMO_SCENARIOS = Object.freeze({
    'piekary-local': Object.freeze({
        id: 'piekary-local',
        city: 'Piekary Śląskie',
        audience: 'local',
        datasetId: 'piekary-v1',
        defaultLocale: 'pl',
        supportedLocales: Object.freeze(['pl', 'en']),
        isDemoExperience: true,
    }),
    'krakow-tourist': Object.freeze({
        id: 'krakow-tourist',
        city: 'Kraków',
        audience: 'tourist',
        datasetId: 'krakow-v1',
        defaultLocale: 'pl',
        supportedLocales: Object.freeze(['pl', 'en']),
        isDemoExperience: true,
    }),
});

export const DEMO_CONTEXT_SOURCES = Object.freeze(['default', 'launch', 'query', 'persisted']);

function demoContextError(message) {
    const error = new TypeError(message);
    error.statusCode = 400;
    return error;
}

export function resolveDemoContext(input = {}) {
    const scenarioId = input.scenarioId ?? input.scenario_id ?? DEFAULT_DEMO_SCENARIO_ID;
    const scenario = DEMO_SCENARIOS[scenarioId];

    if (!scenario) {
        throw demoContextError(`Unsupported demo scenario: ${String(scenarioId)}`);
    }

    const preferredLocale = input.preferredLocale ?? input.preferred_locale ?? scenario.defaultLocale;
    if (!scenario.supportedLocales.includes(preferredLocale)) {
        throw demoContextError(`Unsupported demo locale: ${String(preferredLocale)}`);
    }

    const source = input.source ?? 'default';
    if (!DEMO_CONTEXT_SOURCES.includes(source)) {
        throw demoContextError(`Unsupported demo context source: ${String(source)}`);
    }

    return Object.freeze({
        scenarioId: scenario.id,
        preferredLocale,
        source,
        city: scenario.city,
        audience: scenario.audience,
        datasetId: scenario.datasetId,
        isDemoExperience: scenario.isDemoExperience,
    });
}

export function extractDemoContext(requestBody = {}) {
    if (!requestBody || typeof requestBody !== 'object') return {};

    return requestBody.demo_context
        ?? requestBody.demoContext
        ?? requestBody.meta?.demo_context
        ?? requestBody.meta?.demoContext
        ?? {};
}

export function resolveDemoContextFromRequest(requestBody = {}) {
    return resolveDemoContext(extractDemoContext(requestBody));
}

export function buildDemoSessionPatch(context) {
    const resolved = resolveDemoContext(context);
    return {
        demoContext: resolved,
        demoScenarioId: resolved.scenarioId,
        demoDatasetId: resolved.datasetId,
        preferredLocale: resolved.preferredLocale,
    };
}

/**
 * Zasieg katalogu demo wynikajacy z SESJI — wspolne zrodlo prawdy dla wszystkich
 * miejsc, ktore pokazuja uzytkownikowi liste lokali.
 *
 * Powstalo w sesji 18h. Do tej pory ta logika istniala wylacznie jako prywatna
 * `resolveServiceProfile()` w `findHandler.js`, przez co `find_nearby` filtrowal
 * katalog, a `menu_request` (przez `getLocationFallback`) juz nie — i wymienial
 * z nazwy realne lokale bez zgody na publikacje (18g §K).
 *
 * UWAGA — dlaczego to NIE jest oparte o `FREEFLOW_DEMO_CATALOG_ONLY`: ta zmienna
 * nie jest ustawiona na zadnym srodowisku (sprawdzone `vercel env ls`, 2026-08-23).
 * Filtrowanie widoczne na produkcji bralo sie wylacznie stad — z kontekstu sesji.
 * Zapis w 18g „zmienna jest ustawiona" byl wnioskiem z obserwacji, nie odczytem.
 */
export function resolveDemoCatalogScope(session) {
    const hasExplicitDemoContext = Boolean(
        session?.demoScenarioId
        || session?.demoDatasetId
        || session?.demoContext
    );
    const scenarioId = session?.demoScenarioId
        || session?.demoContext?.scenarioId
        || DEFAULT_DEMO_SCENARIO_ID;
    const scenario = DEMO_SCENARIOS[scenarioId] || DEMO_SCENARIOS[DEFAULT_DEMO_SCENARIO_ID];

    return {
        hasExplicitDemoContext,
        scenarioId: scenario.id,
        datasetId: scenario.datasetId,
        scenario,
    };
}
