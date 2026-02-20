/**
 * Food Domain: Find Restaurants
 * Odpowiada za wyszukiwanie restauracji (SQL/Geo).
 * Refactored: Clean Architecture with Decision Matrix (City > GPS > Fallback)
 */

import { extractLocation, extractCuisineType } from '../../nlu/extractors.js';
import { pluralPl } from '../../utils/formatter.js';
import { calculateDistance } from '../../helpers.js';

// --- Configuration & Constants ---

const KNOWN_CITIES = ['Piekary Śląskie', 'Bytom', 'Radzionków', 'Chorzów', 'Katowice', 'Siemianowice Śląskie', 'Świerklaniec', 'Zabrze', 'Tarnowskie Góry', 'Świętochłowice', 'Mysłowice'];

const NEARBY_CITY_MAP = {
    'piekary śląskie': ['Bytom', 'Radzionków', 'Chorzów', 'Siemianowice Śląskie', 'Świerklaniec'],
    'bytom': ['Piekary Śląskie', 'Radzionków', 'Chorzów', 'Zabrze'],
    'radzionków': ['Piekary Śląskie', 'Bytom', 'Tarnowskie Góry'],
    'chorzów': ['Katowice', 'Bytom', 'Świętochłowice'],
    'katowice': ['Chorzów', 'Siemianowice Śląskie', 'Mysłowice'],
};

// --- Helper Functions (Pure Logic) ---

function normalizeLocation(loc) {
    if (!loc) return null;
    const l = loc.toLowerCase().trim();
    if (l.includes('piekar')) return 'Piekary Śląskie';
    if (l.includes('katow')) return 'Katowice';
    if (l.includes('bytom')) return 'Bytom';
    // Fallback for known cities check
    const knownMatch = KNOWN_CITIES.find(c => c.toLowerCase() === l);
    return knownMatch || loc; // Return original if no normalization match, specific handlers might fuzzy match later
}

function resolveDiscoveryMode(ctx) {
    const { text, session, entities, body } = ctx;

    // 1. Extract Parameters
    let rawLocation = entities?.location || extractLocation(text);
    // Explicit session fallback only if valid known city (prevents poison)
    if (!rawLocation && session?.last_location && KNOWN_CITIES.includes(session.last_location)) {
        rawLocation = session.last_location;
    }

    const cuisineType = entities?.cuisine || extractCuisineType(text);
    const normalizedLoc = normalizeLocation(rawLocation);
    const coords = (body && body.lat && body.lng) ? { lat: body.lat, lng: body.lng } : null;

    // 2. Determine Mode
    if (normalizedLoc) {
        return {
            mode: 'CITY',
            location: normalizedLoc,
            cuisine: cuisineType,
            originalLocation: rawLocation,
            coords
        };
    }

    if (coords) {
        return {
            mode: 'GPS',
            coords,
            cuisine: cuisineType
        };
    }

    // 3. Fallback Analysis (Implicit Order vs General)
    // Regex fix: \b doesn't work well with polish chars like 'ę' in standard JS regex without unicode flag.
    // Using (?:^|\s) ... (?:\s|$) pattern instead.
    const ORDER_VERBS_REGEX = /(?:^|\s)(zamawiam|zamow|zamów|poprosze|poprosz[ęe]|wezme|wezm[ęe]|biore|bior[ęe]|chce|chc[ęe]|chciał(bym|abym))(?:\s|$|[.,?!])/i;
    const isImplicitOrder = ORDER_VERBS_REGEX.test(text);
    const dishEntity = entities?.dish || (entities?.items && entities.items[0]?.name);

    return {
        mode: 'FALLBACK',
        isImplicitOrder,
        dishEntity
    };
}

function formatDiscoveryReply(result, modeParams) {
    const { restaurants, foundInNearby, nearbySourceCity } = result;
    const { location, cuisine } = modeParams; // modeParams mirrors the resolveDiscoveryMode output structure used during fetch

    const count = restaurants.length;
    const countTxt = pluralPl(count, 'miejsce', 'miejsca', 'miejsc');
    const limit = 3;
    const displayList = restaurants.slice(0, limit);

    // Format list items
    const listTxt = displayList.map((r, i) => {
        let extra = '';
        if (r.distance) {
            extra = r.distance < 1
                ? ` (${Math.round(r.distance * 1000)}m)`
                : ` (${r.distance.toFixed(1)}km)`;
        } else {
            extra = ` (${r.cuisine_type || 'Restauracja'})`;
        }
        return `${i + 1}. ${r.name}${extra}`;
    }).join('\n');

    let intro = '';

    if (foundInNearby) {
        intro = `W ${location} pusto, ale w pobliżu — w ${nearbySourceCity} — znalazłam ${count} ${countTxt}.\n\n`;
    } else if (modeParams.mode === 'GPS') {
        intro = cuisine
            ? `W pobliżu znalazłam ${count} ${countTxt} z kuchnią ${cuisine}:`
            : `W pobliżu znalazłam ${count} ${countTxt}:`;
    } else {
        intro = `Znalazłam ${count} ${countTxt} w ${location}:`;
    }

    const closing = "Którą wybierasz?";
    return `${intro}\n${listTxt}\n\n${closing}`;
}


