const TEXT_LIMIT = 500;
const SHORT_TEXT_LIMIT = 240;
const REDACTED = '[redacted]';
const UNAVAILABLE = '[unavailable]';
const REDACT_KEY_RE = /audio|pcm|base64|wave|blob|token|secret|api_?key|authorization|password|cookie|bearer|supabase_key|service_role/i;

export function isDebugLiveFlowEnabled() {
    try {
        return String(process.env.DEBUG_LIVE_FLOW || '').trim().toLowerCase() === 'true';
    } catch {
        return false;
    }
}

function compactText(value, max = TEXT_LIMIT) {
    try {
        if (value == null) return null;
        const text = String(value).trim();
        if (!text) return null;
        return text.length > max ? `${text.slice(0, Math.max(0, max - 3))}...` : text;
    } catch {
        return UNAVAILABLE;
    }
}

function normalizeLoose(value = '') {
    try {
        return String(value || '')
            .toLowerCase()
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    } catch {
        return '';
    }
}

function sanitizeValue(value, depth = 0) {
    try {
        if (depth > 3) return '[max_depth]';
        if (value == null) return null;
        if (typeof value === 'string') return compactText(value, TEXT_LIMIT);
        if (typeof value === 'number' || typeof value === 'boolean') return value;
        if (Array.isArray(value)) {
            const out = [];
            const max = Math.min(value.length, 10);
            for (let index = 0; index < max; index += 1) {
                try {
                    out.push(sanitizeValue(value[index], depth + 1));
                } catch {
                    out.push(UNAVAILABLE);
                }
            }
            return out;
        }
        if (typeof value === 'object') {
            const out = {};
            let keys = [];
            try {
                keys = Object.keys(value);
            } catch {
                return UNAVAILABLE;
            }
            for (const key of keys.slice(0, 40)) {
                if (REDACT_KEY_RE.test(key)) {
                    out[key] = REDACTED;
                    continue;
                }
                try {
                    const descriptor = Object.getOwnPropertyDescriptor(value, key);
                    if (descriptor?.get && !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
                        out[key] = UNAVAILABLE;
                        continue;
                    }
                    out[key] = sanitizeValue(value[key], depth + 1);
                } catch {
                    out[key] = UNAVAILABLE;
                }
            }
            return out;
        }
        return compactText(value, SHORT_TEXT_LIMIT);
    } catch {
        return UNAVAILABLE;
    }
}

function withMissing(value, reason) {
    if (value != null && value !== '') return value;
    return { value: null, source_missing_reason: reason };
}

function summarizeCart(cart = {}) {
    try {
        const items = Array.isArray(cart?.items) ? cart.items : [];
        const total = Number(cart?.total);
        return { items: items.length, total: Number.isFinite(total) ? total : 0 };
    } catch {
        return { items: 0, total: 0 };
    }
}

function hasMenuCandidate(session = {}, dish = '') {
    const needle = normalizeLoose(dish);
    if (!needle) return { hasMenu: false, found: false };
    const candidates = [
        ...(Array.isArray(session?.menuItems) ? session.menuItems : []),
        ...(Array.isArray(session?.last_menu) ? session.last_menu : []),
        ...(Array.isArray(session?.lastMenu) ? session.lastMenu : []),
        ...(Array.isArray(session?.last_menu?.items) ? session.last_menu.items : []),
    ];
    if (candidates.length === 0) return { hasMenu: false, found: false };
    const found = candidates.some((item) => {
        const name = normalizeLoose(item?.name || item?.base_name || item?.dish || '');
        if (!name) return false;
        return name.includes(needle) || needle.includes(name);
    });
    return { hasMenu: true, found };
}

function collectRequestedDishes(args = {}) {
    const dishes = [];
    if (args?.dish) dishes.push(String(args.dish));
    if (Array.isArray(args?.items)) {
        for (const item of args.items) {
            if (item?.dish) dishes.push(String(item.dish));
        }
    }
    return dishes.map((dish) => dish.trim()).filter(Boolean);
}

