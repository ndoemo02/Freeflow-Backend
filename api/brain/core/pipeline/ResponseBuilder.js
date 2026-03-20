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

        const restaurantsWithDisplayName = restaurants.map((r) => {
            if (!r || r.distance == null) return r;
            const meters = Math.round(Number(r.distance) * 1000);
            if (!Number.isFinite(meters)) return r;
            return { ...r, displayName: `${r.name} (${meters} m)` };
        });

        const sessionSnapshot = getSession(activeSessionId) || {};
        const phase = sessionSnapshot?.conversationPhase || 'idle';
        const cart = sessionSnapshot?.cart || { items: [], total: 0 };
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
            menu: menuItems,
            cart,
            recommendations: Array.isArray(cleanDomainResponse.recommendations) ? cleanDomainResponse.recommendations : [],
            meta: {
                latency_total_ms: totalLatency,
                source: domainMeta?.source || source || 'llm',
                styling_ms: stylingMs,
                tts_ms: ttsMs,
                state: {
                    conversationPhase: phase,
                    currentRestaurant: sessionSnapshot?.currentRestaurant || null,
                },
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
