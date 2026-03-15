/**
 * Core Pipeline Orchestrator (V2)
 * Odpowiada za przepĹ‚yw danych: Request -> Hydration -> NLU -> Domain -> Response
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

// đź§  Passive Memory Layer (read-only context, no FSM impact)
import { initTurnBuffer, pushUserTurn, pushAssistantTurn } from '../memory/TurnBuffer.js';
import { initEntityCache, cacheRestaurants, cacheItems } from '../memory/EntityCache.js';

// đźŽ™ď¸Ź Phrase Generator (optional LLM paraphrasing, fallback to templates)
import { generatePhrase } from '../dialog/PhraseGenerator.js';

// đź”Š TTS Chunking (stream first sentence, barge-in support)
import { getFirstChunk, createBargeInController } from '../tts/TtsChunker.js';

// đź›ˇď¸Ź Conversation Guards (UX improvements, no FSM changes)
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

// đźŤ˝ď¸Ź Dish Canonicalization (alias resolution before NLU)
import { canonicalizeDish } from '../nlu/dishCanon.js';

// đź”Š Phonetic Dish Matcher (STT error recovery before NLU)
import { matchDishPhonetic } from '../nlu/phoneticDishMatch.js';

// đź“˘ Intelligent TTS Summaries
function buildRestaurantSummaryForTTS(restaurants, location) {
    if (!restaurants || restaurants.length === 0) return null;

    const count = restaurants.length;

    const sample = restaurants
        .slice(0, 3)
        .map(r => r.name)
        .join(', ');

    return `ZnalazĹ‚am ${count} miejsc${location ? ' w ' + location : ''}. MiÄ™dzy innymi: ${sample}. KtĂłrÄ… wybierasz?`;
}

function buildMenuSummaryForTTS(menuItems) {
    if (!menuItems || menuItems.length === 0) return null;

    const categories = [...new Set(menuItems.map(i => i.category).filter(Boolean))];

    const hasVege = menuItems.some(i => i.is_vege);
    const hasSpicy = menuItems.some(i => i.spicy);

    let summary = "W karcie sÄ… m.in. ";

    if (categories.length > 0) {
        summary += categories.join(', ');
    }

    if (hasVege && !summary.includes('wegetariaĹ„skie')) summary += ", opcje wegetariaĹ„skie";
    if (hasSpicy && !summary.includes('ostre')) summary += ", dania ostre";

    // Deduplicate base_name and use it for examples
    const baseNames = [...new Set(menuItems.map(i => i.base_name || i.name).filter(Boolean))];
    const sample = baseNames.slice(0, 3).join(', ');

    if (sample) {
        summary += `. Na przykĹ‚ad: ${sample}. Co wybierasz?`;
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
        'poka� restauracje',
        'znajdz restauracje',
        'znajd� restauracje',
        'dostepne restauracje',
        'dost�pne restauracje',
        'w poblizu',
        'w pobli�u',
        'gdzie moge zjesc',
        'gdzie mog� zje��',
        'gdzie zjem'
    ].some((phrase) => normalized.includes(phrase));
}
// Mapa handlerĂłw domenowych (BezpoĹ›rednie mapowanie)
// Kluczem jest "domain", a wewnÄ…trz "intent"

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
                        reply: 'Co polecam? W okolicy masz Ĺ›wietne opcje! Powiedz gdzie szukaÄ‡.',
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
                health_check: { execute: async () => ({ reply: 'System dziaĹ‚a', meta: {} }) },
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
     * GĹ‚Ăłwny punkt wejĹ›cia dla kaĹĽdego zapytania
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

        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        // SINGLE-ROUTING INVARIANT: In-flight deduplication guard
        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        const inflightKey = `${sessionId}::${text.trim()}`;
        if (!IS_SHADOW) {
            if (BrainPipeline._inFlight.has(inflightKey)) {
                console.warn(`đźš« [Pipeline] DUPLICATE_REQUEST blocked: ${sessionId} â†’ "${text.trim().substring(0, 40)}". Single-routing invariant enforced.`);
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
            return this.createErrorResponse('brak_tekstu', 'Nie usĹ‚yszaĹ‚am, moĹĽesz powtĂłrzyÄ‡?');
        }

        const ENGINE_MODE = getEngineMode();
        const EXPERT_MODE = ENGINE_MODE === 'dev'; // backward compat alias
        const requestId = `${sessionId.substring(0, 8)}-${startTime.toString(36)}`;
        devLog(`â–¶ď¸Ź  [Pipeline] START ${requestId} | session=${sessionId} | text="${text.trim().substring(0, 60)}" | mode=${ENGINE_MODE}`);

        // --- Event Logging: Received (dev only) ---
        if (EXPERT_MODE && !IS_SHADOW) {
            const initialWorkflowStep = this._mapWorkflowStep('request_received');
            EventLogger.logConversation(sessionId).catch(() => { });
            EventLogger.logEvent(sessionId, 'request_received', { text }, null, initialWorkflowStep).catch(() => { });
        }

        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        // CONVERSATION ISOLATION: Auto-create new session if previous was closed
        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        const hydratedSession = SessionHydrator.hydrate({
            sessionId,
            activeSessionId,
            isShadow: IS_SHADOW,
            getOrCreateActiveSession,
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

        // đź§  Initialize Passive Memory (no FSM impact)
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

            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            // 1. DIALOG NAVIGATION GUARD (Meta-Intent Layer)
            // Handles: BACK, REPEAT, NEXT, STOP
            // SHORT-CIRCUITS pipeline if matched - does NOT touch FSM
            // Config-aware: respects dialog_navigation_enabled and fallback_mode
            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            const navResult = dialogNavGuard(text, sessionContext, config);

            if (navResult.handled) {
                BrainLogger.pipeline(`đź”€ DIALOG NAV: ${navResult.response.intent} - skipping NLU/FSM`);

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

            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            // PRE-NLU CONTEXT OVERRIDE: Fast-track list selections
            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            let intentResult;
            const executedGuardNames = [];

            const executeGuardChain = (intentContext, guardImplementations, pipelineState = {}) => {
                const state = { ...pipelineState, guardImplementations };

                for (const guard of GUARD_CHAIN) {
                    executedGuardNames.push(guard.name);

                    intentContext = guard(intentContext, state) || intentContext;
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
                BrainLogger.pipeline(`âšˇ PRE-NLU OVERRIDE: Bypassing NLU for list selection -> select_restaurant`);
                intentResult = {
                    intent: 'select_restaurant',
                    domain: 'food',
                    confidence: 1.0,
                    source: 'context_override',
                    entities: {}
                };
            } else {
                // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
                // PRE-NLU: Dish Canonicalization (resolve aliases before NLU)
                // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
                const canonResult = canonicalizeDish(text, sessionContext);
                if (canonResult && (typeof canonResult === 'string') && canonResult !== text) {
                    BrainLogger.pipeline(`đź”¤ DISH_CANON: "${text}" â†’ "${canonResult}"`);
                    context.canonicalDish = canonResult;
                    text = canonResult; // Override text for NLU
                }

                // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
                // PRE-NLU: Phonetic Dish Matcher (STT error recovery)
                // Runs AFTER canon so canon has first priority.
                // If a phonetic match is found, text is replaced before NLU.
                // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
                const hasExplicitQuantityPrefix = /^\s*(?:\d+|jeden|jedna|jedno|dwa|dwie|trzy|cztery|pi[e�]c|sze[s�]c|siedem|osiem|dziewi[e�]c|dziesi[e�]c|kilka|par[e�])\b/i.test(text);
                if (sessionContext?.last_menu?.length > 0 && !isExplicitRestaurantNavigation(text) && !hasExplicitQuantityPrefix) {
                    const phoneticMatch = matchDishPhonetic(text, sessionContext.last_menu);
                    if (phoneticMatch) {
                        BrainLogger.pipeline(`đź”Š PHONETIC_MATCH: "${text}" â†’ "${phoneticMatch}"`);
                        text = phoneticMatch;
                        context.text = phoneticMatch;
                    }
                }

                // 2. NLU Decision
                intentResult = await this.nlu.detect(context);
            }

            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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
                        BrainLogger.pipeline(`🛡️ EXPECTED_CONTEXT_OVERRIDE: "${intentContext.intent}" → "${sessionContext.expectedContext}" (user said "${intentContext.text}")`);
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
            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            if (intentResult?.intent === 'greeting') {
                BrainLogger.pipeline(`đź‘‹ GREETING DETECTED: Returning friendly greeting`);
                const replyText = 'CzeĹ›Ä‡! W czym mogÄ™ pomĂłc?';
                let audioContent = null;
                const wantsTTS = options?.includeTTS === true;
                const EX_MODE = process.env.EXPERT_MODE === 'true'; // Pipeline constant
                const ttsEnabled = config?.tts_enabled === true;

                if ((wantsTTS || EX_MODE) && ttsEnabled) {
                    try {
                        const t0 = Date.now();
                        audioContent = await playTTS(replyText, options?.ttsOptions || {});
                        BrainLogger.pipeline(`đź”Š TTS Gen (Greeting): "${replyText}" (${Date.now() - t0}ms)`);
                    } catch (err) {
                        BrainLogger.pipeline(`âťŚ TTS failed: ${err.message}`);
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

            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            // RESTAURANT HOURS HANDLER
            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

            if (intentResult?.intent === 'restaurant_hours') {
                const currentRestaurant = sessionContext?.lastRestaurant || sessionContext?.currentRestaurant;

                if (!currentRestaurant) {
                    return {
                        ok: true,
                        session_id: activeSessionId,
                        intent: 'restaurant_hours',
                        reply: 'KtĂłrej restauracji mam sprawdziÄ‡ godziny?',
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

            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            // UNKNOWN INTENT SAFE FALLBACK
            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

            if (intentResult?.intent === 'UNKNOWN_INTENT') {

                const phase = sessionContext?.conversationPhase || 'idle';

                let reply;

                if (phase === 'ordering') {
                    reply = 'Nie jestem pewna, o co chodzi. Kontynuujemy zamĂłwienie czy chcesz coĹ› zmieniÄ‡?';
                } else if (phase === 'restaurant_selected') {
                    reply = 'MoĹĽesz wybraÄ‡ coĹ› z menu albo zapytaÄ‡ o szczegĂłĹ‚y.';
                } else {
                    reply = 'MogÄ™ pokazaÄ‡ restauracje w pobliĹĽu albo pomĂłc w wyborze dania.';
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

            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            // SINGLE ROUTING INVARIANT â€” hard guard
            // If this fires, a classic path leaked through the NLU layer.
            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            if (intentResult?.source?.includes('classic')) {
                console.error('đźš« CLASSIC_ROUTE_INVARIANT_VIOLATED', {
                    source: intentResult.source,
                    intent: intentResult.intent,
                    sessionId: activeSessionId
                });
                // Downgraded to warn because smartIntent allows classic source bypass
                console.warn(`CLASSIC ROUTE DETECTED â€” ${intentResult.source}`);
            }

            let { intent, domain, confidence, source, entities } = intentResult;

            // --- Event Logging: NLU Result ---
            if (EXPERT_MODE && !IS_SHADOW) {
                EventLogger.logEvent(activeSessionId, 'nlu_result', {
                    intent, domain, confidence, source,
                    entities: entities ? Object.keys(entities) : []
                }, confidence, 'nlu').catch(() => { });
            }

            // đź§  Record user turn (passive memory, no FSM impact)
            if (!IS_SHADOW) {
                pushUserTurn(sessionContext, text, { intent, entities });
            }

            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            // CONFIDENCE FLOOR: Low-confidence intents trigger disambiguation
            // Instead of guessing wrong, ask the user what they meant
            // Skip for rule-based sources (guards, overrides) which are always confident
            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            if (
                confidence < 0.5 &&
                domain === 'food' &&
                !CONFIDENT_SOURCES.includes(source) &&
                !sessionContext?.pendingOrder
            ) {
                const hasRestaurant = !!(sessionContext?.currentRestaurant);
                const disambiguationReply = hasRestaurant
                    ? `Nie jestem pewna, o co chodzi. Czy chcesz zamĂłwiÄ‡ coĹ› z menu ${sessionContext.currentRestaurant.name}?`
                    : 'Nie bardzo rozumiem. MogÄ™ pokazaÄ‡ restauracje w pobliĹĽu albo pomĂłc w zamĂłwieniu.';

                BrainLogger.pipeline(`đź¤” CONFIDENCE_FLOOR: ${intent} (${(confidence * 100).toFixed(0)}%) â†’ disambiguation`);

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

            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            // TRANSACTION LOCK: Active ordering prevents foreign intents
            // If user is mid-transaction (pendingOrder or awaiting confirmation),
            // only ordering-related intents are allowed through.
            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

            if (
                (sessionContext?.pendingOrder || sessionContext?.expectedContext === 'confirm_add_to_cart') &&
                !TRANSACTION_ALLOWED_INTENTS.includes(intent)
            ) {
                // If the user explicitly asks to find a restaurant or esc lock, allow it and clear pending
                const isExplicitEscape = EXPLICIT_ESCAPE_SOURCES.includes(source) ||
                    ['find_nearby', 'select_restaurant', 'show_menu', 'cancel_order', 'cancel'].includes(intent);

                if (isExplicitEscape && confidence >= 0.8) {
                    BrainLogger.pipeline(`đź”“ TRANSACTION_LOCK: User explicitly escaped lock with intent: ${intent} (source: ${source})`);
                    // Session cleanup is owned by handlers (guard path remains pure).
                } else {
                    const lockedIntent = sessionContext.expectedContext || 'create_order';
                    BrainLogger.pipeline(`đź”’ TRANSACTION_LOCK: "${intent}" blocked mid-transaction â†’ "${lockedIntent}"`);
                    intent = lockedIntent;
                    source = 'transaction_lock_override';
                    domain = 'ordering';
                }
            }

            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            // FIX 2: RESTAURANT SEMANTIC RECOVERY
            // Recover restaurant from full text if NLU missed the entity
            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            if (!entities?.restaurant && text && sessionContext.entityCache?.restaurants) {
                const recovered = await recoverRestaurantFromFullText(
                    text,
                    sessionContext.entityCache.restaurants
                );

                if (recovered) {
                    entities = entities || {};
                    entities.restaurant = recovered.name;
                    entities.restaurantId = recovered.id;
                    BrainLogger.nlu(`đź§  SEMANTIC_RESTAURANT_RECOVERY: Detected "${recovered.name}" from full text`);
                }
            }

            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            // FIX A1: MENU RESOLVER BRIDGE
            // Fuzzy-match restaurant from menu-request phrasing, BEFORE ICM gate
            // Sets entities + session lock so ICM lets menu_request through cleanly
            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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
                BrainLogger.pipeline(`đź”Ť MENU_RESOLVER_BRIDGE: locked to "${menuResolvedRestaurant.name}", forcing menu_request`);
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

            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            // FIX: allow implicit dish ordering without keyword
            // If we are in a restaurant context and NLU is unknown, try menu disambiguation.
            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            if (intent === 'unknown' && sessionContext?.currentRestaurant?.id) {
                try {
                    const resolution = await resolveMenuItemConflict(text, {
                        restaurant_id: sessionContext.currentRestaurant.id
                    });

                    if (resolution?.status === DISAMBIGUATION_RESULT.ADD_ITEM) {
                        intent = 'create_order';
                        domain = 'food';
                        source = 'implicit_dish_guard';
                        BrainLogger.pipeline('đźź˘ IMPLICIT_DISH_GUARD: unknown â†’ create_order via menu match');
                    }
                } catch (err) {
                    BrainLogger.pipeline(`đź›ˇď¸Ź IMPLICIT_DISH_GUARD failed: ${err.message}`);
                }
            }

            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            // ICM GATE: Validate FSM state requirements BEFORE executing intent
            // This ensures NO intent (regex/legacy/LLM) can bypass FSM
            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            const stateCheck = checkRequiredState(intent, sessionContext, entities);
            const originalIntent = intent; // Remember for soft dialog bridge

            if (!stateCheck.met) {
                // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
                // SOFT DIALOG BRIDGE (KROK 1 & 4): Instead of hard reset, show dialog
                // If user wants menu/order but no restaurant, and we have candidates â†’ ASK
                // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
                const hasRestaurantsList = sessionContext?.last_restaurants_list?.length > 0;

                if (originalIntent === 'menu_request' && hasRestaurantsList) {
                    // User wants menu, we have restaurants â†’ ask which one
                    BrainLogger.pipeline(`đźŚ‰ SOFT DIALOG BRIDGE: menu_request blocked, showing restaurant picker`);

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
                    // User wants to order, we have restaurants â†’ ask which one
                    BrainLogger.pipeline(`đźŚ‰ SOFT DIALOG BRIDGE: create_order blocked, showing restaurant picker`);

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
                BrainLogger.pipeline(`đź›ˇď¸Ź ICM GATE: ${originalIntent} blocked (${stateCheck.reason}). Fallback â†’ ${fallbackIntent}`);

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

            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            // CART MUTATION GUARD: Only whitelisted intents can mutate cart
            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            if (mutatesCart(intent) && !CART_MUTATION_WHITELIST.includes(intent)) {
                BrainLogger.pipeline(`đź›ˇď¸Ź CART GUARD: ${intent} tried to mutate cart - BLOCKED`);
                intent = 'find_nearby';
                source = 'cart_mutation_blocked';
            }

            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            // FIX 1: CONTEXT-AWARE LEGACY UNLOCK (SMART SAFE)
            // If restaurant context exists, allow ordering even from legacy source
            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            if (source === 'legacy_hard_blocked') {
                if (hasLockedRestaurant(sessionContext)) {
                    BrainLogger.pipeline('đźź˘ SMART_SAFE_UNLOCK: Legacy ordering allowed (restaurant locked)');
                    intent = 'create_order';
                    source = 'smart_safe_unlock';
                } else {
                    BrainLogger.pipeline('đź›ˇď¸Ź HARD_BLOCK: No restaurant context â†’ fallback idle');
                    intent = 'find_nearby';
                }
            }

            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            // FIX 3: CONVERSATION CONTINUITY GUARD
            // Prevent idle reset when user mentions dish in ordering context
            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            if (
                intent === 'find_nearby' &&
                isOrderingContext(sessionContext) &&
                containsDishLikePhrase(text) &&
                !entities?.location  // EXEMPTION: explicit idle always wins
            ) {
                BrainLogger.pipeline('đźź˘ CONTINUITY_GUARD_TRIGGERED: Preventing idle reset â†’ create_order');
                intent = 'create_order';
                source = 'continuity_guard';
            }

            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            // FIX A3: STRONG ORDERING CONTINUITY GUARD
            // If user has a locked restaurant AND uses ordering phrases, NEVER drop to find_nearby
            // This runs AFTER FIX 3 to catch cases with explicit ordering verbs (skuszÄ™, poprosÄ™, etc.)
            // SAFETY: Does NOT override confirm_order
            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            if (
                intent === 'find_nearby' &&
                sessionContext?.currentRestaurant &&
                containsOrderingIntent(text) &&
                !entities?.location  // EXEMPTION: explicit location = user wants new idle
            ) {
                BrainLogger.pipeline('đźź˘ STRONG_CONTINUITY_GUARD: ordering phrase + locked restaurant â†’ create_order');
                intent = 'create_order';
                source = 'strong_continuity_guard';
            }

            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            // FIX 4: LIGHT PHASE TRACKING (MOVED â€” executed after handler + contextUpdates)
            // Phase is computed AFTER handler execution and contextUpdates are applied,
            // so it reflects the true updated session state (e.g. currentRestaurant from
            // SelectRestaurantHandler). See phase calculation block below.
            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            // FLOATING pendingOrder GUARD: Clear stale transaction state
            // If intent diverged from ordering, wipe ghost pendingOrder
            // Prevents old "tak" from adding stale items to cart
            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            if (sessionContext?.pendingOrder && !ORDER_INTENTS_CLEANUP.includes(intent)) {
                BrainLogger.pipeline(`đź§ą FLOATING_ORDER_CLEANUP: Cleared stale pendingOrder (intent=${intent})`);
                if (!IS_SHADOW) {
                    updateSession(activeSessionId, {
                        pendingOrder: null,
                        expectedContext: null
                    });
                }
                sessionContext.pendingOrder = null;
                sessionContext.expectedContext = null;
            }

            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            // SAFETY TIMEOUT: Clear pendingOrder older than 60 seconds
            // Prevents ghost transactions from lingering across long pauses
            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            const PENDING_ORDER_TIMEOUT_MS = 60_000;
            if (sessionContext?.pendingOrder?.createdAt) {
                const age = Date.now() - sessionContext.pendingOrder.createdAt;
                if (age > PENDING_ORDER_TIMEOUT_MS) {
                    BrainLogger.pipeline(`âŹ° PENDING_ORDER_TIMEOUT: Cleared after ${Math.round(age / 1000)}s`);
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

            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            // IDLE RESET: find_nearby resets restaurant context
            // SAFETY: Skip reset if intent came from a blocked source (preserve context)
            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            const isFromBlock = source?.endsWith('_blocked') || source === 'icm_fallback';
            if (intent === 'find_nearby' && !IS_SHADOW && !isFromBlock) {
                updateSession(activeSessionId, {
                    currentRestaurant: null,
                    lastRestaurant: null,
                    lockedRestaurantId: null
                });
                BrainLogger.pipeline('đź”„ IDLE RESET: Cleared restaurant context for find_nearby');
            }

            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            // CHOOSE_RESTAURANT DIALOG: When ambiguous restaurants, show picker
            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            if (intent === 'choose_restaurant' && entities?.options?.length > 0) {
                BrainLogger.pipeline(`đźŚ‰ CHOOSE_RESTAURANT: Showing picker for ${entities.options.length} restaurants`);

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
            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            // PRE-HANDLER CONTEXT OVERRIDE: Fast-track clarify_order with location
            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            if (intent === 'clarify_order' && !sessionContext?.currentRestaurant && (sessionContext?.conversationPhase === 'idle' || !sessionContext?.conversationPhase)) {
                try {
                    const { supabase } = await import('../../_supabase.js');
                    const { data } = await supabase.from('restaurants').select('city');
                    if (data) {
                        const cities = [...new Set(data.map(d => d.city).filter(Boolean))].map(c => c.toLowerCase());
                        const lowerText = text.toLowerCase();
                        if (cities.some(city => lowerText.includes(city))) {
                            BrainLogger.pipeline(`âšˇ PRE-HANDLER OVERRIDE: Location found in clarify_order -> find_nearby`);
                            intent = 'find_nearby';
                            source = 'context_override_location';
                        }
                    }
                } catch (e) {
                    BrainLogger.pipeline(`đź›ˇď¸Ź PRE-HANDLER OVERRIDE error: ${e.message}`);
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
                    BrainLogger.pipeline('âś¨ UX Guard 1: Menu-scoped ordering. Upgrading find_nearby -> create_order with currentRestaurant.');
                    context.intent = 'create_order';
                    context.source = 'menu_scoped_order';
                    context.resolvedRestaurant = session.currentRestaurant || session.lastRestaurant;
                }
            } else if (isBlocked) {
                BrainLogger.pipeline(`đź›ˇď¸Ź UX Guard 1 SKIPPED: Intent was blocked (source: ${context.source})`);
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
                    BrainLogger.pipeline(`âś¨ UX Guard 2: Fuzzy match detected. Asking confirmation for ${session.currentRestaurant.name}`);
                    return {
                        session_id: activeSessionId,
                        reply: `Czy chodziĹ‚o Ci o ${session.currentRestaurant.name}?`,
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
                const confirmWords = /\b(tak|potwierdzam|ok|dobra|moĹĽe byÄ‡|dawaj|pewnie|jasne|super|Ĺ›wietnie)\b/i;
                if (confirmWords.test(normalized)) {
                    const targetIntent = session.expectedContext; // Dynamically use the context name as intent name
                    BrainLogger.pipeline(`đź›ˇď¸Ź Guard: Context is ${targetIntent} and confirmation word detected. Forcing ${targetIntent}.`);
                    context.intent = targetIntent;
                }
            }

            // Rule: Restaurant Switch Confirmation
            if (session?.expectedContext === 'confirm_restaurant_switch') {
                const normalized = (text || "").toLowerCase();
                const confirmWords = /\b(tak|potwierdzam|ok|dobra|moĹĽe byÄ‡|dawaj|pewnie|jasne|super|Ĺ›wietnie|zmieniaj|wyczyĹ›Ä‡)\b/i;
                const negateWords = /\b(nie|pocz[eÄ™]kaj|stop|anuluj|nie\s+chc[eÄ™]|zostaw)\b/i;

                if (confirmWords.test(normalized)) {
                    BrainLogger.pipeline('đź›ˇď¸Ź Guard: Context is confirm_restaurant_switch and confirmation word detected. Executing clear + switch.');

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
                    BrainLogger.pipeline('đź›ˇď¸Ź Guard: Context is confirm_restaurant_switch and negation word detected. Cancelling switch.');
                    return {
                        ok: true,
                        session_id: activeSessionId,
                        reply: "Dobrze, zostajemy przy obecnym zamĂłwieniu. Co jeszcze chcesz dodaÄ‡?",
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
                const wantsToSee = /\b(pokaz|pokaĹĽ|zobacz|jakie|co)\b/i.test(normalized);
                const wantsChange = /\b(inn[ea]|zmieĹ„|wybierz\s+inne)\b/i.test(normalized);

                if (wantsToSee && !wantsChange) {
                    BrainLogger.pipeline('đź›ˇď¸Ź Guard Rule 4: "Show" verb detected. Upgrading select_restaurant -> menu_request');
                    context.intent = 'menu_request';
                }
            }

            // Rule 2: Early Dish Detection
            if (context.intent === 'create_order') {
                const ent = context.entities || {};
                const normalized = (text || "").toLowerCase();
                const strictOrderVerbs = /\b(zamawiam|wezm[Ä™e]|dodaj|poprosz[Ä™e]|chc[Ä™e])\b/i;
                const hasOrderVerb = strictOrderVerbs.test(normalized);
                const isAffirmationRepeat = context.source === 'ordering_affirmation_repeat';

                if (!hasOrderVerb && !session?.pendingOrder && !session?.expectedContext && !isAffirmationRepeat) {
                    BrainLogger.pipeline('đź›ˇď¸Ź Guard Rule 2: Implicit order without verb. Downgrading to find_nearby/menu_request.');
                    if (ent?.dish || ent?.items?.length) {
                        context.intent = 'menu_request';
                    } else {
                        return {
                            session_id: activeSessionId,
                            reply: "Co chciaĹ‚byĹ› zamĂłwiÄ‡?",
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
                            BrainLogger.pipeline(`đź›ˇď¸Ź Guard Rule 6: Passing potential dish "${stripped}" to handlers despite missing entities.`);
                            // Do NOT return here. Let it pass to OrderHandler which will call parseOrderItems
                        } else {
                            BrainLogger.pipeline('đź›ˇď¸Ź Guard Rule 6: Order intent with no explicit dish. Asking for details.');
                            return {
                                session_id: activeSessionId,
                                reply: "Co dokĹ‚adnie chciaĹ‚byĹ› zamĂłwiÄ‡?",
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
                        reply: "Twoje zamĂłwienie zostaĹ‚o juĹĽ zakoĹ„czone. Powiedz 'nowe zamĂłwienie', aby zaczÄ…Ä‡ od poczÄ…tku.",
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
                return this.createErrorResponse('unknown_domain', 'Nie wiem jak to obsĹ‚uĹĽyÄ‡ (bĹ‚Ä…d domeny).');
            }

            // FIX A4: SANITIZE LOCATION before find_nearby dispatch
            if (context.intent === 'find_nearby' && context.entities?.location) {
                const rawLocation = context.entities.location;
                context.entities.location = sanitizeLocation(rawLocation, session);
                if (context.entities.location !== rawLocation) {
                    BrainLogger.pipeline(`đź§ą LOCATION_SANITIZED: "${rawLocation}" â†’ "${context.entities.location}"`);
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

            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            // LOCATION COMMIT: Write entities.location to session BEFORE surface detection
            // Prevents ASK_LOCATION from firing when handler already used the location
            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            if (context.intent === 'find_nearby' && context.entities?.location && !IS_SHADOW) {
                const confirmedLocation = context.entities.location;
                BrainLogger.pipeline(`đź“Ť LOCATION_COMMIT: "${confirmedLocation}" â†’ session`);
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

            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            // DIALOG SURFACE LAYER: Transform structured facts to natural Polish
            // Pipeline is SSoT, Surface is presentation only
            // Detect actionable cases and render appropriate reply
            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            const detectedSurface = detectSurface(domainResponse, context);

            if (detectedSurface) {
                const surfaceResult = renderSurface(detectedSurface);

                // đźŽ™ď¸Ź PhraseGenerator: LLM paraphrasing with template fallback
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
                            BrainLogger.pipeline(`đźŽ™ď¸Ź PhraseGenerator: paraphrased to "${finalReply.substring(0, 50)}..."`);
                        }
                    } catch (phraseErr) {
                        // Fallback to template (determinism preserved)
                        BrainLogger.pipeline(`đźŽ™ď¸Ź PhraseGenerator fallback: ${phraseErr.message}`);
                    }
                }

                // Override reply with rendered/paraphrased text, keep structured data
                domainResponse.reply = finalReply;
                domainResponse.ssml = ssml;
                domainResponse.uiHints = surfaceResult.uiHints;

                BrainLogger.pipeline(`đźŽ¨ SurfaceRenderer: ${detectedSurface.key} â†’ "${finalReply.substring(0, 50)}..."`);

                // --- Event Logging: Surface Rendered ---
                if (EXPERT_MODE && !IS_SHADOW) {
                    EventLogger.logEvent(activeSessionId, 'surface_rendered', {
                        surfaceKey: detectedSurface.key,
                        replyPreview: finalReply?.substring(0, 100),
                        usedPhraseGenerator: finalReply !== surfaceResult.reply
                    }, null, 'dialog').catch(() => { });
                }

                // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
                // DIALOG STACK: Push rendered surface for BACK/REPEAT navigation
                // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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
            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            // FIX 4: LIGHT PHASE TRACKING (post-handler, post-contextUpdates)
            // Phase is now calculated AFTER:
            //   1) ICM gate determined finalIntent (variable `intent` at this point)
            //   2) handler.execute() ran (may have set currentRestaurant, etc.)
            //   3) contextUpdates were applied to session (state is now fully updated)
            // This prevents conversationPhase='restaurant_selected' while
            // currentRestaurant is still null.
            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            if (!IS_SHADOW) {
                // Read updated session state AFTER contextUpdates were applied
                const updatedSessionContext = getSession(activeSessionId) || sessionContext;

                let newPhase = calculatePhase(
                    intent,                                              // finalIntent: post-ICM
                    updatedSessionContext.conversationPhase || 'idle', // current phase from updated session
                    source
                );

                // đź‘¨â€Ťđź”§ BACKEND-SIDED CART INSPECTION (Fix "Dodatkowo: JeĹ›li restauracja nie istnieje w session, wyciÄ…gnÄ…Ä‡ z cart[0]")
                const requestBody = options?.requestBody || {};
                const cartMeta = requestBody.meta?.state?.cart;

                if (newPhase === 'ordering' && cartMeta?.items?.length > 0) {
                    if (!updatedSessionContext.currentRestaurant) {
                        const fallbackId = cartMeta.restaurantId || cartMeta.items[0].restaurantId || cartMeta.items[0].restaurant_id;
                        const fallbackName = cartMeta.restaurantName || cartMeta.items[0].restaurantName || cartMeta.items[0].restaurant?.name || 'Nieznana restauracja';

                        if (fallbackId || fallbackName) {
                            BrainLogger.pipeline(`đź›ˇď¸Ź PHASE_SAFETY_GUARD: ordering z koszykiem > 0, przywrĂłcono currentRestaurant z koszyka (${fallbackName})`);
                            updatedSessionContext.currentRestaurant = { id: fallbackId, name: fallbackName };
                        }
                    }
                }

                // đź›ˇď¸Ź SAFETY GUARD: restaurant_selected requires currentRestaurant to be set.
                // If handler did NOT actually persist a restaurant (e.g. select failed) AND we didn't recover from cart,
                // fall back to 'idle' to prevent phase/state desync.
                if (newPhase === 'restaurant_selected' && !updatedSessionContext?.currentRestaurant) {
                    BrainLogger.pipeline(`âš ď¸Ź PHASE_SAFETY_GUARD: restaurant_selected requested but currentRestaurant=null â†’ fallback to 'idle'`);
                    newPhase = 'idle';
                }

                if (newPhase !== updatedSessionContext.conversationPhase) {
                    updateSession(activeSessionId, { conversationPhase: newPhase });
                    BrainLogger.pipeline(`đź“Ť PHASE_TRANSITION: ${updatedSessionContext.conversationPhase || 'idle'} â†’ ${newPhase}`);
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

            // 4.5 Synthesis (Expert Layer â€” dev mode only)
            devLog(`đźźŁ PIPELINE FINAL REPLY [${context.intent}]:`, JSON.stringify(domainResponse.reply)?.substring(0, 120));
            let speechText = domainResponse.reply;
            let audioContent = null;
            let stylingMs = 0;
            let ttsMs = 0;

            if ((EXPERT_MODE || options.stylize) && domainResponse.reply) {
                // STYLIZATION GUARD: Skip for data-heavy intents and numbered lists
                const SKIP_STYLIZATION = new Set(['find_nearby', 'menu_request', 'confirm_order', 'show_menu']);
                const hasNumberedList = /\d+\.\s/.test(domainResponse.reply);
                if (SKIP_STYLIZATION.has(intent) || hasNumberedList) {
                    devLog(`đźŽ¨ STYLIZATION_SKIPPED: intent=${intent}, hasList=${hasNumberedList}`);
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
                    BrainLogger.pipeline(`âś‚ď¸Ź Smart TTS Restaurant Summary: "${speechPartForTTS.substring(0, 50)}..."`);
                }
            } else if (domainResponse?.menuItems?.length) {
                const summary = buildMenuSummaryForTTS(
                    domainResponse.menuItems
                );
                if (summary) {
                    speechPartForTTS = summary;
                    BrainLogger.pipeline(`âś‚ď¸Ź Smart TTS Menu Summary: "${speechPartForTTS.substring(0, 50)}..."`);
                }
            }

            // Respect options or default to false
            const wantsTTS = options.includeTTS === true;
            const hasReply = domainResponse.should_reply !== false; // Default true
            const ttsEnabled = config?.tts_enabled === true; // Strict check: defaults to false if undefined or null, only true if explicitly true

            if (hasReply && (wantsTTS || EXPERT_MODE) && ttsEnabled) {
                if (speechPartForTTS) {
                    try {
                        // đź”Š TTS: Odtwarzamy caĹ‚e wygenerowane streszczenie (celowo wyĹ‚Ä…czone chunkowanie)
                        const ttsText = speechPartForTTS;

                        const t0 = Date.now();
                        audioContent = await playTTS(ttsText, options.ttsOptions || {});
                        ttsMs = Date.now() - t0;

                        BrainLogger.pipeline(`đź”Š TTS Generated: "${ttsText.substring(0, 30)}..." (${ttsMs}ms)`);
                    } catch (err) {
                        BrainLogger.pipeline(`âťŚ TTS failed: ${err.message}`);
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

            // đź§  Record assistant turn + cache entities (passive memory)
            if (!IS_SHADOW) {
                pushAssistantTurn(sessionContext, speechText, detectedSurface?.key, { restaurants, menuItems });
                if (restaurants?.length) cacheRestaurants(sessionContext, restaurants);
                if (menuItems?.length) cacheItems(sessionContext, menuItems);
            }

            if (!IS_SHADOW) {
                BrainPipeline._inFlight.delete(inflightKey);
                devLog(`âŹąď¸Ź  [Pipeline] DONE  ${requestId} | intent=${intent} | source=${source} | ${Date.now() - startTime}ms`);
            }

            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            // ENGINE_MODE RESPONSE SANITIZER
            // stable/strict: strip debug meta, session dumps, turn_ids
            // dev: full response passthrough
            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            return sanitizeResponse(response);

        } catch (error) {
            BrainLogger.pipeline('Error:', error.message);
            if (!IS_SHADOW) BrainPipeline._inFlight.delete(inflightKey);
            return this.createErrorResponse('internal_error', 'CoĹ› poszĹ‚o nie tak w moich obwodach.');
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
 * Key: `${sessionId}::${text}` â€” prevents double intent resolution
 * for the same message sent concurrently (React StrictMode, retry bugs, etc.)
 */
BrainPipeline._inFlight = new Set();
