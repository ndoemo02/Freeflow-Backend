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

        const response = {
            ...cleanDomainResponse,
            ok: true,
            session_id: activeSessionId,
            text: speechText,
            reply: speechText,
            tts_text: speechPartForTTS,
            audioContent,
            intent,
            should_reply: domainResponse.should_reply ?? true,
            actions: domainResponse.actions || [],
            restaurants: restaurantsWithDisplayName,
            menuItems,
            menu: menuItems,
            cart: getSession(activeSessionId)?.cart || { items: [], total: 0 },
            meta: {
                latency_total_ms: totalLatency,
                source: domainMeta?.source || source || 'llm',
                styling_ms: stylingMs,
                tts_ms: ttsMs,
                state: {
                    conversationPhase: getSession(activeSessionId)?.conversationPhase || 'idle',
                    currentRestaurant: getSession(activeSessionId)?.currentRestaurant || null,
                },
                ...(domainMeta || {}),
            },
            context: getSession(activeSessionId),
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