function detectTextDishMismatch(args = {}, mappedText = '') {
    try {
        const argText = args?.text || args?.input || args?.query_text || '';
        const text = normalizeLoose(argText || mappedText);
        const dishes = collectRequestedDishes(args);
        if (!text || dishes.length === 0) return null;

        const dishText = normalizeLoose(dishes.join(' '));
        if (!dishText || text.includes(dishText) || dishText.includes(text)) return null;
        const textTokens = new Set(text.split(' ').filter((token) => token.length >= 4));
        const dishTokens = dishText.split(' ').filter((token) => token.length >= 4);
        const overlap = dishTokens.filter((token) => textTokens.has(token)).length;
        if (overlap > 0) return null;

        return {
            code: 'TEXT_DISH_MISMATCH',
            severity: 'warning',
            reason: 'args_text_and_args_dish_have_no_meaningful_token_overlap',
            args_text: compactText(argText || mappedText, SHORT_TEXT_LIMIT),
            args_dish: compactText(dishes.join(', '), SHORT_TEXT_LIMIT),
        };
    } catch {
        return null;
    }
}

function detectNonMenuRecommendation(args = {}, session = {}) {
    try {
        const warnings = [];
        for (const dish of collectRequestedDishes(args)) {
            const menuCheck = hasMenuCandidate(session, dish);
            if (menuCheck.hasMenu && !menuCheck.found) {
                warnings.push({
                    code: 'NON_MENU_RECOMMENDATION',
                    severity: 'warning',
                    reason: 'tool_args_requested_item_not_present_in_session_menu',
                    dish: compactText(dish, SHORT_TEXT_LIMIT),
                });
            }
        }
        return warnings;
    } catch {
        return [];
    }
}

export function createTurnTrace({
    sessionId,
    turnId,
    requestId,
    toolName,
    rawArgs,
    sanitizedArgs,
    rawTranscript,
    finalTranscript,
    source = 'live_tool',
} = {}) {
    try {
        if (!isDebugLiveFlowEnabled()) return null;
        return {
            schema: 'freeflow.turn_trace.v1',
            created_at: new Date().toISOString(),
            session_id: sessionId || null,
            turn_id: turnId || requestId || null,
            request_id: requestId || null,
            source,
            stt: {
                raw_transcript: withMissing(compactText(rawTranscript, TEXT_LIMIT), 'raw_transcript_not_provided_by_live_client'),
                final_transcript: withMissing(compactText(finalTranscript, TEXT_LIMIT), 'final_transcript_not_provided'),
            },
            model: {
                input_text: withMissing(null, 'mapped_text_not_available_before_tool_router'),
            },
            tool_call: {
                name: toolName || null,
                raw_args: sanitizeValue(rawArgs ?? sanitizedArgs ?? {}),
            },
            router: {
                mapped_intent: null,
                runtime_intent: null,
                runtime_domain: null,
                ivl_result: null,
            },
            handler: {
                decision: null,
                reason: null,
            },
            cart: {
                before: null,
                after: null,
                delta: null,
            },
            assistant_reply_text: withMissing(null, 'assistant_reply_not_available_before_handler'),
            tts_sent_text: withMissing(null, 'tts_text_not_available_before_response'),
            warnings: [],
        };
    } catch {
        return null;
    }
}

export function buildInitialTurnTrace(options) {
    return createTurnTrace(options);
}

export function buildToolRouterTrace({
    existingTrace,
    sessionId,
    turnId,
    requestId,
    toolName,
    args,
    transcript,
    userText,
} = {}) {
    try {
        if (!isDebugLiveFlowEnabled()) return null;
        return existingTrace || createTurnTrace({
            sessionId,
            turnId,
            requestId,
            toolName,
            rawArgs: args,
            finalTranscript: transcript || userText || null,
            source: 'tool_router',
        });
    } catch {
        return null;
    }
}

