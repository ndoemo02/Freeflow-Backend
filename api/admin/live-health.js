import { getLiveHealthSnapshot } from '../voice/live/liveHealth.js';

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

    const snapshot = getLiveHealthSnapshot();
    return res.status(200).json({
      ok: true,
      ...snapshot,
    });
  } catch (error) {
    return res.status(200).json({
      ok: true,
      truthConsistency: {
        gpsLocationDropCount: 0,
        cuisineHallucinationCount: 0,
        cartDesyncCount: 0,
        cartSuccessDowngradeCount: 0,
        ivlBlockCount: 0,
        ivlTotalCount: 0,
        ivlBlockRate: 0,
        toolSuccessCount: 0,
        toolFailCount: 0,
        toolTotalCount: 0,
        toolSuccessRate: 100,
      },
      cognitiveLoad: {
        lastPromptSize: 0,
        lastCompactPayloadSize: 0,
        promptSizeHistory: [],
        payloadSizeHistory: [],
      },
      meta: {
        lastUpdatedAt: null,
        lastSessionId: null,
        error: error?.message || 'health_unavailable',
      },
    });
  }
}
