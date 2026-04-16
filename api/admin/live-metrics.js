import { getLiveMetricsSnapshot } from '../voice/live/liveMetrics.js';

function forbid(res) {
    return res.status(403).json({ ok: false, error: 'forbidden' });
}

export default async function handler(req, res) {
    try {
        if (req.method !== 'GET') {
            return res.status(405).json({ ok: false, error: 'method_not_allowed' });
        }

        const token = req.headers['x-admin-token'] || req.headers['X-Admin-Token'] || req.query.token;
        if (!token || token !== process.env.ADMIN_TOKEN) {
            return forbid(res);
        }

        const snapshot = getLiveMetricsSnapshot();
        return res.status(200).json({
            ok: true,
            ...snapshot,
        });
    } catch (error) {
        return res.status(200).json({
            ok: true,
            liveModel: process.env.GEMINI_LIVE_MODEL || process.env.LIVE_MODEL || 'gemini-2.5-flash-native-audio-preview-12-2025',
            sessionsOpened: 0,
            sessionsClosed: 0,
            reconnects: 0,
            toolCalls: 0,
            toolCallsByName: {},
            audioFramesSent: 0,
            audioBytesSent: 0,
            avgSessionDurationSec: 0,
            estimatedCostSession: 0,
            estimatedCostToday: 0,
            estimatedCostMonth: 0,
            burnRateLastHour: 0,
            error: error?.message || 'metrics_unavailable',
        });
    }
}