export function applyRouterDecision(trace, {
    mappedText,
    mappedIntent,
    runtimeIntent,
    runtimeDomain,
    ivlResult,
    stateCheck,
    fallbackIntent,
    args,
    session,
} = {}) {
    try {
        if (!trace || !isDebugLiveFlowEnabled()) return trace || null;
        trace.model = {
            input_text: withMissing(compactText(mappedText, TEXT_LIMIT), 'mapped_text_missing'),
        };
        trace.router = {
            mapped_intent: mappedIntent || null,
            runtime_intent: runtimeIntent || mappedIntent || null,
            runtime_domain: runtimeDomain || null,
            ivl_result: ivlResult ? sanitizeValue({
                verified: ivlResult.verified,
                confidence: ivlResult.confidence,
                reason: ivlResult.reason || null,
                trace: ivlResult.trace || [],
            }) : withMissing(null, 'ivl_result_not_available'),
            state_check: stateCheck ? sanitizeValue({
                met: stateCheck.met,
                fallback_intent: fallbackIntent || null,
            }) : withMissing(null, 'state_check_not_available'),
        };
        trace.warnings = [
            ...(trace.warnings || []),
            ...[detectTextDishMismatch(args, mappedText)].filter(Boolean),
            ...detectNonMenuRecommendation(args, session),
        ];
        return trace;
    } catch {
        return trace || null;
    }
}

export function applyHandlerDecision(trace, {
    domainResponse,
    guardedDomainResponse,
    cartBefore,
    cartAfter,
    cartChanged,
    cartMutationPath,
    responseSuggestsSuccess,
    successDowngraded,
    clarifyNotAdded,
} = {}) {
    try {
        if (!trace || !isDebugLiveFlowEnabled()) return trace || null;
        const before = summarizeCart(cartBefore);
        const after = summarizeCart(cartAfter);
        const delta = {
            items: after.items - before.items,
            total: Number((after.total - before.total).toFixed(2)),
            changed: Boolean(cartChanged),
        };
        const response = guardedDomainResponse || domainResponse || {};
        const clarify = String(domainResponse?.intent || response?.intent || '').toLowerCase() === 'clarify_order'
            || Boolean(domainResponse?.meta?.clarify || response?.meta?.clarify);

        trace.handler = {
            decision: response?.intent || domainResponse?.intent || null,
            reason: response?.meta?.cart_guard
                || domainResponse?.meta?.cart_guard
                || domainResponse?.meta?.clarify?.clarifyReason
                || domainResponse?.meta?.clarify?.reason
                || (clarify ? 'clarify_order' : null),
            source: domainResponse?.meta?.source || response?.meta?.source || null,
        };
        trace.cart = { before, after, delta };
        trace.assistant_reply_text = withMissing(compactText(response?.reply || response?.text, TEXT_LIMIT), 'assistant_reply_missing');
        trace.tts_sent_text = withMissing(compactText(response?.reply || response?.text, TEXT_LIMIT), 'tts_uses_assistant_reply_text_in_live_tool_response');

        if (cartMutationPath && responseSuggestsSuccess && !cartChanged) {
            trace.warnings = [
                ...(trace.warnings || []),
                {
                    code: 'SUCCESS_WITHOUT_CART_DELTA',
                    severity: 'warning',
                    reason: successDowngraded
                        ? 'success_response_was_downgraded_because_cart_delta_is_zero'
                        : 'response_suggested_success_but_cart_delta_is_zero',
                    clarify_not_added: Boolean(clarifyNotAdded),
                },
            ];
        }
        return trace;
    } catch {
        return trace || null;
    }
}

export function finalizeTurnTrace(trace, extra = {}) {
    try {
        if (!trace || !isDebugLiveFlowEnabled()) return null;
        const finalized = sanitizeValue({
            ...trace,
            finalized_at: new Date().toISOString(),
            ...extra,
        });
        console.log('[TURN_TRACE]', JSON.stringify(finalized));
        return finalized;
    } catch {
        // debug ledger must never affect live flow
        return null;
    }
}

export function attachTurnTraceToLiveToolMeta(response, turnTrace) {
    try {
        if (!response || !turnTrace || !isDebugLiveFlowEnabled()) return response;
        response.meta = response.meta || {};
        response.meta.liveTool = response.meta.liveTool || {};
        response.meta.liveTool.turnTrace = turnTrace;
        return response;
    } catch {
        return response;
    }
}
