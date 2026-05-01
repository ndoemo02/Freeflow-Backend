/**
 * FreeFlow WebSocket Standalone Server
 * ─────────────────────────────────────
 * Minimalny serwer HTTP + WS do deployu na Railway.
 * Vercel → API HTTP, Railway → WebSocket (persistent connections).
 *
 * Uruchom: node api/voice/live/standalone-server.js
 * Port:    process.env.PORT || 8080
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createServer } from 'node:http';
import { createClient } from '@supabase/supabase-js';
import { GeminiLiveGateway } from './GeminiLiveGateway.js';
import { ToolRouter } from './ToolRouter.js';
import { isLiveModeEnabled } from './index.js';

// ─── Dotenv ──────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '../../../.env');
if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    console.log('[WS] Loaded .env');
}

// ─── Supabase ────────────────────────────────────────────────
if (!globalThis.supabase) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
    if (url && key) {
        globalThis.supabase = createClient(url, key);
        console.log('[WS] Supabase client initialized');
    } else {
        console.error('[WS] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
        process.exit(1);
    }
}

// ─── Server ──────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '8080', 10);
const toolRouter = new ToolRouter();
let gateway = null;

const server = createServer((req, res) => {
    // Health check dla Railway
    if (req.url === '/' || req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'ok',
            service: 'freeflow-ws',
            live_mode: isLiveModeEnabled(),
            uptime: process.uptime(),
        }));
        return;
    }
    res.writeHead(404);
    res.end('Not found');
});

// ─── WebSocket Gateway ───────────────────────────────────────
if (isLiveModeEnabled()) {
    gateway = new GeminiLiveGateway({ toolRouter, isLiveEnabled: isLiveModeEnabled });
    gateway.attach(server);
    console.log('[WS] GeminiLiveGateway attached');
} else {
    console.warn('[WS] LIVE_MODE=false — WebSocket nieaktywny');
}

server.listen(PORT, () => {
    console.log(`[WS] Standalone server listening on port ${PORT}`);
    console.log(`[WS] Health: http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('[WS] SIGTERM — shutting down');
    server.close(() => process.exit(0));
});
process.on('SIGINT', () => {
    console.log('[WS] SIGINT — shutting down');
    server.close(() => process.exit(0));
});
