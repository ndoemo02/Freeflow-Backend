/**
 * Core Pipeline Orchestrator (V2)
 * Odpowiada za przepÄąâ€šyw danych: Request -> Hydration -> NLU -> Domain -> Response
 */

import { getEngineMode, isDev, isStrict, devLog, devWarn, devError, strictAssert, strictRequireSession, sanitizeResponse } from './engineMode.js';

import { getSession, updateSession, getOrCreateActiveSessionAsync, closeConversation } from '../session/sessionStore.js';
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
    mutatesCart,
    getIntentDomain
} from './IntentCapabilityMap.js';
import { renderSurface, detectSurface } from '../dialog/SurfaceRenderer.js';
import { dialogNavGuard, pushDialogStack } from '../dialog/DialogNavGuard.js';
import { resolveMenuItemConflict, DISAMBIGUATION_RESULT } from '../services/DisambiguationService.js';
import { ORDER_INTENTS, TRANSACTION_ALLOWED_INTENTS, ORDER_INTENTS_CLEANUP, ESCAPE_INTENTS, CONFIDENT_SOURCES, EXPLICIT_ESCAPE_SOURCES, CART_MUTATION_WHITELIST, CONFIRMATION_CONTEXTS } from './pipeline/IntentGroups.js';
import { GUARD_CHAIN } from './pipeline/guards/index.js';
import { ResponseBuilder } from './pipeline/ResponseBuilder.js';
import { MenuHydrationService } from './pipeline/MenuHydrationService.js';
import { SessionHydrator } from './pipeline/SessionHydrator.js';
import { HandlerDispatcher } from './pipeline/HandlerDispatcher.js';

// Reco V1 — rule-based recommendation layer (no extra DB calls)
import { getRecommendations } from '../recommendations/recoEngine.js';
import { recoTelemetry } from '../recommendations/recoTelemetry.js';

// Ä‘ĹşÂ§Â  Passive Memory Layer (read-only context, no FSM impact)
import { initTurnBuffer, pushUserTurn, pushAssistantTurn } from '../memory/TurnBuffer.js';
import { initEntityCache, cacheRestaurants, cacheItems } from '../memory/EntityCache.js';

// Ä‘ĹşĹ˝â„˘ÄŹÂ¸Ĺą Phrase Generator (optional LLM paraphrasing, fallback to templates)
import { generatePhrase } from '../dialog/PhraseGenerator.js';

// Ä‘Ĺşâ€ťĹ  TTS Chunking (stream first sentence, barge-in support)
import { getFirstChunk, createBargeInController } from '../tts/TtsChunker.js';

// Ä‘Ĺşâ€şË‡ÄŹÂ¸Ĺą Conversation Guards (UX improvements, no FSM changes)
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

// Ä‘ĹşĹ¤ËťÄŹÂ¸Ĺą Dish Canonicalization (alias resolution before NLU)
import { canonicalizeDish } from '../nlu/dishCanon.js';

// Ä‘Ĺşâ€ťĹ  Phonetic Dish Matcher (STT error recovery before NLU)
import { matchDishPhonetic } from '../nlu/phoneticDishMatch.js';

// Ä‘Ĺşâ€śË Intelligent TTS Summaries
function buildRestaurantSummaryForTTS(restaurants, location) {
    if (!restaurants || restaurants.length === 0) return null;

    const count = restaurants.length;

    const sample = restaurants
        .slice(0, 3)
        .map(r => r.name)
        .join(', ');

    return `ZnalazÄąâ€šam ${count} miejsc${location ? ' w ' + location : ''}. MiĂ„â„˘dzy innymi: ${sample}. KtÄ‚Ĺ‚rĂ„â€¦ wybierasz?`;
}

function buildMenuSummaryForTTS(menuItems) {
    if (!menuItems || menuItems.length === 0) return null;

    const categories = [...new Set(menuItems.map(i => i.category).filter(Boolean))];

    const hasVege = menuItems.some(i => i.is_vege);
    const hasSpicy = menuItems.some(i => i.spicy);

    let summary = "W karcie sĂ„â€¦ m.in. ";

    if (categories.length > 0) {
        summary += categories.join(', ');
    }

    if (hasVege && !summary.includes('wegetariaÄąâ€žskie')) summary += ", opcje wegetariaÄąâ€žskie";
    if (hasSpicy && !summary.includes('ostre')) summary += ", dania ostre";

    // Deduplicate base_name and use it for examples
    const baseNames = [...new Set(menuItems.map(i => i.base_name || i.name).filter(Boolean))];
    const sample = baseNames.slice(0, 3).join(', ');

    if (sample) {
        summary += `. Na przykÄąâ€šad: ${sample}. Co wybierasz?`;
    } else {
        summary += `. Co wybierasz?`;
    }

    return summary;
}


function isExplicitRestaurantNavigation(text = '') {
    const normalized = String(text || '').toLowerCase();
    return [
        'restaurac',
        'pokaz restauracje',
        'pokaďż˝ restauracje',
        'znajdz restauracje',
        'znajdďż˝ restauracje',
        'dostepne restauracje',
        'dostďż˝pne restauracje',
        'w poblizu',
        'w pobliďż˝u',
        'gdzie moge zjesc',
        'gdzie mogďż˝ zjeďż˝ďż˝',
        'gdzie zjem'
    ].some((phrase) => normalized.includes(phrase));
}
// Mapa handlerÄ‚Ĺ‚w domenowych (BezpoÄąâ€şrednie mapowanie)
// Kluczem jest "domain", a wewnĂ„â€¦trz "intent"

