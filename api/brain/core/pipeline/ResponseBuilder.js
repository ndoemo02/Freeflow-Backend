import { buildCheckoutProgress } from './CheckoutDraft.js';

function hashCartItems(items) {
    if (!items || items.length === 0) return 'empty';
    const normalized = items
        .map((i) => `${i.id || i.menu_item_id || ''}:${i.quantity || i.qty || 1}:${i.price_pln || i.price || 0}`)
        .sort()
        .join('|');
    let hash = 2166136261;
    for (let i = 0; i < normalized.length; i++) {
        hash ^= normalized.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}

export class ResponseBuilder {
    static build({
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
    }) {
        const { contextUpdates, meta: domainMeta, reply: _r, ...cleanDomainResponse } = domainResponse;

        const restaurants = cleanDomainResponse.restaurants || [];
        const menuItems = cleanDomainResponse.menuItems || [];
        // Preserve full menu when available (menuItems may be a shortlist for Gemini token budget)
        const fullMenu = cleanDomainResponse.menu || menuItems;

        const restaurantsWithDisplayName = restaurants.map((r) => {
            if (!r || r.distance == null) return r;
            const meters = Math.round(Number(r.distance) * 1000);
            if (!Number.isFinite(meters)) return r;
            return { ...r, displayName: `${r.name} (${meters} m)` };
        });

        const sessionSnapshot = getSession(activeSessionId) || {};
        const phase = sessionSnapshot?.conversationPhase || 'idle';
        const cart = sessionSnapshot?.cart || { items: [], total: 0 };
        const cartHash = hashCartItems(cart?.items || []);
        const checkoutProgress = buildCheckoutProgress(sessionSnapshot);
        const safeIntent = intent || domainResponse?.intent || 'unknown';
        const safeReply = speechText || domainResponse?.reply || '';

        const response = {
            ...cleanDomainResponse,
            ok: true,
            session_id: activeSessionId,
            text: safeReply,
            reply: safeReply,
            tts_text: speechPartForTTS,
            audioContent,
            intent: safeIntent,
            phase,
            should_reply: domainResponse.should_reply ?? true,
            actions: domainResponse.actions || [],
            restaurants: restaurantsWithDisplayName,
            menuItems,
            menu: fullMenu,
            cart,
            recommendations: Array.isArray(cleanDomainResponse.recommendations) ? cleanDomainResponse.recommendations : [],
            meta: {
                latency_total_ms: totalLatency,
                source: domainMeta?.source || source || 'llm',
                styling_ms: stylingMs,
                tts_ms: ttsMs,
                cartHash,
                state: {
                    conversationPhase: phase,
                    currentRestaurant: sessionSnapshot?.currentRestaurant || null,
                    orderMode: sessionSnapshot?.orderMode || null,
                },
                checkoutProgress,
                ...(domainMeta || {}),
            },
            context: sessionSnapshot,
            locationRestaurants: restaurants.length > 0 ? restaurantsWithDisplayName : restaurants,
            timestamp: new Date().toISOString(),
        };

        return {
            response,
            restaurants,
            menuItems,
        };
    }
}
