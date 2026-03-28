// Serverless handler for Vercel — POST /api/voice/live/tool-call
// Mirror of the Express route in index.js :: registerLiveRoutes()

import { applyCORS } from '../../_cors.js';
import { ToolRouter } from './ToolRouter.js';

function isLiveModeEnabled() {
  return String(process.env.LIVE_MODE || '').toLowerCase() === 'true';
}

const toolRouter = new ToolRouter();

export default async function handler(req, res) {
  if (applyCORS(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const body = req.body || {};
  const sessionId = body.session_id || body.sessionId;
  const toolName = body.tool || body.tool_name;
  const args = body.args || {};
  const requestId = body.request_id || null;

  if (!isLiveModeEnabled()) {
    return res.status(409).json({
      ok: false,
      error: 'live_mode_disabled',
      fallback: '/api/brain/v2',
      message: 'LIVE_MODE=false. Use classic /api/brain/v2 pipeline.',
    });
  }

  if (!sessionId || !toolName) {
    return res.status(400).json({
      ok: false,
      error: 'missing_session_or_tool',
    });
  }

  try {
    const result = await toolRouter.executeToolCall({
      sessionId: String(sessionId),
      toolName: String(toolName),
      args,
      requestId,
    });

    const status = result.ok ? 200 : 400;
    return res.status(status).json(result);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: 'live_tool_router_error',
      message: error?.message || 'unknown_error',
    });
  }
}
