import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Kontrakt CORS endpointow mintujacych poswiadczenia Live.
 *
 * Powod powstania: `token.js` i `openai-session.js` deklarowaly
 * `Access-Control-Allow-Headers: Content-Type`, nadpisujac szerszy naglowek
 * globalny z `server-vercel.js` (`Content-Type, Authorization, x-admin-token`).
 *
 * Frontend dokłada `Authorization: Bearer <supabase>` **warunkowo — tylko dla
 * zalogowanego uzytkownika** (`useGeminiLiveSession.fetchLiveAccessToken`,
 * `useOpenAIRealtimeSession`). Skutek: dla gosci Live dzialalo, a dla
 * zalogowanych przegladarka blokowala zadanie na preflighcie i sesja nie
 * wchodzila. Zaden curl tego nie wykrywal, bo curl nie robi preflightu.
 *
 * Ten test pilnuje, ze oba handlery przepuszczaja `Authorization`.
 * NIE oznacza to, ze endpointy uwierzytelniaja — dzis go ignoruja (P6).
 */

function createRes() {
  const headers = {};
  const res = {
    headers,
    statusCode: null,
    setHeader(name, value) {
      headers[String(name).toLowerCase()] = value;
    },
    status(code) {
      res.statusCode = code;
      return res;
    },
    end() {
      return res;
    },
    json() {
      return res;
    },
  };
  return res;
}

const ALLOWED_ORIGIN = 'http://localhost:5173';

function allowHeaderList(res) {
  return String(res.headers['access-control-allow-headers'] || '')
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

describe('CORS endpointow Live — naglowek Authorization', () => {
  let tokenHandler;
  let openaiHandler;

  beforeEach(async () => {
    process.env.LIVE_MODE = 'true';
    tokenHandler = (await import('../../api/voice/live/token.js')).default;
    openaiHandler = (await import('../../api/voice/live/openai-session.js')).default;
  });

  it('token.js dopuszcza Authorization w preflighcie', async () => {
    const res = createRes();
    await tokenHandler({ method: 'OPTIONS', headers: { origin: ALLOWED_ORIGIN } }, res);

    expect(allowHeaderList(res)).toContain('authorization');
  });

  it('token.js nadal dopuszcza Content-Type', async () => {
    const res = createRes();
    await tokenHandler({ method: 'OPTIONS', headers: { origin: ALLOWED_ORIGIN } }, res);

    expect(allowHeaderList(res)).toContain('content-type');
  });

  it('openai-session.js dopuszcza Authorization w preflighcie', async () => {
    const res = createRes();
    await openaiHandler({ method: 'OPTIONS', headers: { origin: ALLOWED_ORIGIN } }, res);

    expect(allowHeaderList(res)).toContain('authorization');
  });

  it('openai-session.js nadal dopuszcza Content-Type', async () => {
    const res = createRes();
    await openaiHandler({ method: 'OPTIONS', headers: { origin: ALLOWED_ORIGIN } }, res);

    expect(allowHeaderList(res)).toContain('content-type');
  });

  it('obcy origin nie dostaje naglowkow CORS', async () => {
    const res = createRes();
    await tokenHandler({ method: 'OPTIONS', headers: { origin: 'https://evil.example' } }, res);

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    expect(res.headers['access-control-allow-headers']).toBeUndefined();
  });
});
