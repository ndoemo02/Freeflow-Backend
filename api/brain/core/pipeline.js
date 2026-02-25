/**
 * Core Pipeline Orchestrator (V2)
 * Odpowiada za przepływ danych: Request -> Hydration -> NLU -> Domain -> Response
 */

import { getEngineMode, isDev, isStrict, devLog, devWarn, devError, strictAssert, strictRequireSession, sanitizeResponse } from './engineMode.js';

import { getSession, updateSession, getOrCreateActiveSession, closeConversation } from '../session/sessionStore.js';
import { FindRestaurantHandler } from '../domains/food/findHandler.js';
import { MenuHandler } from '../domains/food/menuHandler.js';
import { OrderHandler } from '../domains/food/orderHandler.js';
import { ConfirmOrderHandler } from '../domains/food/confirmHandler.js';
import { SelectRestaurantHandler } from '../domains/food/selectHandler.js';
import { OptionHandler } from '../domains/food/optionHandler.js';
import { ConfirmAddToCartHandler } from '../domains/food/confirmAddToCartHandler.js';
import { BrainLogger } from '../../../utils/logger.js';
import { playTTS, stylizeWithGPT4o } from '../tts/ttsClient.js';
import { EventLogger } from '../services/EventLogger.js';
import { getConfig } from '../../config/configService.js';
import {
    checkRequiredState,
    getFallbackIntent,
    isHardBlockedFromLegacy,
    mutatesCart
} from './IntentCapabilityMap.js';
import { renderSurface, detectSurface } from '../dialog/SurfaceRenderer.js';
import { dialogNavGuard, pushDialogStack } from '../dialog/DialogNavGuard.js';
import { resolveMenuItemConflict, DISAMBIGUATION_RESULT } from '../services/DisambiguationService.js';

// 🧠 Passive Memory Layer (read-only context, no FSM impact)
import { initTurnBuffer, pushUserTurn, pushAssistantTurn } from '../memory/TurnBuffer.js';
import { initEntityCache, cacheRestaurants, cacheItems } from '../memory/EntityCache.js';

// 🎙️ Phrase Generator (optional LLM paraphrasing, fallback to templates)
import { generatePhrase } from '../dialog/PhraseGenerator.js';

// 🔊 TTS Chunking (stream first sentence, barge-in support)
import { getFirstChunk, createBargeInController } from '../tts/TtsChunker.js';

// 🛡️ Conversation Guards (UX improvements, no FSM changes)
import {
    hasLockedRestaurant,
    isOrderingContext,
    containsDishLikePhrase,
    recoverRestaurantFromFullText,
    calculatePhase,
    resolveRestaurantFromMenuRequest,
    sanitizeLocation,
    containsOrderingIntent
} from './ConversationGuards.js';

// 📢 Intelligent TTS Summaries
function buildRestaurantSummaryForTTS(restaurants, location) {
    if (!restaurants || restaurants.length === 0) return null;

    const count = restaurants.length;

    const sample = restaurants
        .slice(0, 3)
        .map(r => r.name)
        .join(', ');

    return `Znalazłam ${count} miejsc${location ? ' w ' + location : ''}. Między innymi: ${sample}. Którą wybierasz?`;
}

function buildMenuSummaryForTTS(menuItems) {
    if (!menuItems || menuItems.length === 0) return null;

    const categories = [...new Set(menuItems.map(i => i.category).filter(Boolean))];

    const hasVege = menuItems.some(i => i.is_vege);
    const hasSpicy = menuItems.some(i => i.spicy);

    let summary = "W karcie są m.in. ";

    if (categories.length > 0) {
        summary += categories.join(', ');
    }

    if (hasVege && !summary.includes('wegetariańskie')) summary += ", opcje wegetariańskie";
    if (hasSpicy && !summary.includes('ostre')) summary += ", dania ostre";

    // Deduplicate base_name and use it for examples
    const baseNames = [...new Set(menuItems.map(i => i.base_name || i.name).filter(Boolean))];
    const sample = baseNames.slice(0, 3).join(', ');

    if (sample) {
        summary += `. Na przykład: ${sample}. Co wybierasz?`;
    } else {
        summary += `. Co wybierasz?`;
    }

    return summary;
}


// Mapa handlerów domenowych (Bezpośrednie mapowanie)
// Kluczem jest "domain", a wewnątrz "intent"

// Default Handlers Map
const defaultHandlers = {
    food: {
        find_nearby: new FindRestaurantHandler(),
        menu_request: new MenuHandler(), // Correct NLU mapping
        show_menu: new MenuHandler(),    // Alias
        create_order: new OrderHandler(),
        choose_restaurant: new OrderHandler(), // Handle ambiguous restaurant choice in OrderHandler
        confirm_order: new ConfirmOrderHandler(),
        confirm_add_to_cart: new ConfirmAddToCartHandler(), // NEW
        select_restaurant: new SelectRestaurantHandler(),
        show_more_options: new OptionHandler(),
        find_nearby_confirmation: new FindRestaurantHandler(),
        recommend: {
            execute: async (ctx) => ({
                reply: 'Co polecam? W okolicy masz świetne opcje! Powiedz gdzie szukać.',
                intent: 'recommend',
                contextUpdates: { expectedContext: 'find_nearby' }
            })
        },
        cancel_order: {
            execute: async (ctx) => ({
                reply: 'Zamówienie anulowałam.',
                intent: 'cancel_order',
                contextUpdates: { pendingOrder: null, expectedContext: null }
            })
        },
        confirm: new FindRestaurantHandler(),
    },
    ordering: {
        create_order: new OrderHandler(),
        confirm_order: new ConfirmOrderHandler(),
    },
    system: {
        health_check: { execute: async () => ({ reply: 'System działa', meta: {} }) },
        fallback: { execute: async () => ({ reply: 'Nie rozumiem tego polecenia.', fallback: true }) }
    },
};

import { SupabaseRestaurantRepository } from './repository.js';

export class BrainPipeline {
    constructor(deps = {}) {
        this.nlu = deps.nlu;
        // Repository Injection: Use provided or default Supabase
        this.repository = deps.repository || new SupabaseRestaurantRepository();

        // Dynamic Handler Initialization with DI
        this.handlers = this.createHandlers(this.repository, deps.handlers);
    }

