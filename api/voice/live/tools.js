// Serverless handler for Vercel — GET /api/voice/live/tools
// Mirror of the Express route in index.js :: registerLiveRoutes()

import { applyCORS } from '../../_cors.js';
import { LIVE_TOOL_SCHEMAS, toGeminiFunctionDeclarations } from './ToolSchemas.js';

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
    tools: LIVE_TOOL_SCHEMAS,
    gemini_function_declarations: toGeminiFunctionDeclarations(),
  });
}
