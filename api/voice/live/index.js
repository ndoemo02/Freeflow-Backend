import { ToolRouter } from './ToolRouter.js';
import { LIVE_TOOL_SCHEMAS, toGeminiFunctionDeclarations } from './ToolSchemas.js';
import { GeminiLiveGateway } from './GeminiLiveGateway.js';

let gateway = null;
const toolRouter = new ToolRouter();

export function isLiveModeEnabled() {
    return String(process.env.LIVE_MODE || '').toLowerCase() === 'true';
}

export function registerLiveRoutes(app) {
    app.get('/api/voice/live/health', (req, res) => {
        res.status(200).json({
            ok: true,
            live_mode: isLiveModeEnabled(),
            fallback: '/api/brain/v2',
        });
    });

    app.get('/api/voice/live/tools', (req, res) => {
        res.status(200).json({
            ok: true,
            live_mode: isLiveModeEnabled(),
            tools: LIVE_TOOL_SCHEMAS,
            gemini_function_declarations: toGeminiFunctionDeclarations(),
        });
    });

    app.post('/api/voice/live/tool-call', async (req, res) => {
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
    });
}

export function attachLiveGateway(server) {
    if (!isLiveModeEnabled()) return null;
    if (gateway) return gateway;

    gateway = new GeminiLiveGateway({
        toolRouter,
        isLiveEnabled: isLiveModeEnabled,
    });
    gateway.attach(server);
    return gateway;
}