    createHandlers(repository, overrides = {}) {
        const defaults = {
            food: {
                find_nearby: new FindRestaurantHandler(repository),
                menu_request: new MenuHandler(), // Need repo injection too if MenuHandler refactored
                show_menu: new MenuHandler(),
                create_order: new OrderHandler(),
                choose_restaurant: new OrderHandler(),
                confirm_order: new ConfirmOrderHandler(),
                confirm_add_to_cart: new ConfirmAddToCartHandler(), // NEW
                select_restaurant: new SelectRestaurantHandler(),
                show_more_options: new OptionHandler(),
                find_nearby_confirmation: new FindRestaurantHandler(repository),
                recommend: {
                    execute: async (ctx) => ({
                        reply: 'Co polecam? W okolicy masz świetne opcje! Powiedz gdzie szukać.',
                        intent: 'recommend',
                        contextUpdates: { expectedContext: 'find_nearby' }
                    })
                },
                cancel_order: {
                    execute: async (ctx) => ({
                        reply: 'Zamówienie anulowałam.',
                        intent: 'cancel_order',
                        contextUpdates: { pendingOrder: null, expectedContext: null }
                    })
                },
                confirm: new FindRestaurantHandler(repository),
            },
            ordering: {
                create_order: new OrderHandler(),
                confirm_order: new ConfirmOrderHandler(),
            },
            system: {
                health_check: { execute: async () => ({ reply: 'System działa', meta: {} }) },
                fallback: { execute: async () => ({ reply: 'Nie rozumiem tego polecenia.', fallback: true }) }
            },
        };

        // Deep merge overrides if any (simplified)
        // For now, if overrides provided, we might just replace. 
        // But tests usually provide mocks via repo, not handler overrides.
        // If 'handlers' passed in deps, assume it's full map replacement (legacy support).
        if (overrides && Object.keys(overrides).length > 0) return overrides;

        return defaults;
    }