// Default Handlers Map
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
                        reply: 'Co polecam? W okolicy masz Äąâ€şwietne opcje! Powiedz gdzie szukaĂ„â€ˇ.',
                        intent: 'recommend',
                        contextUpdates: { expectedContext: 'find_nearby' }
                    })
                },
                cancel_order: {
                    execute: async (ctx) => ({
                        reply: 'Anulowalam zamawianie. Wracam do ekranu glownego.',
                        intent: 'cancel_order',
                        contextUpdates: { pendingOrder: null, expectedContext: null, conversationPhase: 'idle', currentRestaurant: null, lastRestaurant: null, pendingDish: null }
                    })
                },
                confirm: new FindRestaurantHandler(repository),
            },
            ordering: {
                create_order: new OrderHandler(),
                confirm_order: new ConfirmOrderHandler(),
                confirm_add_to_cart: new ConfirmAddToCartHandler(),
                clarify_order: {
                    execute: async (ctx) => ({
                        reply: 'Nie mam pewno\u015bci, o kt\u00f3re danie chodzi. Co dok\u0142adnie chcia\u0142by\u015b zam\u00f3wi\u0107?',
                        intent: 'clarify_order',
                        contextUpdates: { expectedContext: 'create_order' }
                    })
                }
            },
            system: {
                health_check: { execute: async () => ({ reply: 'System dziaÄąâ€ša', meta: {} }) },
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
     * GÄąâ€šÄ‚Ĺ‚wny punkt wejÄąâ€şcia dla kaÄąÄ˝dego zapytania
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
        let activeSessionId = sessionId;

        // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â
        // SINGLE-ROUTING INVARIANT: In-flight deduplication guard
        // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â
        const inflightKey = `${sessionId}::${text.trim()}`;
        if (!IS_SHADOW) {
            if (BrainPipeline._inFlight.has(inflightKey)) {
                console.warn(`Ä‘ĹşĹˇÂ« [Pipeline] DUPLICATE_REQUEST blocked: ${sessionId} Ă˘â€ â€™ "${text.trim().substring(0, 40)}". Single-routing invariant enforced.`);
                return {
                    ok: false,
                    session_id: activeSessionId,
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
            return this.createErrorResponse('brak_tekstu', 'Nie usÄąâ€šyszaÄąâ€šam, moÄąÄ˝esz powtÄ‚Ĺ‚rzyĂ„â€ˇ?');
        }

        const ENGINE_MODE = getEngineMode();
        const EXPERT_MODE = ENGINE_MODE === 'dev'; // backward compat alias
        const requestId = `${sessionId.substring(0, 8)}-${startTime.toString(36)}`;
        devLog(`Ă˘â€“Â¶ÄŹÂ¸Ĺą  [Pipeline] START ${requestId} | session=${sessionId} | text="${text.trim().substring(0, 60)}" | mode=${ENGINE_MODE}`);

        // --- Event Logging: Received (dev only) ---
        if (EXPERT_MODE && !IS_SHADOW) {
            const initialWorkflowStep = this._mapWorkflowStep('request_received');
            EventLogger.logConversation(sessionId).catch(() => { });
            EventLogger.logEvent(sessionId, 'request_received', { text }, null, initialWorkflowStep).catch(() => { });
        }

        // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â
        // CONVERSATION ISOLATION: Auto-create new session if previous was closed
        // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â
        const hydratedSession = await SessionHydrator.hydrate({
            sessionId,
            activeSessionId,
            isShadow: IS_SHADOW,
            getOrCreateActiveSessionAsync,
            logger: BrainLogger,
        });

        const sessionResult = hydratedSession.sessionResult;
        activeSessionId = hydratedSession.activeSessionId;
        const session = hydratedSession.session;
        const sessionContext = hydratedSession.sessionContext;

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
            coords,
            trace: ['hydrated'],
        };

        // Ä‘ĹşÂ§Â  Initialize Passive Memory (no FSM impact)
        initTurnBuffer(sessionContext);
        initEntityCache(sessionContext);

        try {
            await MenuHydrationService.hydrate({
                sessionContext,
                activeSessionId,
                handlers: this.handlers,
                context,
                isShadow: IS_SHADOW,
                updateSession,
                logger: BrainLogger,
            });
            context.trace.push('menu_loaded');

            // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â
            // 1. DIALOG NAVIGATION GUARD (Meta-Intent Layer)
            // Handles: BACK, REPEAT, NEXT, STOP
            // SHORT-CIRCUITS pipeline if matched - does NOT touch FSM
            // Config-aware: respects dialog_navigation_enabled and fallback_mode
            // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â
            const navResult = dialogNavGuard(text, sessionContext, config);

            if (navResult.handled) {
                BrainLogger.pipeline(`Ä‘Ĺşâ€ťâ‚¬ DIALOG NAV: ${navResult.response.intent} - skipping NLU/FSM`);

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
                    meta: navResult.response.meta,
                    context: getSession(activeSessionId) || sessionContext
                };
            }

            // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â
            // PRE-NLU CONTEXT OVERRIDE: Fast-track list selections
            // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â
            let intentResult;
            const executedGuardNames = [];

            const executeGuardChain = (intentContext, guardImplementations, pipelineState = {}) => {
                const state = {
                    ...pipelineState,
                    guardImplementations,
                    mutationApplied: false,
                    firstMutationGuard: null,
                };

                for (const guard of GUARD_CHAIN) {
                    executedGuardNames.push(guard.name);

                    const beforeIntent = intentContext?.intent;
                    const nextIntentContext = guard(intentContext, state) || intentContext;
                    const afterIntent = nextIntentContext?.intent;
                    const intentChanged = beforeIntent !== afterIntent;

                    if (intentChanged) {
                        if (!state.mutationApplied) {
                            state.mutationApplied = true;
                            state.firstMutationGuard = guard.name;
                            intentContext = nextIntentContext;
                        } else {
                            BrainLogger.pipeline(`[GUARD_CHAIN] skipped extra intent mutation by ${guard.name}: "${beforeIntent}" -> "${afterIntent}" (first mutation: ${state.firstMutationGuard})`);
                            intentContext = {
                                ...nextIntentContext,
                                intent: beforeIntent,
                            };
                        }
                    } else {
                        intentContext = nextIntentContext;
                    }

                    if (state.stopGuardChain) break;
                }

                return intentContext;
            };
            const hasList = sessionContext?.last_restaurants_list?.length > 0;
            const normOverrideText = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
            const isDigitObj = /^\d+$/.test(normOverrideText) || /^wybieram\s+\d+$/.test(normOverrideText);
            const isOrdinalObj = /^(pierwsza|druga|trzecia|czwarta|piata|szosta|siodma|osma|dziewiata|dziesiata|jedynka|dwojka|trojka|czworka|piatka|szostka|siodemka|osemka|dziewiatka|dziesiatka|pierwszy|drugi|trzeci|czwarty|piaty|szosty|siodmy|osmy|dziewiaty|dziesiaty)$/.test(normOverrideText);
            const listNorm = hasList
                ? sessionContext.last_restaurants_list.map((r) => (r?.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim())
                : [];
            const isFragmentSelection = hasList && normOverrideText.length >= 4 && !normOverrideText.includes(' ') && listNorm.some((n) => n.includes(normOverrideText) || n.split(' ').some((w) => w.startsWith(normOverrideText)));

            if (hasList && (isDigitObj || isOrdinalObj || isFragmentSelection)) {
                BrainLogger.pipeline(`Ă˘ĹˇË‡ PRE-NLU OVERRIDE: Bypassing NLU for list selection -> select_restaurant`);
                intentResult = {
                    intent: 'select_restaurant',
                    domain: 'food',
                    confidence: 1.0,
                    source: 'context_override',
                    entities: {}
                };
            } else {
                // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â
                // PRE-NLU: Dish Canonicalization (resolve aliases before NLU)
                // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â
                const canonResult = canonicalizeDish(text, sessionContext);
                if (canonResult && (typeof canonResult === 'string') && canonResult !== text) {
                    BrainLogger.pipeline(`Ä‘Ĺşâ€ťÂ¤ DISH_CANON: "${text}" Ă˘â€ â€™ "${canonResult}"`);
                    context.canonicalDish = canonResult;
                    text = canonResult; // Override text for NLU
                }

                // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â
                // PRE-NLU: Phonetic Dish Matcher (STT error recovery)
                // Runs AFTER canon so canon has first priority.
                // If a phonetic match is found, text is replaced before NLU.
                // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â
                const hasExplicitQuantityPrefix = /^\s*(?:\d+|jeden|jedna|jedno|dwa|dwie|trzy|cztery|pi[eďż˝]c|sze[sďż˝]c|siedem|osiem|dziewi[eďż˝]c|dziesi[eďż˝]c|kilka|par[eďż˝])\b/i.test(text);
                if (sessionContext?.last_menu?.length > 0 && !isExplicitRestaurantNavigation(text) && !hasExplicitQuantityPrefix) {
                    const phoneticMatch = matchDishPhonetic(text, sessionContext.last_menu);
                    if (phoneticMatch) {
                        BrainLogger.pipeline(`Ä‘Ĺşâ€ťĹ  PHONETIC_MATCH: "${text}" Ă˘â€ â€™ "${phoneticMatch}"`);
                        text = phoneticMatch;
                        context.text = phoneticMatch;
                    }
                }

                // 2. NLU Decision
                intentResult = await this.nlu.detect(context);
            }

            // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â
            const normalizedPreGuardInput = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0142/g, 'l').trim();
            const preIntentContext = {
                intent: intentResult?.intent,
                entities: intentResult?.entities,
                text,
                source: intentResult?.source,
                confidence: intentResult?.confidence,
                domain: intentResult?.domain,
            };

            const preIntentGuardImplementations = {
                preNluOverrideGuard: (intentContext) => intentContext,
                transactionLockGuard: (intentContext) => {
                    if (
                        (sessionContext?.pendingOrder || sessionContext?.expectedContext === 'confirm_add_to_cart') &&
                        intentContext.intent &&
                        !ORDER_INTENTS.includes(intentContext.intent) &&
                        !ESCAPE_INTENTS.includes(intentContext.intent)
                    ) {
                        const lockedIntent = sessionContext.expectedContext || 'create_order';
                        BrainLogger.pipeline(`[GUARD] TRANSACTION_LOCK: "${intentContext.intent}" -> "${lockedIntent}" (pendingOrder=${!!sessionContext.pendingOrder})`);
                        return {
                            ...intentContext,
                            intent: lockedIntent,
                            source: 'transaction_lock_override',
                            confidence: 1.0,
                            domain: 'ordering',
                        };
                    }
                    return intentContext;
                },
                orderingAffirmationGuard: (intentContext) => {
                    const isOrderingAffirmation = /^(tak|ok|okej|potwierdzam|zgadza sie|dawaj|dobra|jasne|leci)$/i.test(normalizedPreGuardInput);
                    const hasCartItems = Array.isArray(sessionContext?.cart?.items) && sessionContext.cart.items.length > 0;
                    if (isOrderingAffirmation && sessionContext?.conversationPhase === 'ordering' && hasCartItems && !sessionContext?.pendingOrder) {
                        const lastCartItem = sessionContext.cart.items[sessionContext.cart.items.length - 1];
                        if (lastCartItem?.name) {
                            BrainLogger.pipeline(`ORDERING_AFFIRMATION_GUARD: repeating last cart item "${lastCartItem.name}"`);
                            return {
                                ...intentContext,
                                intent: 'create_order',
                                domain: 'ordering',
                                source: 'ordering_affirmation_repeat',
                                confidence: 1.0,
                                entities: {
                                    ...(intentContext.entities || {}),
                                    dish: lastCartItem.name,
                                    quantity: 1,
                                    restaurant: sessionContext?.currentRestaurant || sessionContext?.lastRestaurant || null,
                                    restaurantId: sessionContext?.currentRestaurant?.id || sessionContext?.lastRestaurant?.id || null,
                                },
                                text: lastCartItem.name,
                            };
                        }
                    }
                    return intentContext;
                },
                escapeOverrideGuard: (intentContext) => {
                    if (/\bpokaz\s+restaurac/.test(normalizedPreGuardInput) && intentContext.intent !== 'find_nearby') {
                        BrainLogger.pipeline(`ESCAPE_OVERRIDE: "${intentContext.intent}" -> "find_nearby" (phrase="${intentContext.text}")`);
                        return {
                            ...intentContext,
                            intent: 'find_nearby',
                            source: 'escape_phrase_override',
                            confidence: 1.0,
                            domain: 'food',
                        };
                    }
                    return intentContext;
                },
                expectedContextGuard: (intentContext) => {
                    if (
                        sessionContext?.expectedContext &&
                        /^(tak|ok|okej|potwierdzam|zgadza sie|dawaj|dobra|jasne|leci)$/i.test(normalizedPreGuardInput) &&
                        intentContext.intent !== sessionContext.expectedContext
                    ) {
                        BrainLogger.pipeline(`đź›ˇď¸Ź EXPECTED_CONTEXT_OVERRIDE: "${intentContext.intent}" â†’ "${sessionContext.expectedContext}" (user said "${intentContext.text}")`);
                        return {
                            ...intentContext,
                            intent: sessionContext.expectedContext,
                            source: 'expected_context_override',
                            confidence: 1.0,
                            domain: ['confirm_add_to_cart', 'confirm_order', 'create_order'].includes(sessionContext.expectedContext)
                                ? 'ordering'
                                : intentContext.domain,
                        };
                    }
                    return intentContext;
                },
            };

            const guardedPreIntentContext = executeGuardChain(preIntentContext, preIntentGuardImplementations);
            intentResult.intent = guardedPreIntentContext.intent;
            intentResult.source = guardedPreIntentContext.source ?? intentResult.source;
            intentResult.confidence = guardedPreIntentContext.confidence ?? intentResult.confidence;
            intentResult.domain = guardedPreIntentContext.domain ?? intentResult.domain;
            intentResult.entities = guardedPreIntentContext.entities ?? intentResult.entities;
            text = guardedPreIntentContext.text;
            context.text = guardedPreIntentContext.text;
            context.trace.push(`intent_resolved:${intentResult?.intent || 'unknown'}`);
            const guardOverride = guardedPreIntentContext.intent !== preIntentContext.intent ? guardedPreIntentContext.intent : 'none';
            context.trace.push(`guard_override:${guardOverride}`);

            // EARLY EXITS (Greetings) - Skip everything else
            // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â
            if (intentResult?.intent === 'greeting') {
                BrainLogger.pipeline(`Ä‘Ĺşâ€â€ą GREETING DETECTED: Returning friendly greeting`);
                const replyText = 'CzeÄąâ€şĂ„â€ˇ! W czym mogĂ„â„˘ pomÄ‚Ĺ‚c?';
                let audioContent = null;
                const wantsTTS = options?.includeTTS === true;
                const EX_MODE = process.env.EXPERT_MODE === 'true'; // Pipeline constant
                const ttsEnabled = config?.tts_enabled === true;

                if ((wantsTTS || EX_MODE) && ttsEnabled) {
                    try {
                        const t0 = Date.now();
                        audioContent = await playTTS(replyText, options?.ttsOptions || {});
                        BrainLogger.pipeline(`Ä‘Ĺşâ€ťĹ  TTS Gen (Greeting): "${replyText}" (${Date.now() - t0}ms)`);
                    } catch (err) {
                        BrainLogger.pipeline(`Ă˘ĹĄĹš TTS failed: ${err.message}`);
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
                    meta: { source: 'pipeline_greeting_handler' },
                    context: getSession(activeSessionId) || sessionContext
                };
            }

            // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â
            // RESTAURANT HOURS HANDLER
            // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â

            if (intentResult?.intent === 'restaurant_hours') {
                const currentRestaurant = sessionContext?.lastRestaurant || sessionContext?.currentRestaurant;

                if (!currentRestaurant) {
                    return {
                        ok: true,
                        session_id: activeSessionId,
                        intent: 'restaurant_hours',
                        reply: 'KtÄ‚Ĺ‚rej restauracji mam sprawdziĂ„â€ˇ godziny?',
                        should_reply: true,
                        stopTTS: false,
                        context: getSession(activeSessionId) || sessionContext
                    };
                }

                const hours = currentRestaurant.opening_hours || 'Nie mam informacji o godzinach.';

                return {
                    ok: true,
                    session_id: activeSessionId,
                    intent: 'restaurant_hours',
                    reply: `${currentRestaurant.name} jest otwarta: ${hours}.`,
                    should_reply: true,
                    stopTTS: false,
                    context: getSession(activeSessionId) || sessionContext
                };
            }

            // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â
            // UNKNOWN INTENT SAFE FALLBACK
            // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â

            if (intentResult?.intent === 'UNKNOWN_INTENT') {

                const phase = sessionContext?.conversationPhase || 'idle';

                let reply;

                if (phase === 'ordering') {
                    reply = 'Nie jestem pewna, o co chodzi. Kontynuujemy zamÄ‚Ĺ‚wienie czy chcesz coÄąâ€ş zmieniĂ„â€ˇ?';
                } else if (phase === 'restaurant_selected') {
                    reply = 'MoÄąÄ˝esz wybraĂ„â€ˇ coÄąâ€ş z menu albo zapytaĂ„â€ˇ o szczegÄ‚Ĺ‚Äąâ€šy.';
                } else {
                    reply = 'MogĂ„â„˘ pokazaĂ„â€ˇ restauracje w pobliÄąÄ˝u albo pomÄ‚Ĺ‚c w wyborze dania.';
                }

                return {
                    ok: true,
                    session_id: activeSessionId,
                    intent: 'UNKNOWN_INTENT',
                    reply,
                    should_reply: true,
                    stopTTS: false,
                    meta: { source: 'safe_unknown_handler' },
                    context: getSession(activeSessionId) || sessionContext
                };
            }

            // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â
            // SINGLE ROUTING INVARIANT Ă˘â‚¬â€ť hard guard
            // If this fires, a classic path leaked through the NLU layer.
            // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â
            if (intentResult?.source?.includes('classic')) {
                console.error('Ä‘ĹşĹˇÂ« CLASSIC_ROUTE_INVARIANT_VIOLATED', {
                    source: intentResult.source,
                    intent: intentResult.intent,
                    sessionId: activeSessionId
                });
                // Downgraded to warn because smartIntent allows classic source bypass
                console.warn(`CLASSIC ROUTE DETECTED Ă˘â‚¬â€ť ${intentResult.source}`);
            }

            let { intent, domain, confidence, source, entities } = intentResult;

            // --- Event Logging: NLU Result ---
            if (EXPERT_MODE && !IS_SHADOW) {
                EventLogger.logEvent(activeSessionId, 'nlu_result', {
                    intent, domain, confidence, source,
                    entities: entities ? Object.keys(entities) : []
                }, confidence, 'nlu').catch(() => { });
            }

            // Ä‘ĹşÂ§Â  Record user turn (passive memory, no FSM impact)
            if (!IS_SHADOW) {
                pushUserTurn(sessionContext, text, { intent, entities });
            }

            // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â
            // CONFIDENCE FLOOR: Low-confidence intents trigger disambiguation
            // Instead of guessing wrong, ask the user what they meant
            // Skip for rule-based sources (guards, overrides) which are always confident
            // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â
            if (
                confidence < 0.5 &&
                domain === 'food' &&
                !CONFIDENT_SOURCES.includes(source) &&
                !sessionContext?.pendingOrder
            ) {
                const hasRestaurant = !!(sessionContext?.currentRestaurant);
                const disambiguationReply = hasRestaurant
                    ? `Nie jestem pewna, o co chodzi. Czy chcesz zamÄ‚Ĺ‚wiĂ„â€ˇ coÄąâ€ş z menu ${sessionContext.currentRestaurant.name}?`
                    : 'Nie bardzo rozumiem. MogĂ„â„˘ pokazaĂ„â€ˇ restauracje w pobliÄąÄ˝u albo pomÄ‚Ĺ‚c w zamÄ‚Ĺ‚wieniu.';

                BrainLogger.pipeline(`Ä‘ĹşÂ¤â€ť CONFIDENCE_FLOOR: ${intent} (${(confidence * 100).toFixed(0)}%) Ă˘â€ â€™ disambiguation`);

                return {
                    ok: true,
                    session_id: activeSessionId,
                    intent: 'disambiguation',
                    reply: disambiguationReply,
                    should_reply: true,
                    stopTTS: false,
                    meta: {
                        source: 'confidence_floor',
                        originalIntent: intent,
                        confidence
                    },
                    context: getSession(activeSessionId) || sessionContext
                };
            }

            // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â
            // TRANSACTION LOCK: Active ordering prevents foreign intents
            // If user is mid-transaction (pendingOrder or awaiting confirmation),
            // only ordering-related intents are allowed through.
            // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â

            if (
                (sessionContext?.pendingOrder || sessionContext?.expectedContext === 'confirm_add_to_cart') &&
                !TRANSACTION_ALLOWED_INTENTS.includes(intent)
            ) {
                // If the user explicitly asks to find a restaurant or esc lock, allow it and clear pending
                const isExplicitEscape = EXPLICIT_ESCAPE_SOURCES.includes(source) ||
                    ['find_nearby', 'select_restaurant', 'show_menu', 'cancel_order', 'cancel'].includes(intent);

                if (isExplicitEscape && confidence >= 0.8) {
                    BrainLogger.pipeline(`Ä‘Ĺşâ€ťâ€ś TRANSACTION_LOCK: User explicitly escaped lock with intent: ${intent} (source: ${source})`);
                    // Session cleanup is owned by handlers (guard path remains pure).
                } else {
                    const lockedIntent = sessionContext.expectedContext || 'create_order';
                    BrainLogger.pipeline(`Ä‘Ĺşâ€ťâ€™ TRANSACTION_LOCK: "${intent}" blocked mid-transaction Ă˘â€ â€™ "${lockedIntent}"`);
                    intent = lockedIntent;
                    source = 'transaction_lock_override';
                    domain = 'ordering';
                }
            }

            // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â
            // FIX 2: RESTAURANT SEMANTIC RECOVERY
            // Recover restaurant from full text if NLU missed the entity
            // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â
            if (!entities?.restaurant && text && sessionContext.entityCache?.restaurants) {
                const recovered = await recoverRestaurantFromFullText(
                    text,
                    sessionContext.entityCache.restaurants
                );

                if (recovered) {
                    entities = entities || {};
                    entities.restaurant = recovered.name;
                    entities.restaurantId = recovered.id;
                    BrainLogger.nlu(`Ä‘ĹşÂ§Â  SEMANTIC_RESTAURANT_RECOVERY: Detected "${recovered.name}" from full text`);
                }
            }

            // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â
            // FIX A1: MENU RESOLVER BRIDGE
            // Fuzzy-match restaurant from menu-request phrasing, BEFORE ICM gate
            // Sets entities + session lock so ICM lets menu_request through cleanly
            // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â
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
                BrainLogger.pipeline(`Ä‘Ĺşâ€ťĹ¤ MENU_RESOLVER_BRIDGE: locked to "${menuResolvedRestaurant.name}", forcing menu_request`);
                // Persist the restaurant lock immediately
                if (!IS_SHADOW) {
                    updateSession(activeSessionId, {
                        currentRestaurant: {
                            id: menuResolvedRestaurant.id,
                            name: menuResolvedRestaurant.name
                        },
                        lockedRestaurantId: menuResolvedRestaurant.id
                    });
                }
            }

            // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â
            // FIX: allow implicit dish ordering without keyword
            // If we are in a restaurant context and NLU is unknown, try menu disambiguation.
            // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â
            if (intent === 'unknown' && sessionContext?.currentRestaurant?.id) {
                try {
                    const resolution = await resolveMenuItemConflict(text, {
                        restaurant_id: sessionContext.currentRestaurant.id
                    });

                    if (resolution?.status === DISAMBIGUATION_RESULT.ADD_ITEM) {
                        intent = 'create_order';
                        domain = 'food';
                        source = 'implicit_dish_guard';
                        BrainLogger.pipeline('Ä‘ĹşĹşË IMPLICIT_DISH_GUARD: unknown Ă˘â€ â€™ create_order via menu match');
                    }
                } catch (err) {
                    BrainLogger.pipeline(`Ä‘Ĺşâ€şË‡ÄŹÂ¸Ĺą IMPLICIT_DISH_GUARD failed: ${err.message}`);
                }
            }

            // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â
            // ICM GATE: Validate FSM state requirements BEFORE executing intent
            // This ensures NO intent (regex/legacy/LLM) can bypass FSM
            // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â
            const stateCheck = checkRequiredState(intent, sessionContext, entities);
            const originalIntent = intent; // Remember for soft dialog bridge

            if (!stateCheck.met) {
                // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â
                // SOFT DIALOG BRIDGE (KROK 1 & 4): Instead of hard reset, show dialog
                // If user wants menu/order but no restaurant, and we have candidates Ă˘â€ â€™ ASK
                // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â
                const hasRestaurantsList = sessionContext?.last_restaurants_list?.length > 0;

                if (originalIntent === 'menu_request' && hasRestaurantsList) {
                    // User wants menu, we have restaurants Ă˘â€ â€™ ask which one
                    BrainLogger.pipeline(`Ä‘ĹşĹšâ€° SOFT DIALOG BRIDGE: menu_request blocked, showing restaurant picker`);

                    const surfaceResult = renderSurface({
                        key: 'ASK_RESTAURANT_FOR_MENU',
                        facts: {
                            restaurants: sessionContext.last_restaurants_list.slice(0, 5)
                        }
                    });

                    // Set dialog focus for context tracking (KROK 2)
                    if (!IS_SHADOW) {
                        updateSession(activeSessionId, {
                            dialog_focus: 'CHOOSING_RESTAURANT_FOR_MENU',
                            expectedContext: 'select_restaurant'
                        });
                    }

                    return {
                        ok: true,
                        session_id: activeSessionId,
                        intent: 'menu_request', // Keep original intent for tracking
                        reply: surfaceResult.reply,
                        uiHints: surfaceResult.uiHints,
                        restaurants: sessionContext.last_restaurants_list.slice(0, 5),
                        should_reply: true,
                        meta: { source: 'soft_dialog_bridge', originalIntent: 'menu_request' },
                        context: getSession(activeSessionId) || sessionContext
                    };
                }

                if (originalIntent === 'create_order' && hasRestaurantsList) {
                    // User wants to order, we have restaurants Ă˘â€ â€™ ask which one
                    BrainLogger.pipeline(`Ä‘ĹşĹšâ€° SOFT DIALOG BRIDGE: create_order blocked, showing restaurant picker`);

                    const surfaceResult = renderSurface({
                        key: 'ASK_RESTAURANT_FOR_ORDER',
                        facts: {
                            restaurants: sessionContext.last_restaurants_list.slice(0, 5),
                            dishNames: entities.dish ? [entities.dish] : []
                        }
                    });

                    // Set dialog focus and preserve pending dish (KROK 2)
                    if (!IS_SHADOW) {
                        updateSession(activeSessionId, {
                            dialog_focus: 'CHOOSING_RESTAURANT_FOR_ORDER',
                            expectedContext: 'select_restaurant',
                            pendingDish: entities.dish || sessionContext.pendingDish
                        });
                    }

                    return {
                        ok: true,
                        session_id: activeSessionId,
                        intent: 'create_order', // Keep original intent for tracking
                        reply: surfaceResult.reply,
                        uiHints: surfaceResult.uiHints,
                        restaurants: sessionContext.last_restaurants_list.slice(0, 5),
                        should_reply: true,
                        meta: { source: 'soft_dialog_bridge', originalIntent: 'create_order' },
                        context: getSession(activeSessionId) || sessionContext
                    };
                }

                // Standard fallback for other cases
                const fallbackIntent = getFallbackIntent(originalIntent);
                BrainLogger.pipeline(`Ä‘Ĺşâ€şË‡ÄŹÂ¸Ĺą ICM GATE: ${originalIntent} blocked (${stateCheck.reason}). Fallback Ă˘â€ â€™ ${fallbackIntent}`);

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

            // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â
            // CART MUTATION GUARD: Only whitelisted intents can mutate cart
            // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â
            if (mutatesCart(intent) && !CART_MUTATION_WHITELIST.includes(intent)) {
                BrainLogger.pipeline(`Ä‘Ĺşâ€şË‡ÄŹÂ¸Ĺą CART GUARD: ${intent} tried to mutate cart - BLOCKED`);
                intent = 'find_nearby';
                source = 'cart_mutation_blocked';
            }

            // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â
            // FIX 1: CONTEXT-AWARE LEGACY UNLOCK (SMART SAFE)
            // If restaurant context exists, allow ordering even from legacy source
            // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â
            if (source === 'legacy_hard_blocked') {
                if (hasLockedRestaurant(sessionContext)) {
                    BrainLogger.pipeline('Ä‘ĹşĹşË SMART_SAFE_UNLOCK: Legacy ordering allowed (restaurant locked)');
                    intent = 'create_order';
                    source = 'smart_safe_unlock';
                } else {
                    BrainLogger.pipeline('Ä‘Ĺşâ€şË‡ÄŹÂ¸Ĺą HARD_BLOCK: No restaurant context Ă˘â€ â€™ fallback idle');
                    intent = 'find_nearby';
                }
            }

            // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â
            // FIX 3: CONVERSATION CONTINUITY GUARD
            // Prevent idle reset when user mentions dish in ordering context
            // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â
            if (
                intent === 'find_nearby' &&
                isOrderingContext(sessionContext) &&
                containsDishLikePhrase(text) &&
                !entities?.location  // EXEMPTION: explicit idle always wins
            ) {
                BrainLogger.pipeline('Ä‘ĹşĹşË CONTINUITY_GUARD_TRIGGERED: Preventing idle reset Ă˘â€ â€™ create_order');
                intent = 'create_order';
                source = 'continuity_guard';
            }

            // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â
            // FIX A3: STRONG ORDERING CONTINUITY GUARD
            // If user has a locked restaurant AND uses ordering phrases, NEVER drop to find_nearby
            // This runs AFTER FIX 3 to catch cases with explicit ordering verbs (skuszĂ„â„˘, poprosĂ„â„˘, etc.)
            // SAFETY: Does NOT override confirm_order
            // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â
            if (
                intent === 'find_nearby' &&
                sessionContext?.currentRestaurant &&
                containsOrderingIntent(text) &&
                !entities?.location  // EXEMPTION: explicit location = user wants new idle
            ) {
                BrainLogger.pipeline('Ä‘ĹşĹşË STRONG_CONTINUITY_GUARD: ordering phrase + locked restaurant Ă˘â€ â€™ create_order');
                intent = 'create_order';
                source = 'strong_continuity_guard';
            }

            // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â
            // FIX 4: LIGHT PHASE TRACKING (MOVED Ă˘â‚¬â€ť executed after handler + contextUpdates)
            // Phase is computed AFTER handler execution and contextUpdates are applied,
            // so it reflects the true updated session state (e.g. currentRestaurant from
            // SelectRestaurantHandler). See phase calculation block below.
            // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â

            // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â
            // FLOATING pendingOrder GUARD: Clear stale transaction state
            // If intent diverged from ordering, wipe ghost pendingOrder
            // Prevents old "tak" from adding stale items to cart
            // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â
            if (sessionContext?.pendingOrder && !ORDER_INTENTS_CLEANUP.includes(intent)) {
                BrainLogger.pipeline(`Ä‘ĹşÂ§Ä… FLOATING_ORDER_CLEANUP: Cleared stale pendingOrder (intent=${intent})`);
                if (!IS_SHADOW) {
                    updateSession(activeSessionId, {
                        pendingOrder: null,
                        expectedContext: null
                    });
                }
                sessionContext.pendingOrder = null;
                sessionContext.expectedContext = null;
            }

            // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â
            // SAFETY TIMEOUT: Clear pendingOrder older than 60 seconds
            // Prevents ghost transactions from lingering across long pauses
            // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â
            const PENDING_ORDER_TIMEOUT_MS = 60_000;
            if (sessionContext?.pendingOrder?.createdAt) {
                const age = Date.now() - sessionContext.pendingOrder.createdAt;
                if (age > PENDING_ORDER_TIMEOUT_MS) {
                    BrainLogger.pipeline(`Ă˘ĹąÂ° PENDING_ORDER_TIMEOUT: Cleared after ${Math.round(age / 1000)}s`);
                    if (!IS_SHADOW) {
                        updateSession(activeSessionId, {
                            pendingOrder: null,
                            expectedContext: null
                        });
                    }
                    sessionContext.pendingOrder = null;
                    sessionContext.expectedContext = null;
                }
            }

            // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â
            // IDLE RESET: find_nearby resets restaurant context
            // SAFETY: Skip reset if intent came from a blocked source (preserve context)
            // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â
            const isFromBlock = source?.endsWith('_blocked') || source === 'icm_fallback';
            if (intent === 'find_nearby' && !IS_SHADOW && !isFromBlock) {
                updateSession(activeSessionId, {
                    currentRestaurant: null,
                    lastRestaurant: null,
                    lockedRestaurantId: null
                });
                BrainLogger.pipeline('Ä‘Ĺşâ€ťâ€ž IDLE RESET: Cleared restaurant context for find_nearby');
            }

            // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â
            // CHOOSE_RESTAURANT DIALOG: When ambiguous restaurants, show picker
            // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â
            if (intent === 'choose_restaurant' && entities?.options?.length > 0) {
                BrainLogger.pipeline(`Ä‘ĹşĹšâ€° CHOOSE_RESTAURANT: Showing picker for ${entities.options.length} restaurants`);

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
                    updateSession(activeSessionId, {
                        dialog_focus: 'CHOOSING_RESTAURANT_FOR_ORDER',
                        expectedContext: 'select_restaurant',
                        last_restaurants_list: restaurants,
                        pendingDish: entities.parsedOrder?.available?.[0]?.name || sessionContext.pendingDish
                    });
                }

                return {
                    ok: true,
                    session_id: activeSessionId,
                    intent: 'choose_restaurant',
                    reply: surfaceResult.reply,
                    uiHints: surfaceResult.uiHints,
                    restaurants: restaurants,
                    should_reply: true,
                    meta: { source: 'choose_restaurant_dialog', ambiguous: true },
                    context: getSession(activeSessionId) || sessionContext
                };
            }
            // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â
            // PRE-HANDLER CONTEXT OVERRIDE: Fast-track clarify_order with location
            // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â
            if (intent === 'clarify_order' && !sessionContext?.currentRestaurant && (sessionContext?.conversationPhase === 'idle' || !sessionContext?.conversationPhase)) {
                try {
                    const { supabase } = await import('../../_supabase.js');
                    const { data } = await supabase.from('restaurants').select('city');
                    if (data) {
                        const cities = [...new Set(data.map(d => d.city).filter(Boolean))].map(c => c.toLowerCase());
                        const lowerText = text.toLowerCase();
                        if (cities.some(city => lowerText.includes(city))) {
                            BrainLogger.pipeline(`Ă˘ĹˇË‡ PRE-HANDLER OVERRIDE: Location found in clarify_order -> find_nearby`);
                            intent = 'find_nearby';
                            source = 'context_override_location';
                        }
                    }
                } catch (e) {
                    BrainLogger.pipeline(`Ä‘Ĺşâ€şË‡ÄŹÂ¸Ĺą PRE-HANDLER OVERRIDE error: ${e.message}`);
                }
            }

            // SCOPED_ZUREK_ORDER_BRIDGE: keep order path for Stara Kamienica when Zurek is unavailable in parser stage.
            if (intent === 'clarify_order') {
                const restaurantName = (sessionContext?.currentRestaurant?.name || sessionContext?.lastRestaurant?.name || '').toLowerCase();
                const normalizedOrderText = String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                const isStaraKamienica = restaurantName.includes('restauracja stara kamienica');
                const isZurekLike = normalizedOrderText.includes('zurek') || normalizedOrderText.includes('urek') || normalizedOrderText.includes('zur');

                if (isStaraKamienica && isZurekLike) {
                    BrainLogger.pipeline('SCOPED_ZUREK_ORDER_BRIDGE: clarify_order -> create_order');
                    intent = 'create_order';
                    source = 'scoped_zurek_order_bridge';
                    entities = {
                        ...(entities || {}),
                        dish: entities?.dish || text
                    };
                }
            }



            context.intent = intent;
            context.domain = getIntentDomain(intent) || domain || 'food';
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
                    BrainLogger.pipeline('Ă˘Ĺ›Â¨ UX Guard 1: Menu-scoped ordering. Upgrading find_nearby -> create_order with currentRestaurant.');
                    context.intent = 'create_order';
                    context.source = 'menu_scoped_order';
                    context.resolvedRestaurant = session.currentRestaurant || session.lastRestaurant;
                }
            } else if (isBlocked) {
                BrainLogger.pipeline(`Ä‘Ĺşâ€şË‡ÄŹÂ¸Ĺą UX Guard 1 SKIPPED: Intent was blocked (source: ${context.source})`);
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
                    BrainLogger.pipeline(`Ă˘Ĺ›Â¨ UX Guard 2: Fuzzy match detected. Asking confirmation for ${session.currentRestaurant.name}`);
                    return {
                        session_id: activeSessionId,
                        reply: `Czy chodziÄąâ€šo Ci o ${session.currentRestaurant.name}?`,
                        should_reply: true,
                        intent: 'confirm_restaurant',
                        contextUpdates: {
                            expectedContext: 'confirm_restaurant',
                            pendingRestaurantConfirm: session.currentRestaurant
                        },
                        meta: { source: 'ux_guard_fuzzy_confirm' },
                        context: getSession(activeSessionId) || sessionContext
                    };
                }
            }

            // --- GUARDS ---

            // Rule: Explicit clear cart command (backend session SSoT)
            // Handles "wyczysc koszyk" from UI button so session.cart cannot resurrect after refresh.
            const normalizedInput = (text || "")
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .trim();

            const isClearCartCommand =
                /\b(wyczysc|oproznij|usun)\b.*\b(koszyk|cart)\b/i.test(normalizedInput) ||
                /\b(koszyk|cart)\b.*\b(wyczysc|oproznij|usun)\b/i.test(normalizedInput);

            if (isClearCartCommand) {
                const clearedCart = { items: [], total: 0 };
                const nextPhase = sessionContext?.currentRestaurant ? 'restaurant_selected' : 'idle';
                if (!IS_SHADOW) {
                    updateSession(activeSessionId, {
                        cart: clearedCart,
                        pendingOrder: null,
                        expectedContext: null,
                        pendingRestaurantSwitch: null,
                        conversationPhase: nextPhase
                    });
                }

                return {
                    ok: true,
                    session_id: activeSessionId,
                    intent: 'clear_cart',
                    reply: 'Wyczyscilam koszyk.',
                    should_reply: true,
                    actions: [{ type: 'CLEAR_CART' }],
                    cart: clearedCart,
                    meta: {
                        source: 'clear_cart_command',
                        cart: clearedCart
                    },
                    context: getSession(activeSessionId) || sessionContext
                };
            }

            // Rule: Restaurant name should select restaurant, not create order.
            // Fixes cases like "calzone" being interpreted as add dish when cart/context is active.
            if (
                context.intent === 'create_order' &&
                context.entities?.restaurant &&
                context.entities?.restaurantId &&
                !context.entities?.dish
            ) {
                const hasExplicitOrderVerb = /\b(zamawiam|zamow|zamowic|zamowie|dodaj|poprosze|poprosz|wezme|wez|chce|chcialbym|chcialabym|do\s+koszyka)\b/i.test(normalizedInput);
                const hasExplicitQty = /\b\d+\s*(x|razy|szt|szt\.|sztuk)?\b/i.test(normalizedInput);

                if (!hasExplicitOrderVerb && !hasExplicitQty) {
                    BrainLogger.pipeline('Guard: restaurant mention without order verb -> forcing select_restaurant');
                    context.intent = 'select_restaurant';
                    context.domain = 'food';
                    context.source = 'restaurant_name_guard';
                }
            }

            // Rule: Confirm Guard
            // Rule: Confirm Guard (General confirmation words handler)
            if (CONFIRMATION_CONTEXTS.includes(session?.expectedContext)) {
                const normalized = (text || "").toLowerCase();
                const confirmWords = /\b(tak|potwierdzam|ok|dobra|moÄąÄ˝e byĂ„â€ˇ|dawaj|pewnie|jasne|super|Äąâ€şwietnie)\b/i;
                if (confirmWords.test(normalized)) {
                    const targetIntent = session.expectedContext; // Dynamically use the context name as intent name
                    BrainLogger.pipeline(`Ä‘Ĺşâ€şË‡ÄŹÂ¸Ĺą Guard: Context is ${targetIntent} and confirmation word detected. Forcing ${targetIntent}.`);
                    context.intent = targetIntent;
                }
            }

            // Rule: Restaurant Switch Confirmation
            if (session?.expectedContext === 'confirm_restaurant_switch') {
                const normalized = (text || "").toLowerCase();
                const confirmWords = /\b(tak|potwierdzam|ok|dobra|moÄąÄ˝e byĂ„â€ˇ|dawaj|pewnie|jasne|super|Äąâ€şwietnie|zmieniaj|wyczyÄąâ€şĂ„â€ˇ)\b/i;
                const negateWords = /\b(nie|pocz[eĂ„â„˘]kaj|stop|anuluj|nie\s+chc[eĂ„â„˘]|zostaw)\b/i;

                if (confirmWords.test(normalized)) {
                    BrainLogger.pipeline('Ä‘Ĺşâ€şË‡ÄŹÂ¸Ĺą Guard: Context is confirm_restaurant_switch and confirmation word detected. Executing clear + switch.');

                    const target = session.pendingRestaurantSwitch;

                    // 1. Clear cart in session
                    if (!IS_SHADOW) {
                        updateSession(sessionId, {
                            cart: { items: [], total: 0 },
                            pendingRestaurantSwitch: null
                        });
                    }

                    // 2. Force select_restaurant intent with target
                    context.intent = 'select_restaurant';
                    context.domain = 'food';
                    context.entities = {
                        ...context.entities,
                        restaurantId: target.id,
                        restaurant: target.name,
                        location: target.city,
                        forceSwitch: true // Bypass safety check in SelectRestaurantHandler
                    };
                } else if (negateWords.test(normalized)) {
                    BrainLogger.pipeline('Ä‘Ĺşâ€şË‡ÄŹÂ¸Ĺą Guard: Context is confirm_restaurant_switch and negation word detected. Cancelling switch.');
                    return {
                        ok: true,
                        session_id: activeSessionId,
                        reply: "Dobrze, zostajemy przy obecnym zamÄ‚Ĺ‚wieniu. Co jeszcze chcesz dodaĂ„â€ˇ?",
                        should_reply: true,
                        intent: 'cancel_switch',
                        contextUpdates: {
                            expectedContext: 'create_order',
                            pendingRestaurantSwitch: null
                        },
                        meta: { source: 'switch_cancelled' },
                        context: getSession(activeSessionId) || sessionContext
                    };
                }
            }

            // Rule 4: Auto Menu
            if (context.intent === 'select_restaurant') {
                const normalized = (text || "").toLowerCase();
                const wantsToSee = /\b(pokaz|pokaÄąÄ˝|zobacz|jakie|co)\b/i.test(normalized);
                const wantsChange = /\b(inn[ea]|zmieÄąâ€ž|wybierz\s+inne)\b/i.test(normalized);

                if (wantsToSee && !wantsChange) {
                    BrainLogger.pipeline('Ä‘Ĺşâ€şË‡ÄŹÂ¸Ĺą Guard Rule 4: "Show" verb detected. Upgrading select_restaurant -> menu_request');
                    context.intent = 'menu_request';
                }
            }

            // Rule 2: Early Dish Detection
            if (context.intent === 'create_order') {
                const ent = context.entities || {};
                const normalized = (text || "").toLowerCase();
                const strictOrderVerbs = /\b(zamawiam|wezm[Ă„â„˘e]|dodaj|poprosz[Ă„â„˘e]|chc[Ă„â„˘e])\b/i;
                const hasOrderVerb = strictOrderVerbs.test(normalized);
                const isAffirmationRepeat = context.source === 'ordering_affirmation_repeat';

                if (!hasOrderVerb && !session?.pendingOrder && !session?.expectedContext && !isAffirmationRepeat) {
                    BrainLogger.pipeline('Ä‘Ĺşâ€şË‡ÄŹÂ¸Ĺą Guard Rule 2: Implicit order without verb. Downgrading to find_nearby/menu_request.');
                    if (ent?.dish || ent?.items?.length) {
                        context.intent = 'menu_request';
                    } else {
                        return {
                            session_id: activeSessionId,
                            reply: "Co chciaÄąâ€šbyÄąâ€ş zamÄ‚Ĺ‚wiĂ„â€ˇ?",
                            should_reply: true,
                            intent: 'create_order',
                            meta: { source: 'guard_rule_2_explicit_prompt' },
                            context: getSession(activeSessionId) || sessionContext
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
                            BrainLogger.pipeline(`Ä‘Ĺşâ€şË‡ÄŹÂ¸Ĺą Guard Rule 6: Passing potential dish "${stripped}" to handlers despite missing entities.`);
                            // Do NOT return here. Let it pass to OrderHandler which will call parseOrderItems
                        } else {
                            BrainLogger.pipeline('Ä‘Ĺşâ€şË‡ÄŹÂ¸Ĺą Guard Rule 6: Order intent with no explicit dish. Asking for details.');
                            return {
                                session_id: activeSessionId,
                                reply: "Co dokÄąâ€šadnie chciaÄąâ€šbyÄąâ€ş zamÄ‚Ĺ‚wiĂ„â€ˇ?",
                                should_reply: true,
                                intent: 'create_order',
                                meta: { source: 'guard_rule_6_no_dish' },
                                context: getSession(activeSessionId) || sessionContext
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
                        reply: "Twoje zamÄ‚Ĺ‚wienie zostaÄąâ€šo juÄąÄ˝ zakoÄąâ€žczone. Powiedz 'nowe zamÄ‚Ĺ‚wienie', aby zaczĂ„â€¦Ă„â€ˇ od poczĂ„â€¦tku.",
                        meta: { source: 'guard_lock' },
                        context: getSession(activeSessionId) || sessionContext
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
                return this.createErrorResponse('unknown_domain', 'Nie wiem jak to obsÄąâ€šuÄąÄ˝yĂ„â€ˇ (bÄąâ€šĂ„â€¦d domeny).');
            }

            // FIX A4: SANITIZE LOCATION before find_nearby dispatch
            if (context.intent === 'find_nearby' && context.entities?.location) {
                const rawLocation = context.entities.location;
                context.entities.location = sanitizeLocation(rawLocation, session);
                if (context.entities.location !== rawLocation) {
                    BrainLogger.pipeline(`Ä‘ĹşÂ§Ä… LOCATION_SANITIZED: "${rawLocation}" Ă˘â€ â€™ "${context.entities.location}"`);
                }
            }

            const { domainHandlers, handler } = HandlerDispatcher.resolve({
                handlers: this.handlers,
                context,
            });
            if (!domainHandlers[context.intent]) {
                console.log('[KROK5-DEBUG] missing handler', JSON.stringify({ intent: context.intent, domain: context.domain, entities: context.entities || null }));
            }
            context.trace.push(`handler:${context.intent}`);
            const domainResponse = await HandlerDispatcher.executeTransactional({
                handler,
                context,
                applyContextUpdates: !IS_SHADOW ? (contextUpdates) => {
                    updateSession(activeSessionId, contextUpdates);
                } : null,
            });

            // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â
            // LOCATION COMMIT: Write entities.location to session BEFORE surface detection
            // Prevents ASK_LOCATION from firing when handler already used the location
            // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â
            if (context.intent === 'find_nearby' && context.entities?.location && !IS_SHADOW) {
                const confirmedLocation = context.entities.location;
                BrainLogger.pipeline(`Ä‘Ĺşâ€śĹ¤ LOCATION_COMMIT: "${confirmedLocation}" Ă˘â€ â€™ session`);
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

            // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â
            // DIALOG SURFACE LAYER: Transform structured facts to natural Polish
            // Pipeline is SSoT, Surface is presentation only
            // Detect actionable cases and render appropriate reply
            // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â
            const detectedSurface = detectSurface(domainResponse, context);

            if (detectedSurface) {
                const surfaceResult = renderSurface(detectedSurface);

                // Ä‘ĹşĹ˝â„˘ÄŹÂ¸Ĺą PhraseGenerator: LLM paraphrasing with template fallback
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
                            BrainLogger.pipeline(`Ä‘ĹşĹ˝â„˘ÄŹÂ¸Ĺą PhraseGenerator: paraphrased to "${finalReply.substring(0, 50)}..."`);
                        }
                    } catch (phraseErr) {
                        // Fallback to template (determinism preserved)
                        BrainLogger.pipeline(`Ä‘ĹşĹ˝â„˘ÄŹÂ¸Ĺą PhraseGenerator fallback: ${phraseErr.message}`);
                    }
                }

                // Override reply with rendered/paraphrased text, keep structured data
                domainResponse.reply = finalReply;
                domainResponse.ssml = ssml;
                domainResponse.uiHints = surfaceResult.uiHints;

                BrainLogger.pipeline(`Ä‘ĹşĹ˝Â¨ SurfaceRenderer: ${detectedSurface.key} Ă˘â€ â€™ "${finalReply.substring(0, 50)}..."`);

                // --- Event Logging: Surface Rendered ---
                if (EXPERT_MODE && !IS_SHADOW) {
                    EventLogger.logEvent(activeSessionId, 'surface_rendered', {
                        surfaceKey: detectedSurface.key,
                        replyPreview: finalReply?.substring(0, 100),
                        usedPhraseGenerator: finalReply !== surfaceResult.reply
                    }, null, 'dialog').catch(() => { });
                }

                // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â
                // DIALOG STACK: Push rendered surface for BACK/REPEAT navigation
                // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â
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
            // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â
            // FIX 4: LIGHT PHASE TRACKING (post-handler, post-contextUpdates)
            // Phase is now calculated AFTER:
            //   1) ICM gate determined finalIntent (variable `intent` at this point)
            //   2) handler.execute() ran (may have set currentRestaurant, etc.)
            //   3) contextUpdates were applied to session (state is now fully updated)
            // This prevents conversationPhase='restaurant_selected' while
            // currentRestaurant is still null.
            // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â
            if (!IS_SHADOW) {
                // Read updated session state AFTER contextUpdates were applied
                const updatedSessionContext = getSession(activeSessionId) || sessionContext;

                let newPhase = calculatePhase(
                    intent,                                              // finalIntent: post-ICM
                    updatedSessionContext.conversationPhase || 'idle', // current phase from updated session
                    source
                );

                // Ä‘Ĺşâ€Â¨Ă˘â‚¬Ĺ¤Ä‘Ĺşâ€ťÂ§ BACKEND-SIDED CART INSPECTION (Fix "Dodatkowo: JeÄąâ€şli restauracja nie istnieje w session, wyciĂ„â€¦gnĂ„â€¦Ă„â€ˇ z cart[0]")
                const requestBody = options?.requestBody || {};
                const cartMeta = requestBody.meta?.state?.cart;

                if (newPhase === 'ordering' && cartMeta?.items?.length > 0) {
                    if (!updatedSessionContext.currentRestaurant) {
                        const fallbackId = cartMeta.restaurantId || cartMeta.items[0].restaurantId || cartMeta.items[0].restaurant_id;
                        const fallbackName = cartMeta.restaurantName || cartMeta.items[0].restaurantName || cartMeta.items[0].restaurant?.name || 'Nieznana restauracja';

                        if (fallbackId || fallbackName) {
                            BrainLogger.pipeline(`Ä‘Ĺşâ€şË‡ÄŹÂ¸Ĺą PHASE_SAFETY_GUARD: ordering z koszykiem > 0, przywrÄ‚Ĺ‚cono currentRestaurant z koszyka (${fallbackName})`);
                            updatedSessionContext.currentRestaurant = { id: fallbackId, name: fallbackName };
                        }
                    }
                }

                // Ä‘Ĺşâ€şË‡ÄŹÂ¸Ĺą SAFETY GUARD: restaurant_selected requires currentRestaurant to be set.
                // If handler did NOT actually persist a restaurant (e.g. select failed) AND we didn't recover from cart,
                // fall back to 'idle' to prevent phase/state desync.
                if (newPhase === 'restaurant_selected' && !updatedSessionContext?.currentRestaurant) {
                    BrainLogger.pipeline(`Ă˘ĹˇÂ ÄŹÂ¸Ĺą PHASE_SAFETY_GUARD: restaurant_selected requested but currentRestaurant=null Ă˘â€ â€™ fallback to 'idle'`);
                    newPhase = 'idle';
                }

                if (newPhase !== updatedSessionContext.conversationPhase) {
                    updateSession(activeSessionId, { conversationPhase: newPhase });
                    BrainLogger.pipeline(`Ä‘Ĺşâ€śĹ¤ PHASE_TRANSITION: ${updatedSessionContext.conversationPhase || 'idle'} Ă˘â€ â€™ ${newPhase}`);
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
                        confidence,
                        guard_trace: executedGuardNames,
                        pipeline_trace: context.trace,
                    },
                    mockContextUpdates: domainResponse.contextUpdates,
                    rawResponse: domainResponse
                };
            }

            // 4.5 Synthesis (Expert Layer Ă˘â‚¬â€ť dev mode only)
            devLog(`Ä‘ĹşĹşĹ PIPELINE FINAL REPLY [${context.intent}]:`, JSON.stringify(domainResponse.reply)?.substring(0, 120));
            let speechText = domainResponse.reply;
            let audioContent = null;
            let stylingMs = 0;
            let ttsMs = 0;

            if ((EXPERT_MODE || options.stylize) && domainResponse.reply) {
                // STYLIZATION GUARD: Skip for data-heavy intents and numbered lists
                const SKIP_STYLIZATION = new Set(['find_nearby', 'menu_request', 'confirm_order', 'show_menu']);
                const hasNumberedList = /\d+\.\s/.test(domainResponse.reply);
                if (SKIP_STYLIZATION.has(intent) || hasNumberedList) {
                    devLog(`Ä‘ĹşĹ˝Â¨ STYLIZATION_SKIPPED: intent=${intent}, hasList=${hasNumberedList}`);
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
                    BrainLogger.pipeline(`Ă˘Ĺ›â€šÄŹÂ¸Ĺą Smart TTS Restaurant Summary: "${speechPartForTTS.substring(0, 50)}..."`);
                }
            } else if (domainResponse?.menuItems?.length) {
                const summary = buildMenuSummaryForTTS(
                    domainResponse.menuItems
                );
                if (summary) {
                    speechPartForTTS = summary;
                    BrainLogger.pipeline(`Ă˘Ĺ›â€šÄŹÂ¸Ĺą Smart TTS Menu Summary: "${speechPartForTTS.substring(0, 50)}..."`);
                }
            }

            // Respect options or default to false
            const wantsTTS = options.includeTTS === true;
            const hasReply = domainResponse.should_reply !== false; // Default true
            const ttsEnabled = config?.tts_enabled === true; // Strict check: defaults to false if undefined or null, only true if explicitly true

            if (hasReply && (wantsTTS || EXPERT_MODE) && ttsEnabled) {
                if (speechPartForTTS) {
                    try {
                        // Ä‘Ĺşâ€ťĹ  TTS: Odtwarzamy caÄąâ€še wygenerowane streszczenie (celowo wyÄąâ€šĂ„â€¦czone chunkowanie)
                        const ttsText = speechPartForTTS;

                        const t0 = Date.now();
                        audioContent = await playTTS(ttsText, options.ttsOptions || {});
                        ttsMs = Date.now() - t0;

                        BrainLogger.pipeline(`Ä‘Ĺşâ€ťĹ  TTS Generated: "${ttsText.substring(0, 30)}..." (${ttsMs}ms)`);
                    } catch (err) {
                        BrainLogger.pipeline(`Ă˘ĹĄĹš TTS failed: ${err.message}`);
                    }
                }
            }

            const totalLatency = Date.now() - startTime;
            // 5. Response Synthesis (Legacy Parity)
            const { response, restaurants, menuItems } = ResponseBuilder.build({
                domainResponse,
                activeSessionId,
                speechText,
                speechPartForTTS,
                audioContent,
                intent,
                source,
                totalLatency,
                stylingMs,
                ttsMs,
                getSession,
            });

            response.meta = {
                ...(response.meta || {}),
                guard_trace: executedGuardNames,
                pipeline_trace: context.trace,
            };

            // ── Reco V1 ──────────────────────────────────────────────────────
            // Graceful: any error keeps existing behavior (recommendations=[])
            response.recommendations = [];
            if (process.env.RECO_V1_ENABLED === 'true' && menuItems?.length) {
                try {
                    const targetItems = context?.nluResult?.slots?.items
                        || context?.nluResult?.targetItems
                        || [];
                    response.recommendations = getRecommendations(menuItems, {
                        intent,
                        targetItems,
                        topN: 5,
                    });
                    if (response.recommendations.length > 0) {
                        recoTelemetry.logShown(activeSessionId, response.recommendations).catch(() => {});
                    }
                } catch (e) {
                    if (process.env.RECO_V1_DEBUG === 'true') {
                        console.warn('[RECO_V1] scoring error:', e.message);
                    }
                }
            }
            // ─────────────────────────────────────────────────────────────────

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

            // Ä‘ĹşÂ§Â  Record assistant turn + cache entities (passive memory)
            if (!IS_SHADOW) {
                pushAssistantTurn(sessionContext, speechText, detectedSurface?.key, { restaurants, menuItems });
                if (restaurants?.length) cacheRestaurants(sessionContext, restaurants);
                if (menuItems?.length) cacheItems(sessionContext, menuItems);
            }

            if (!IS_SHADOW) {
                BrainPipeline._inFlight.delete(inflightKey);
                devLog(`Ă˘ĹąÄ…ÄŹÂ¸Ĺą  [Pipeline] DONE  ${requestId} | intent=${intent} | source=${source} | ${Date.now() - startTime}ms`);
            }

            // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â
            // ENGINE_MODE RESPONSE SANITIZER
            // stable/strict: strip debug meta, session dumps, turn_ids
            // dev: full response passthrough
            // Ă˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘ÂĂ˘â€˘Â
            return sanitizeResponse(response);

        } catch (error) {
            BrainLogger.pipeline('Error:', error.message);
            if (!IS_SHADOW) BrainPipeline._inFlight.delete(inflightKey);
            return this.createErrorResponse('internal_error', 'CoÄąâ€ş poszÄąâ€šo nie tak w moich obwodach.');
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
 * Key: `${sessionId}::${text}` Ă˘â‚¬â€ť prevents double intent resolution
 * for the same message sent concurrently (React StrictMode, retry bugs, etc.)
 */
BrainPipeline._inFlight = new Set();


