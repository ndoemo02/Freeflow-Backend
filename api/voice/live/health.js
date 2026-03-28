// Serverless handler for Vercel — GET /api/voice/live/health
// Mirror of the Express route in index.js :: registerLiveRoutes()

import { applyCORS } from '../../_cors.js';

function isLiveModeEnabled() {
  return String(process.env.LIVE_MODE || '').toLowerCase() === 'true';
}

export default function handler(req, res) {
  if (applyCORS(req, res)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  res.status(200).json({
    ok: true,
    live_mode: isLiveModeEnabled(),
    fallback: '/api/brain/v2',
  });
}