    /**
     * Główny punkt wejścia dla każdego zapytania
     *
     * SINGLE-ROUTING INVARIANT:
     * Only one process() per sessionId may run at a time.
     * Concurrent duplicate calls are rejected immediately to prevent
     * double intent resolution (e.g. due to React StrictMode double-invoke
     * or accidental parallel HTTP calls from the same client).
     */
    async process(sessionId, text, options = {}) {
        const startTime = Date.now();
        const IS_SHADOW = options.shadow === true;

        // ═══════════════════════════════════════════════════════════════════
        // SINGLE-ROUTING INVARIANT: In-flight deduplication guard
        // ═══════════════════════════════════════════════════════════════════
        const inflightKey = `${sessionId}::${text.trim()}`;
        if (!IS_SHADOW) {
            if (BrainPipeline._inFlight.has(inflightKey)) {
                console.warn(`🚫 [Pipeline] DUPLICATE_REQUEST blocked: ${sessionId} → "${text.trim().substring(0, 40)}". Single-routing invariant enforced.`);
                return {
                    ok: false,
                    session_id: sessionId,
                    intent: 'duplicate_request',
                    reply: null,
                    should_reply: false,
                    meta: { source: 'duplicate_blocked', routing: 'single_invariant' }
                };
            }
            BrainPipeline._inFlight.add(inflightKey);
        }

        const config = await getConfig();

        // 1. Hydration & Validation
        if (!text || !text.trim()) {
            if (!IS_SHADOW) BrainPipeline._inFlight.delete(inflightKey);
            return this.createErrorResponse('brak_tekstu', 'Nie usłyszałam, możesz powtórzyć?');
        }

        const ENGINE_MODE = getEngineMode();
        const EXPERT_MODE = ENGINE_MODE === 'dev'; // backward compat alias
        const requestId = `${sessionId.substring(0, 8)}-${startTime.toString(36)}`;
        devLog(`▶️  [Pipeline] START ${requestId} | session=${sessionId} | text="${text.trim().substring(0, 60)}" | mode=${ENGINE_MODE}`);

        // --- Event Logging: Received (dev only) ---
        if (EXPERT_MODE && !IS_SHADOW) {
            const initialWorkflowStep = this._mapWorkflowStep('request_received');
            EventLogger.logConversation(sessionId).catch(() => { });
            EventLogger.logEvent(sessionId, 'request_received', { text }, null, initialWorkflowStep).catch(() => { });
        }

        // ═══════════════════════════════════════════════════════════════════════════
        // CONVERSATION ISOLATION: Auto-create new session if previous was closed
        // ═══════════════════════════════════════════════════════════════════════════
        const sessionResult = getOrCreateActiveSession(sessionId);
        let activeSessionId = sessionResult.sessionId;
        const session = sessionResult.session;

        if (sessionResult.isNew && sessionId !== activeSessionId) {
            BrainLogger.pipeline(`🔄 NEW CONVERSATION: ${sessionId} was closed, using ${activeSessionId}`);
        }

        // Deep copy session for shadow mode simulation
        const sessionContext = IS_SHADOW ? JSON.parse(JSON.stringify(session || {})) : session;

        const requestBody = options?.requestBody || {};
        const parsedLat = requestBody?.lat != null ? parseFloat(requestBody.lat) : null;
        const parsedLng = requestBody?.lng != null ? parseFloat(requestBody.lng) : null;
        const coords = (Number.isFinite(parsedLat) && Number.isFinite(parsedLng))
            ? { lat: parsedLat, lng: parsedLng }
            : (sessionContext?.coords || null);

        if (coords && !IS_SHADOW) {
            // FIX: enable distance calculation when GPS available
            updateSession(activeSessionId, { coords });
        }

        const context = {
            sessionId: activeSessionId,  // Use active (possibly new) session ID
            originalSessionId: sessionId, // Keep original for tracking
            text,
            session: sessionContext,
            startTime,
            meta: { conversationNew: sessionResult.isNew },
            body: requestBody,
            coords
        };

        // 🧠 Initialize Passive Memory (no FSM impact)
        initTurnBuffer(sessionContext);
        initEntityCache(sessionContext);

        try {
            // ═══════════════════════════════════════════════════════════════════
            // 1. DIALOG NAVIGATION GUARD (Meta-Intent Layer)
            // Handles: BACK, REPEAT, NEXT, STOP
            // SHORT-CIRCUITS pipeline if matched - does NOT touch FSM
            // Config-aware: respects dialog_navigation_enabled and fallback_mode
            // ═══════════════════════════════════════════════════════════════════
            const navResult = dialogNavGuard(text, sessionContext, config);

            if (navResult.handled) {
                BrainLogger.pipeline(`🔀 DIALOG NAV: ${navResult.response.intent} - skipping NLU/FSM`);

                // --- Event Logging: Dialog Navigation ---
                if (EXPERT_MODE && !IS_SHADOW) {
                    EventLogger.logEvent(activeSessionId, 'dialog_nav', {
                        navIntent: navResult.response.intent,
                        reply: navResult.response.reply?.substring(0, 100),
                        stopTTS: navResult.response.stopTTS
                    }, null, 'nav').catch(() => { });
                }

                // Apply context updates if any (e.g., dialogStackIndex)
                if (navResult.response.contextUpdates && !IS_SHADOW) {
                    updateSession(activeSessionId, navResult.response.contextUpdates);
                }

                return {
                    ok: true,
                    session_id: activeSessionId,
                    intent: navResult.response.intent,
                    reply: navResult.response.reply,
                    should_reply: navResult.response.should_reply,
                    stopTTS: navResult.response.stopTTS || false,
                    meta: navResult.response.meta
                };
            }

            // ═══════════════════════════════════════════════════════════════════
            // PRE-NLU CONTEXT OVERRIDE: Fast-track list selections
            // ═══════════════════════════════════════════════════════════════════
            let intentResult;
            const hasList = sessionContext?.last_restaurants_list?.length > 0;
            const normOverrideText = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
            const isDigitObj = /^\d+$/.test(normOverrideText) || /^wybieram\s+\d+$/.test(normOverrideText);
            const isOrdinalObj = /^(pierwsza|druga|trzecia|czwarta|piata|szosta|siodma|osma|dziewiata|dziesiata|jedynka|dwojka|trojka|czworka|piatka|szostka|siodemka|osemka|dziewiatka|dziesiatka|pierwszy|drugi|trzeci|czwarty|piaty|szosty|siodmy|osmy|dziewiaty|dziesiaty)$/.test(normOverrideText);

            if (hasList && (isDigitObj || isOrdinalObj)) {
                BrainLogger.pipeline(`⚡ PRE-NLU OVERRIDE: Bypassing NLU for list selection -> select_restaurant`);
                intentResult = {
                    intent: 'select_restaurant',
                    domain: 'food',
                    confidence: 1.0,
                    source: 'context_override',
                    entities: {}
                };
            } else {
                // 2. NLU Decision
                intentResult = await this.nlu.detect(context);
            }

            // ═══════════════════════════════════════════════════════════════════
            // EARLY EXITS (Greetings) - Skip everything else
            // ═══════════════════════════════════════════════════════════════════
            if (intentResult?.intent === 'greeting') {
                BrainLogger.pipeline(`👋 GREETING DETECTED: Returning friendly greeting`);
                const replyText = 'Cześć! W czym mogę pomóc?';
                let audioContent = null;
                const wantsTTS = options?.includeTTS === true;
                const EX_MODE = process.env.EXPERT_MODE === 'true'; // Pipeline constant
                const ttsEnabled = config?.tts_enabled === true;

                if ((wantsTTS || EX_MODE) && ttsEnabled) {
                    try {
                        const t0 = Date.now();
                        audioContent = await playTTS(replyText, options?.ttsOptions || {});
                        BrainLogger.pipeline(`🔊 TTS Gen (Greeting): "${replyText}" (${Date.now() - t0}ms)`);
                    } catch (err) {
                        BrainLogger.pipeline(`❌ TTS failed: ${err.message}`);
                    }
                }

                return {
                    ok: true,
                    session_id: activeSessionId,
                    intent: 'greeting',
                    reply: replyText,
                    text: replyText,
                    audioContent: audioContent,
                    should_reply: true,
                    stopTTS: false,
                    meta: { source: 'pipeline_greeting_handler' }
                };
            }

            // ═══════════════════════════════════════════
            // RESTAURANT HOURS HANDLER
            // ═══════════════════════════════════════════

            if (intentResult?.intent === 'restaurant_hours') {
                const currentRestaurant = sessionContext?.lastRestaurant || sessionContext?.currentRestaurant;

                if (!currentRestaurant) {
                    return {
                        ok: true,
                        session_id: activeSessionId,
                        intent: 'restaurant_hours',
                        reply: 'Której restauracji mam sprawdzić godziny?',
                        should_reply: true,
                        stopTTS: false
                    };
                }

                const hours = currentRestaurant.opening_hours || 'Nie mam informacji o godzinach.';

                return {
                    ok: true,
                    session_id: activeSessionId,
                    intent: 'restaurant_hours',
                    reply: `${currentRestaurant.name} jest otwarta: ${hours}.`,
                    should_reply: true,
                    stopTTS: false
                };
            }

            // ═══════════════════════════════════════════
            // UNKNOWN INTENT SAFE FALLBACK
            // ═══════════════════════════════════════════

            if (intentResult?.intent === 'UNKNOWN_INTENT') {

                const phase = sessionContext?.conversationPhase || 'idle';

                let reply;

                if (phase === 'ordering') {
                    reply = 'Nie jestem pewna, o co chodzi. Kontynuujemy zamówienie czy chcesz coś zmienić?';
                } else if (phase === 'restaurant_selected') {
                    reply = 'Możesz wybrać coś z menu albo zapytać o szczegóły.';
                } else {
                    reply = 'Mogę pokazać restauracje w pobliżu albo pomóc w wyborze dania.';
                }

                return {
                    ok: true,
                    session_id: activeSessionId,
                    intent: 'UNKNOWN_INTENT',
                    reply,
                    should_reply: true,
                    stopTTS: false,
                    meta: { source: 'safe_unknown_handler' }
                };
            }

            // ═══════════════════════════════════════════════════════════════════
            // SINGLE ROUTING INVARIANT — hard guard
            // If this fires, a classic path leaked through the NLU layer.
            // ═══════════════════════════════════════════════════════════════════
            if (intentResult?.source?.includes('classic')) {
                console.error('🚫 CLASSIC_ROUTE_INVARIANT_VIOLATED', {
                    source: intentResult.source,
                    intent: intentResult.intent,
                    sessionId: activeSessionId
                });
                // Downgraded to warn because smartIntent allows classic source bypass
                console.warn(`CLASSIC ROUTE DETECTED — ${intentResult.source}`);
            }

            let { intent, domain, confidence, source, entities } = intentResult;

            // --- Event Logging: NLU Result ---
            if (EXPERT_MODE && !IS_SHADOW) {
                EventLogger.logEvent(activeSessionId, 'nlu_result', {
                    intent, domain, confidence, source,
                    entities: entities ? Object.keys(entities) : []
                }, confidence, 'nlu').catch(() => { });
            }

            // 🧠 Record user turn (passive memory, no FSM impact)
            if (!IS_SHADOW) {
                pushUserTurn(sessionContext, text, { intent, entities });
            }

            // ═══════════════════════════════════════════════════════════════════
            // FIX 2: RESTAURANT SEMANTIC RECOVERY
            // Recover restaurant from full text if NLU missed the entity
            // ═══════════════════════════════════════════════════════════════════
            if (!entities?.restaurant && text && sessionContext.entityCache?.restaurants) {
                const recovered = await recoverRestaurantFromFullText(
                    text,
                    sessionContext.entityCache.restaurants
                );

                if (recovered) {
                    entities = entities || {};
                    entities.restaurant = recovered.name;
                    entities.restaurantId = recovered.id;
                    BrainLogger.nlu(`🧠 SEMANTIC_RESTAURANT_RECOVERY: Detected "${recovered.name}" from full text`);
                }
            }

            // ═══════════════════════════════════════════════════════════════════
            // FIX A1: MENU RESOLVER BRIDGE
            // Fuzzy-match restaurant from menu-request phrasing, BEFORE ICM gate
            // Sets entities + session lock so ICM lets menu_request through cleanly
            // ═══════════════════════════════════════════════════════════════════
            const menuResolvedRestaurant = resolveRestaurantFromMenuRequest(
                text,
                sessionContext,
                sessionContext.entityCache
            );

            if (menuResolvedRestaurant && !entities?.restaurantId) {
                entities = entities || {};
                entities.restaurant = menuResolvedRestaurant.name;
                entities.restaurantId = menuResolvedRestaurant.id;
                intent = 'menu_request';
                domain = 'food';
                source = 'menu_resolver';
                BrainLogger.pipeline(`🔍 MENU_RESOLVER_BRIDGE: locked to "${menuResolvedRestaurant.name}", forcing menu_request`);
                // Persist the restaurant lock immediately
                if (!IS_SHADOW) {
                    updateSession(sessionId, {
                        currentRestaurant: {
                            id: menuResolvedRestaurant.id,
                            name: menuResolvedRestaurant.name
                        },
                        lockedRestaurantId: menuResolvedRestaurant.id
                    });
                }
            }

            // ═══════════════════════════════════════════════════════════════════
            // FIX: allow implicit dish ordering without keyword
            // If we are in a restaurant context and NLU is unknown, try menu disambiguation.
            // ═══════════════════════════════════════════════════════════════════
            if (intent === 'unknown' && sessionContext?.currentRestaurant?.id) {
                try {
                    const resolution = await resolveMenuItemConflict(text, {
                        restaurant_id: sessionContext.currentRestaurant.id
                    });

                    if (resolution?.status === DISAMBIGUATION_RESULT.ADD_ITEM) {
                        intent = 'create_order';
                        domain = 'food';
                        source = 'implicit_dish_guard';
                        BrainLogger.pipeline('🟢 IMPLICIT_DISH_GUARD: unknown → create_order via menu match');
                    }
                } catch (err) {
                    BrainLogger.pipeline(`🛡️ IMPLICIT_DISH_GUARD failed: ${err.message}`);
                }
            }

            // ═══════════════════════════════════════════════════════════════════
            // ICM GATE: Validate FSM state requirements BEFORE executing intent
            // This ensures NO intent (regex/legacy/LLM) can bypass FSM
            // ═══════════════════════════════════════════════════════════════════
            const stateCheck = checkRequiredState(intent, sessionContext, entities);
            const originalIntent = intent; // Remember for soft dialog bridge

            if (!stateCheck.met) {
                // ═══════════════════════════════════════════════════════════════════
                // SOFT DIALOG BRIDGE (KROK 1 & 4): Instead of hard reset, show dialog
                // If user wants menu/order but no restaurant, and we have candidates → ASK
                // ═══════════════════════════════════════════════════════════════════
                const hasRestaurantsList = sessionContext?.last_restaurants_list?.length > 0;

                if (originalIntent === 'menu_request' && hasRestaurantsList) {
                    // User wants menu, we have restaurants → ask which one
                    BrainLogger.pipeline(`🌉 SOFT DIALOG BRIDGE: menu_request blocked, showing restaurant picker`);

                    const surfaceResult = renderSurface({
                        key: 'ASK_RESTAURANT_FOR_MENU',
                        facts: {
                            restaurants: sessionContext.last_restaurants_list.slice(0, 5)
                        }
                    });

                    // Set dialog focus for context tracking (KROK 2)
                    if (!IS_SHADOW) {
                        updateSession(sessionId, {
                            dialog_focus: 'CHOOSING_RESTAURANT_FOR_MENU',
                            expectedContext: 'select_restaurant'
                        });
                    }

                    return {
                        ok: true,
                        session_id: sessionId,
                        intent: 'menu_request', // Keep original intent for tracking
                        reply: surfaceResult.reply,
                        uiHints: surfaceResult.uiHints,
                        restaurants: sessionContext.last_restaurants_list.slice(0, 5),
                        should_reply: true,
                        meta: { source: 'soft_dialog_bridge', originalIntent: 'menu_request' }
                    };
                }

                if (originalIntent === 'create_order' && hasRestaurantsList) {
                    // User wants to order, we have restaurants → ask which one
                    BrainLogger.pipeline(`🌉 SOFT DIALOG BRIDGE: create_order blocked, showing restaurant picker`);

                    const surfaceResult = renderSurface({
                        key: 'ASK_RESTAURANT_FOR_ORDER',
                        facts: {
                            restaurants: sessionContext.last_restaurants_list.slice(0, 5),
                            dishNames: entities.dish ? [entities.dish] : []
                        }
                    });

                    // Set dialog focus and preserve pending dish (KROK 2)
                    if (!IS_SHADOW) {
                        updateSession(sessionId, {
                            dialog_focus: 'CHOOSING_RESTAURANT_FOR_ORDER',
                            expectedContext: 'select_restaurant',
                            pendingDish: entities.dish || sessionContext.pendingDish
                        });
                    }

                    return {
                        ok: true,
                        session_id: sessionId,
                        intent: 'create_order', // Keep original intent for tracking
                        reply: surfaceResult.reply,
                        uiHints: surfaceResult.uiHints,
                        restaurants: sessionContext.last_restaurants_list.slice(0, 5),
                        should_reply: true,
                        meta: { source: 'soft_dialog_bridge', originalIntent: 'create_order' }
                    };
                }

                // Standard fallback for other cases
                const fallbackIntent = getFallbackIntent(originalIntent);
                BrainLogger.pipeline(`🛡️ ICM GATE: ${originalIntent} blocked (${stateCheck.reason}). Fallback → ${fallbackIntent}`);

                // --- Event Logging: ICM Blocked ---
                if (EXPERT_MODE && !IS_SHADOW) {
                    EventLogger.logEvent(activeSessionId, 'icm_blocked', {
                        originalIntent,
                        blockedReason: stateCheck.reason,
                        fallbackIntent
                    }, null, 'icm').catch(() => { });
                }

                intent = fallbackIntent;
                source = 'icm_fallback';
            }

            // ═══════════════════════════════════════════════════════════════════
            // CART MUTATION GUARD: Only confirm_order can mutate cart
            // ═══════════════════════════════════════════════════════════════════
            if (mutatesCart(intent) && intent !== 'confirm_order') {
                BrainLogger.pipeline(`🛡️ CART GUARD: ${intent} tried to mutate cart - BLOCKED`);
                intent = 'find_nearby';
                source = 'cart_mutation_blocked';
            }

            // ═══════════════════════════════════════════════════════════════════
            // FIX 1: CONTEXT-AWARE LEGACY UNLOCK (SMART SAFE)
            // If restaurant context exists, allow ordering even from legacy source
            // ═══════════════════════════════════════════════════════════════════
            if (source === 'legacy_hard_blocked') {
                if (hasLockedRestaurant(sessionContext)) {
                    BrainLogger.pipeline('🟢 SMART_SAFE_UNLOCK: Legacy ordering allowed (restaurant locked)');
                    intent = 'create_order';
                    source = 'smart_safe_unlock';
                } else {
                    BrainLogger.pipeline('🛡️ HARD_BLOCK: No restaurant context → fallback idle');
                    intent = 'find_nearby';
                }
            }

            // ═══════════════════════════════════════════════════════════════════
            // FIX 3: CONVERSATION CONTINUITY GUARD
            // Prevent idle reset when user mentions dish in ordering context
            // ═══════════════════════════════════════════════════════════════════
            if (
                intent === 'find_nearby' &&
                isOrderingContext(sessionContext) &&
                containsDishLikePhrase(text) &&
                !entities?.location  // EXEMPTION: explicit idle always wins
            ) {
                BrainLogger.pipeline('🟢 CONTINUITY_GUARD_TRIGGERED: Preventing idle reset → create_order');
                intent = 'create_order';
                source = 'continuity_guard';
            }

            // ═══════════════════════════════════════════════════════════════════
            // FIX A3: STRONG ORDERING CONTINUITY GUARD
            // If user has a locked restaurant AND uses ordering phrases, NEVER drop to find_nearby
            // This runs AFTER FIX 3 to catch cases with explicit ordering verbs (skuszę, poprosę, etc.)
            // SAFETY: Does NOT override confirm_order
            // ═══════════════════════════════════════════════════════════════════
            if (
                intent === 'find_nearby' &&
                sessionContext?.currentRestaurant &&
                containsOrderingIntent(text) &&
                !entities?.location  // EXEMPTION: explicit location = user wants new idle
            ) {
                BrainLogger.pipeline('🟢 STRONG_CONTINUITY_GUARD: ordering phrase + locked restaurant → create_order');
                intent = 'create_order';
                source = 'strong_continuity_guard';
            }

            // ═══════════════════════════════════════════════════════════════════
            // FIX 4: LIGHT PHASE TRACKING (MOVED — executed after handler + contextUpdates)
            // Phase is computed AFTER handler execution and contextUpdates are applied,
            // so it reflects the true updated session state (e.g. currentRestaurant from
            // SelectRestaurantHandler). See phase calculation block below.
            // ═══════════════════════════════════════════════════════════════════

            // ═══════════════════════════════════════════════════════════════════
            // IDLE RESET: find_nearby resets restaurant context
            // SAFETY: Skip reset if intent came from a blocked source (preserve context)
            // ═══════════════════════════════════════════════════════════════════
            const isFromBlock = source?.endsWith('_blocked') || source === 'icm_fallback';
            if (intent === 'find_nearby' && !IS_SHADOW && !isFromBlock) {
                updateSession(sessionId, {
                    currentRestaurant: null,
                    lastRestaurant: null,
                    lockedRestaurantId: null
                });
                BrainLogger.pipeline('🔄 IDLE RESET: Cleared restaurant context for find_nearby');
            }

            // ═══════════════════════════════════════════════════════════════════
            // CHOOSE_RESTAURANT DIALOG: When ambiguous restaurants, show picker
            // ═══════════════════════════════════════════════════════════════════
            if (intent === 'choose_restaurant' && entities?.options?.length > 0) {
                BrainLogger.pipeline(`🌉 CHOOSE_RESTAURANT: Showing picker for ${entities.options.length} restaurants`);

                const restaurants = entities.options.map(opt => ({
                    id: opt.restaurant_id,
                    name: opt.restaurant_name,
                    items: opt.items
                }));

                const surfaceResult = renderSurface({
                    key: 'ASK_RESTAURANT_FOR_ORDER',
                    facts: {
                        restaurants: restaurants,
                        dishNames: entities.parsedOrder?.available?.map(i => i.name) || []
                    }
                });

                // Set dialog focus and save restaurants list
                if (!IS_SHADOW) {
                    updateSession(sessionId, {
                        dialog_focus: 'CHOOSING_RESTAURANT_FOR_ORDER',
                        expectedContext: 'select_restaurant',
                        last_restaurants_list: restaurants,
                        pendingDish: entities.parsedOrder?.available?.[0]?.name || sessionContext.pendingDish
                    });
                }

                return {
                    ok: true,
                    session_id: sessionId,
                    intent: 'choose_restaurant',
                    reply: surfaceResult.reply,
                    uiHints: surfaceResult.uiHints,
                    restaurants: restaurants,
                    should_reply: true,
                    meta: { source: 'choose_restaurant_dialog', ambiguous: true }
                };
            }
            // ═══════════════════════════════════════════════════════════════════
            // PRE-HANDLER CONTEXT OVERRIDE: Fast-track clarify_order with location
            // ═══════════════════════════════════════════════════════════════════
            if (intent === 'clarify_order' && !sessionContext?.currentRestaurant && (sessionContext?.conversationPhase === 'idle' || !sessionContext?.conversationPhase)) {
                try {
                    const { supabase } = await import('../../_supabase.js');
                    const { data } = await supabase.from('restaurants').select('city');
                    if (data) {
                        const cities = [...new Set(data.map(d => d.city).filter(Boolean))].map(c => c.toLowerCase());
                        const lowerText = text.toLowerCase();
                        if (cities.some(city => lowerText.includes(city))) {
                            BrainLogger.pipeline(`⚡ PRE-HANDLER OVERRIDE: Location found in clarify_order -> find_nearby`);
                            intent = 'find_nearby';
                            source = 'context_override_location';
                        }
                    }
                } catch (e) {
                    BrainLogger.pipeline(`🛡️ PRE-HANDLER OVERRIDE error: ${e.message}`);
                }
            }

            context.intent = intent;
            context.domain = domain || 'food';
            context.entities = entities || {};
            context.confidence = confidence;
            context.source = source;

            // --- RESTAURANT PRIORITY RESOLUTION (Utterance > Session) ---
            const resolvedRestaurant =
                entities?.restaurant ||           // 1. Utterance (explicit mention)
                entities?.restaurantId ||         // 2. Catalog match ID
                session?.currentRestaurant ||     // 3. Session persistent
                session?.lastRestaurant;          // 4. Fallback

            context.resolvedRestaurant = resolvedRestaurant;

            // --- UX GUARDS (Dialog State Polish) ---

            // UX Guard 1: Menu-Scoped Ordering
            // If user is in menu flow with restaurant context, allow ordering
            // SAFETY: NEVER upgrade if intent was BLOCKED (source ends with '_blocked' or 'icm_fallback')
            const isBlocked = context.source?.endsWith('_blocked') || context.source === 'icm_fallback';
            if (context.intent === 'find_nearby' && !isBlocked) {
                const hasRestaurantContext = session?.currentRestaurant || session?.lastRestaurant;
                const wasMenuFlow = session?.lastIntent === 'menu_request' ||
                    session?.expectedContext === 'restaurant_menu' ||
                    session?.expectedContext === 'continue_order';

                if (hasRestaurantContext && wasMenuFlow) {
                    BrainLogger.pipeline('✨ UX Guard 1: Menu-scoped ordering. Upgrading find_nearby -> create_order with currentRestaurant.');
                    context.intent = 'create_order';
                    context.source = 'menu_scoped_order';
                    context.resolvedRestaurant = session.currentRestaurant || session.lastRestaurant;
                }
            } else if (isBlocked) {
                BrainLogger.pipeline(`🛡️ UX Guard 1 SKIPPED: Intent was blocked (source: ${context.source})`);
            }

            // UX Guard 2: Fuzzy Restaurant Confirmation
            // If user mentions a restaurant name similar to currentRestaurant, ask for confirmation
            if (context.intent === 'find_nearby' && session?.currentRestaurant && entities?.restaurant) {
                const currentName = (session.currentRestaurant.name || '').toLowerCase();
                const mentionedName = (entities.restaurant || '').toLowerCase();

                // Simple fuzzy: first 4 chars match or partial include
                const isSimilar = currentName.substring(0, 4) === mentionedName.substring(0, 4) ||
                    currentName.includes(mentionedName.substring(0, 5)) ||
                    mentionedName.includes(currentName.substring(0, 5));

                if (isSimilar && currentName !== mentionedName) {
                    BrainLogger.pipeline(`✨ UX Guard 2: Fuzzy match detected. Asking confirmation for ${session.currentRestaurant.name}`);
                    return {
                        session_id: sessionId,
                        reply: `Czy chodziło Ci o ${session.currentRestaurant.name}?`,
                        should_reply: true,
                        intent: 'confirm_restaurant',
                        contextUpdates: {
                            expectedContext: 'confirm_restaurant',
                            pendingRestaurantConfirm: session.currentRestaurant
                        },
                        meta: { source: 'ux_guard_fuzzy_confirm' }
                    };
                }
            }

            // --- GUARDS ---

            // Rule: Confirm Guard
            if (session?.expectedContext === 'confirm_order') {
                const normalized = (text || "").toLowerCase();
                const confirmWords = /\b(tak|potwierdzam|ok|dobra|może być|dawaj|pewnie|jasne|super|świetnie)\b/i;
                if (confirmWords.test(normalized)) {
                    BrainLogger.pipeline('🛡️ Guard: Context is confirm_order and confirmation word detected. Forcing confirm_order.');
                    context.intent = 'confirm_order';
                }
            }

            // Rule 4: Auto Menu
            if (context.intent === 'select_restaurant') {
                const normalized = (text || "").toLowerCase();
                const wantsToSee = /\b(pokaz|pokaż|zobacz|jakie|co)\b/i.test(normalized);
                const wantsChange = /\b(inn[ea]|zmień|wybierz\s+inne)\b/i.test(normalized);

                if (wantsToSee && !wantsChange) {
                    BrainLogger.pipeline('🛡️ Guard Rule 4: "Show" verb detected. Upgrading select_restaurant -> menu_request');
                    context.intent = 'menu_request';
                }
            }

            // Rule 2: Early Dish Detection
            if (context.intent === 'create_order') {
                const ent = context.entities || {};
                const normalized = (text || "").toLowerCase();
                const strictOrderVerbs = /\b(zamawiam|wezm[ęe]|dodaj|poprosz[ęe]|chc[ęe])\b/i;
                const hasOrderVerb = strictOrderVerbs.test(normalized);

                if (!hasOrderVerb && !session?.pendingOrder && !session?.expectedContext) {
                    BrainLogger.pipeline('🛡️ Guard Rule 2: Implicit order without verb. Downgrading to find_nearby/menu_request.');
                    if (ent?.dish || ent?.items?.length) {
                        context.intent = 'menu_request';
                    } else {
                        return {
                            session_id: sessionId,
                            reply: "Co chciałbyś zamówić?",
                            should_reply: true,
                            intent: 'create_order',
                            meta: { source: 'guard_rule_2_explicit_prompt' }
                        };
                    }
                }

                // --- RULE 6: Empty Order / Adjective Guard ---
                if (context.intent === 'create_order') {
                    // Check if we have items or dish
                    // Re-read items directly from parser if needed, but entity should have it
                    // Simple check: if ent.items is empty and ent.dish is empty -> Problem
                    const hasItems = ent?.items && ent.items.length > 0;
                    const hasExplicitDish = ent?.dish || (hasItems && ent.items[0]?.name !== 'Unknown');

                    if (!hasExplicitDish && !hasItems && hasOrderVerb) {
                        // Opcja B: Exception for longer text (potential dish name not yet parsed)
                        const stripped = normalized.replace(strictOrderVerbs, '').trim();
                        if (stripped.length > 2) {
                            BrainLogger.pipeline(`🛡️ Guard Rule 6: Passing potential dish "${stripped}" to handlers despite missing entities.`);
                            // Do NOT return here. Let it pass to OrderHandler which will call parseOrderItems
                        } else {
                            BrainLogger.pipeline('🛡️ Guard Rule 6: Order intent with no explicit dish. Asking for details.');
                            return {
                                session_id: sessionId,
                                reply: "Co dokładnie chciałbyś zamówić?",
                                should_reply: true,
                                intent: 'create_order',
                                meta: { source: 'guard_rule_6_no_dish' }
                            };
                        }
                    }
                }
            }

            // Zombie Kill Switch
            if (session?.status === 'COMPLETED' && !IS_SHADOW) {
                if (!['new_order', 'start_over', 'help'].includes(context.intent)) {
                    return {
                        ok: true,
                        intent: 'session_locked',
                        reply: "Twoje zamówienie zostało już zakończone. Powiedz 'nowe zamówienie', aby zacząć od początku.",
                        meta: { source: 'guard_lock' }
                    };
                }
                // Reset session if intent is allowed
                updateSession(sessionId, { status: 'active', pendingOrder: null, lockedRestaurantId: null, context: 'neutral' });
            }

            // Update session (Short-term memory)
            if (!IS_SHADOW) {
                updateSession(sessionId, { lastIntent: context.intent, lastUpdated: Date.now() });
            }

            // 3. Domain Dispatching
            if (!this.handlers[context.domain]) {
                return this.createErrorResponse('unknown_domain', 'Nie wiem jak to obsłużyć (błąd domeny).');
            }

            // FIX A4: SANITIZE LOCATION before find_nearby dispatch
            if (context.intent === 'find_nearby' && context.entities?.location) {
                const rawLocation = context.entities.location;
                context.entities.location = sanitizeLocation(rawLocation, session);
                if (context.entities.location !== rawLocation) {
                    BrainLogger.pipeline(`🧹 LOCATION_SANITIZED: "${rawLocation}" → "${context.entities.location}"`);
                }
            }

            const handler = this.handlers[context.domain][context.intent] || this.handlers.system.fallback;
            const domainResponse = await handler.execute(context);

            // ═══════════════════════════════════════════════════════════════════
            // LOCATION COMMIT: Write entities.location to session BEFORE surface detection
            // Prevents ASK_LOCATION from firing when handler already used the location
            // ═══════════════════════════════════════════════════════════════════
            if (context.intent === 'find_nearby' && context.entities?.location && !IS_SHADOW) {
                const confirmedLocation = context.entities.location;
                BrainLogger.pipeline(`📍 LOCATION_COMMIT: "${confirmedLocation}" → session`);
                updateSession(sessionId, {
                    last_location: confirmedLocation,
                    currentLocation: confirmedLocation,
                    awaiting: null,
                    expectedContext: null
                });
                // Also update the in-memory session snapshot so detectSurface sees it
                sessionContext.last_location = confirmedLocation;
                sessionContext.currentLocation = confirmedLocation;
                sessionContext.awaiting = null;
                sessionContext.expectedContext = null;
            }

            // ═══════════════════════════════════════════════════════════════════
            // DIALOG SURFACE LAYER: Transform structured facts to natural Polish
            // Pipeline is SSoT, Surface is presentation only
            // Detect actionable cases and render appropriate reply
            // ═══════════════════════════════════════════════════════════════════
            const detectedSurface = detectSurface(domainResponse, context);

            if (detectedSurface) {
                const surfaceResult = renderSurface(detectedSurface);

                // 🎙️ PhraseGenerator: LLM paraphrasing with template fallback
                // Constraint: no session access, no intent change, only {spokenText, ssml}
                let finalReply = surfaceResult.reply;
                let ssml = null;

                if (EXPERT_MODE && !IS_SHADOW && config?.phrase_generator_enabled !== false) {
                    try {
                        const phraseResult = await generatePhrase({
                            surfaceKey: detectedSurface.key,
                            facts: detectedSurface.facts,
                            templateText: surfaceResult.reply
                        });
                        if (phraseResult?.spokenText) {
                            finalReply = phraseResult.spokenText;
                            ssml = phraseResult.ssml;
                            BrainLogger.pipeline(`🎙️ PhraseGenerator: paraphrased to "${finalReply.substring(0, 50)}..."`);
                        }
                    } catch (phraseErr) {
                        // Fallback to template (determinism preserved)
                        BrainLogger.pipeline(`🎙️ PhraseGenerator fallback: ${phraseErr.message}`);
                    }
                }

                // Override reply with rendered/paraphrased text, keep structured data
                domainResponse.reply = finalReply;
                domainResponse.ssml = ssml;
                domainResponse.uiHints = surfaceResult.uiHints;

                BrainLogger.pipeline(`🎨 SurfaceRenderer: ${detectedSurface.key} → "${finalReply.substring(0, 50)}..."`);

                // --- Event Logging: Surface Rendered ---
                if (EXPERT_MODE && !IS_SHADOW) {
                    EventLogger.logEvent(activeSessionId, 'surface_rendered', {
                        surfaceKey: detectedSurface.key,
                        replyPreview: finalReply?.substring(0, 100),
                        usedPhraseGenerator: finalReply !== surfaceResult.reply
                    }, null, 'dialog').catch(() => { });
                }

                // ═══════════════════════════════════════════════════════════════════
                // DIALOG STACK: Push rendered surface for BACK/REPEAT navigation
                // ═══════════════════════════════════════════════════════════════════
                if (!IS_SHADOW) {
                    pushDialogStack(sessionContext, {
                        surfaceKey: detectedSurface.key,
                        facts: detectedSurface.facts,
                        renderedText: surfaceResult.reply
                    });
                    updateSession(sessionId, {
                        dialogStack: sessionContext.dialogStack,
                        dialogStackIndex: sessionContext.dialogStackIndex
                    });
                }
            }

            // Apply state changes from handler
            if (domainResponse.contextUpdates && !IS_SHADOW) {
                updateSession(sessionId, domainResponse.contextUpdates);
            }

            // ═══════════════════════════════════════════════════════════════════
            // FIX 4: LIGHT PHASE TRACKING (post-handler, post-contextUpdates)
            // Phase is now calculated AFTER:
            //   1) ICM gate determined finalIntent (variable `intent` at this point)
            //   2) handler.execute() ran (may have set currentRestaurant, etc.)
            //   3) contextUpdates were applied to session (state is now fully updated)
            // This prevents conversationPhase='restaurant_selected' while
            // currentRestaurant is still null.
            // ═══════════════════════════════════════════════════════════════════
            if (!IS_SHADOW) {
                // Read updated session state AFTER contextUpdates were applied
                const updatedSessionContext = getSession(activeSessionId) || sessionContext;

                let newPhase = calculatePhase(
                    intent,                                              // finalIntent: post-ICM
                    updatedSessionContext.conversationPhase || 'idle', // current phase from updated session
                    source
                );

                // 🛡️ SAFETY GUARD: restaurant_selected requires currentRestaurant to be set.
                // If handler did NOT actually persist a restaurant (e.g. select failed),
                // fall back to 'idle' to prevent phase/state desync.
                if (newPhase === 'restaurant_selected' && !updatedSessionContext?.currentRestaurant) {
                    BrainLogger.pipeline(`⚠️ PHASE_SAFETY_GUARD: restaurant_selected requested but currentRestaurant=null → fallback to 'idle'`);
                    newPhase = 'idle';
                }

                if (newPhase !== updatedSessionContext.conversationPhase) {
                    updateSession(sessionId, { conversationPhase: newPhase });
                    BrainLogger.pipeline(`📍 PHASE_TRANSITION: ${updatedSessionContext.conversationPhase || 'idle'} → ${newPhase}`);
                }
            }

            // --- SHADOW MODE EXIT ---
            if (IS_SHADOW) {
                return {
                    intent: context.intent,
                    domain: context.domain,
                    reply: domainResponse.reply,
                    meta: {
                        latency_ms: Date.now() - startTime,
                        source,
                        confidence
                    },
                    mockContextUpdates: domainResponse.contextUpdates,
                    rawResponse: domainResponse
                };
            }

            // 4.5 Synthesis (Expert Layer — dev mode only)
            devLog(`🟣 PIPELINE FINAL REPLY [${context.intent}]:`, JSON.stringify(domainResponse.reply)?.substring(0, 120));
            let speechText = domainResponse.reply;
            let audioContent = null;
            let stylingMs = 0;
            let ttsMs = 0;

            if ((EXPERT_MODE || options.stylize) && domainResponse.reply) {
                // STYLIZATION GUARD: Skip for data-heavy intents and numbered lists
                const SKIP_STYLIZATION = new Set(['find_nearby', 'menu_request', 'confirm_order', 'show_menu']);
                const hasNumberedList = /\d+\.\s/.test(domainResponse.reply);
                if (SKIP_STYLIZATION.has(intent) || hasNumberedList) {
                    devLog(`🎨 STYLIZATION_SKIPPED: intent=${intent}, hasList=${hasNumberedList}`);
                } else {
                    const t0 = Date.now();
                    speechText = await stylizeWithGPT4o(domainResponse.reply, intent);
                    stylingMs = Date.now() - t0;
                }
            }

            // Optimization for Voice Presentations:
            // Intelligent TTS Summary Layer
            let speechPartForTTS = speechText;

            if (domainResponse?.restaurants?.length) {
                const loc = domainResponse.location || (domainResponse.contextUpdates && domainResponse.contextUpdates.last_location) || null;
                const summary = buildRestaurantSummaryForTTS(
                    domainResponse.restaurants,
                    loc
                );
                if (summary) {
                    speechPartForTTS = summary;
                    BrainLogger.pipeline(`✂️ Smart TTS Restaurant Summary: "${speechPartForTTS.substring(0, 50)}..."`);
                }
            } else if (domainResponse?.menuItems?.length) {
                const summary = buildMenuSummaryForTTS(
                    domainResponse.menuItems
                );
                if (summary) {
                    speechPartForTTS = summary;
                    BrainLogger.pipeline(`✂️ Smart TTS Menu Summary: "${speechPartForTTS.substring(0, 50)}..."`);
                }
            }

            // Respect options or default to false
            const wantsTTS = options.includeTTS === true;
            const hasReply = domainResponse.should_reply !== false; // Default true
            const ttsEnabled = config?.tts_enabled === true; // Strict check: defaults to false if undefined or null, only true if explicitly true

            if (hasReply && (wantsTTS || EXPERT_MODE) && ttsEnabled) {
                if (speechPartForTTS) {
                    try {
                        // 🔊 TTS: Odtwarzamy całe wygenerowane streszczenie (celowo wyłączone chunkowanie)
                        const ttsText = speechPartForTTS;

                        const t0 = Date.now();
                        audioContent = await playTTS(ttsText, options.ttsOptions || {});
                        ttsMs = Date.now() - t0;

                        BrainLogger.pipeline(`🔊 TTS Generated: "${ttsText.substring(0, 30)}..." (${ttsMs}ms)`);
                    } catch (err) {
                        BrainLogger.pipeline(`❌ TTS failed: ${err.message}`);
                    }
                }
            }

            const totalLatency = Date.now() - startTime;

            // 5. Response Synthesis (Legacy Parity)
            const { contextUpdates, meta: domainMeta, reply: _r, ...cleanDomainResponse } = domainResponse;

            const restaurants = cleanDomainResponse.restaurants || [];
            const menuItems = cleanDomainResponse.menuItems || [];

            const restaurantsWithDisplayName = restaurants.map((r) => {
                if (!r || r.distance == null) return r;
                const meters = Math.round(Number(r.distance) * 1000);
                if (!Number.isFinite(meters)) return r;
                return { ...r, displayName: `${r.name} (${meters} m)` };
            });

            const response = {
                ...cleanDomainResponse,
                ok: true,
                session_id: sessionId,
                text: speechText, // Legacy Text
                reply: speechText, // Legacy Reply
                tts_text: speechPartForTTS, // Explicitly return what was used for TTS
                audioContent: audioContent,
                intent: intent,
                should_reply: domainResponse.should_reply ?? true,
                actions: domainResponse.actions || [],
                restaurants: restaurantsWithDisplayName,
                menuItems: menuItems,
                menu: menuItems, // Legacy Alias
                meta: {
                    latency_total_ms: totalLatency,
                    source: domainMeta?.source || source || 'llm',
                    styling_ms: stylingMs,
                    tts_ms: ttsMs,
                    ...(domainMeta || {})
                },
                context: getSession(sessionId),
                locationRestaurants: restaurants, // Legacy Alias
                timestamp: new Date().toISOString()
            };

            // Legacy alias for discovery
            if (restaurants.length > 0) {
                response.locationRestaurants = restaurantsWithDisplayName;
            }

            if (EXPERT_MODE) {
                const turnId = `turn_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
                response.turn_id = turnId;
                // Expert mode allows background analytics
                const wStep = this._mapWorkflowStep(intent);
                EventLogger.logEvent(sessionId, 'intent_resolved', {
                    intent, reply: speechText, confidence, source, domain: context.domain
                }, confidence, wStep).catch(() => { });

                // --- Event Logging: Response Sent ---
                EventLogger.logEvent(sessionId, 'response_sent', {
                    intent,
                    replyPreview: speechText?.substring(0, 150),
                    latency_ms: totalLatency,
                    has_audio: !!audioContent
                }, null, 'response').catch(() => { });

                this.persistAnalytics({
                    intent, reply: speechText, durationMs: totalLatency, confidence, ttsMs
                }).catch(() => { });
            }

            // 🧠 Record assistant turn + cache entities (passive memory)
            if (!IS_SHADOW) {
                pushAssistantTurn(sessionContext, speechText, detectedSurface?.key, { restaurants, menuItems });
                if (restaurants?.length) cacheRestaurants(sessionContext, restaurants);
                if (menuItems?.length) cacheItems(sessionContext, menuItems);
            }

            if (!IS_SHADOW) {
                BrainPipeline._inFlight.delete(inflightKey);
                devLog(`⏹️  [Pipeline] DONE  ${requestId} | intent=${intent} | source=${source} | ${Date.now() - startTime}ms`);
            }

            // ═══════════════════════════════════════════════════════════════════
            // ENGINE_MODE RESPONSE SANITIZER
            // stable/strict: strip debug meta, session dumps, turn_ids
            // dev: full response passthrough
            // ═══════════════════════════════════════════════════════════════════
            return sanitizeResponse(response);

        } catch (error) {
            BrainLogger.pipeline('Error:', error.message);
            if (!IS_SHADOW) BrainPipeline._inFlight.delete(inflightKey);
            return this.createErrorResponse('internal_error', 'Coś poszło nie tak w moich obwodach.');
        }
    }

    _mapWorkflowStep(intentName) {
        if (intentName === 'confirm_order') return 'confirm_order';
        return intentName;
    }

    async persistAnalytics(p) {
        if (process.env.NODE_ENV === 'test') return;
        try {
            await supabase.from('amber_intents').insert({
                intent: p.intent,
                reply: typeof p.reply === 'string' ? p.reply.slice(0, 1000) : JSON.stringify(p.reply).slice(0, 1000),
                duration_ms: p.durationMs,
                confidence: p.confidence || 1.0,
                tts_ms: p.ttsMs || 0
            });
        } catch (e) {
            // Ignore missing table
        }
    }

    createErrorResponse(errorCode, message) {
        return {
            ok: false,
            error: errorCode,
            reply: message,
            timestamp: new Date().toISOString()
        };
    }
}

/**
 * In-flight request deduplication guard
 * Key: `${sessionId}::${text}` — prevents double intent resolution
 * for the same message sent concurrently (React StrictMode, retry bugs, etc.)
 */
BrainPipeline._inFlight = new Set();
