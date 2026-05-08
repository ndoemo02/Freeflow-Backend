import { recordPromptSize, recordCompactPayloadSize } from '../voice/live/liveHealth.js';

function forbid(res) {
  return res.status(403).json({ ok: false, error: 'forbidden' });
}

export default async function handler(req, res) {
  try {
    // Auth handled by verifyAmberAdmin middleware
    const { sessionId, promptSize, compactPayloadSize, toolName } = req.body || {};

    if (typeof promptSize === 'number' && promptSize > 0) {
      recordPromptSize({ sessionId, sizeBytes: promptSize });
    }
    if (typeof compactPayloadSize === 'number' && compactPayloadSize > 0) {
      recordCompactPayloadSize({ sessionId, toolName, sizeBytes: compactPayloadSize });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(200).json({ ok: false, error: error?.message || 'cognitive_load_unavailable' });
  }
}