export class FindRestaurantHandler {
    constructor(repository) {
        this.repo = repository;
    }

    async execute(ctx) {
        // 1. Resolve Mode & Context
        const discoveryParams = resolveDiscoveryMode(ctx);
        const { mode, location, cuisine, coords, isImplicitOrder, dishEntity } = discoveryParams;

        console.log(`🔎 Discovery Mode: ${mode}`, discoveryParams);

        // 2. Execute Strategy
        let restaurants = [];
        let foundInNearby = false;
        let nearbySourceCity = null;

        if (mode === 'CITY') {
            try {
                restaurants = await this.repo.searchRestaurants(location, cuisine);

                // Internal Fallback: Nearby Cities
                if (!restaurants || restaurants.length === 0) {
                    const normalizedKey = location.toLowerCase();
                    const suggestions = NEARBY_CITY_MAP[normalizedKey] || [];

                    for (const neighbor of suggestions) {
                        console.log(`🔎 Fallback: Checking ${neighbor}...`);
                        const neighborRest = await this.repo.searchRestaurants(neighbor, cuisine);
                        if (neighborRest && neighborRest.length > 0) {
                            restaurants = neighborRest;
                            foundInNearby = true;
                            nearbySourceCity = neighbor;
                            break; // Stop at first neighbor with results
                        }
                    }
                }
            } catch (error) {
                console.error('Repo Error (City):', error);
                return { reply: "Mam problem z bazą danych. Spróbuj później.", error: 'db_error' };
            }

            // Handle "Still No Results" for CITY mode
            if (!restaurants || restaurants.length === 0) {
                const cuisineMsg = cuisine ? ` serwujących ${cuisine}` : '';
                return {
                    reply: `Nie znalazłam żadnych restauracji w ${location}${cuisineMsg}. Może inna kuchnia?`,
                    contextUpdates: {
                        last_location: location,
                        pendingDish: dishEntity || ctx.session?.pendingDish || null
                    }
                };
            }

        } else if (mode === 'GPS') {
            try {
                // Radius: 10km default
                restaurants = await this.repo.searchNearby(coords.lat, coords.lng, 10, cuisine);
            } catch (error) {
                console.error('Repo Error (GPS):', error);
                return { reply: "Nie udało mi się pobrać lokalizacji.", error: 'db_error' };
            }

            if (!restaurants || restaurants.length === 0) {
                return {
                    reply: cuisine
                        ? `Nie widzę restauracji ${cuisine} w Twojej okolicy.`
                        : "Nie widzę żadnych restauracji w pobliżu.",
                    contextUpdates: {}
                };
            }

        } else {
            // FALLBACK MODE
            const prompt = (isImplicitOrder && dishEntity)
                ? `Chętnie przyjmę zamówienie ${dishEntity}, ale najpierw podaj miasto. Gdzie szukamy?`
                : "Gdzie mam szukać? Podaj miasto lub powiedz 'w pobliżu'.";

            return {
                reply: prompt,
                contextUpdates: {
                    expectedContext: 'find_nearby_ask_location',
                    awaiting: 'location',
                    pendingDish: dishEntity || null
                }
            };
        }

        // --- ENRICH RESULTS WITH DISTANCE (Cross-cutting concern) ---
        if (coords && restaurants && restaurants.length > 0) {
            restaurants = restaurants.map(r => {
                if (r.lat && r.lng) {
                    // Calculate distance if missing (City Mode usually misses it)
                    if (r.distance === undefined) {
                        // Coords are from body (user location)
                        const dist = calculateDistance(coords.lat, coords.lng, r.lat, r.lng);
                        return { ...r, distance: dist };
                    }
                }
                return r;
            });
        }

        // 3. Format Response (Standard Success Path)
        const resultData = { restaurants, foundInNearby, nearbySourceCity };
        const reply = formatDiscoveryReply(resultData, discoveryParams);

        // Smart Context Hint for Frontend
        const suggestedRestaurants = restaurants.map((r, idx) => ({
            id: r.id, name: r.name, index: idx + 1, city: r.city
        }));

        // Determine resolved location for session
        const finalLocation = nearbySourceCity || location || (mode === 'GPS' ? 'GPS' : null);

        return {
            reply,
            closing_question: "Którą wybierasz?",
            restaurants: restaurants,
            menuItems: [],
            contextUpdates: {
                last_location: finalLocation !== 'GPS' ? finalLocation : null, // Don't save "GPS" string as city
                last_restaurants_list: restaurants,
                lastRestaurants: suggestedRestaurants,
                expectedContext: 'select_restaurant',
                awaiting: null,
                pendingDish: dishEntity || ctx.entities?.pendingDish || null
            }
        };
    }
}
