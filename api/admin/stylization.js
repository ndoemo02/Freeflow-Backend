// api/admin/stylization.js
import { getStylizationPrompt, updateStylizationPrompt } from "../config/configService.js";

function forbid(res) { return res.status(403).json({ ok: false, error: 'forbidden' }); }

export default async function handler(req, res) {
    const token = req.headers['x-admin-token'] || req.headers['X-Admin-Token'] || req.headers['x-Admin-Token'] || req.query.token;
    if (!token || token !== process.env.ADMIN_TOKEN) return forbid(res);

    if (req.method === 'GET') {
        try {
            const prompt = await getStylizationPrompt();
            return res.status(200).json({ ok: true, prompt });
        } catch (e) {
            return res.status(500).json({ ok: false, error: e.message });
        }
    }

    if (req.method === 'POST') {
        try {
            const body = req.body || {};
            const prompt = String(body.prompt ?? body.content ?? '');
            if (prompt.length < 20) {
                return res.status(400).json({ ok: false, error: 'Prompt musi mieć minimum 20 znaków' });
            }
            const saved = await updateStylizationPrompt(prompt);
            return res.status(200).json({ ok: true, prompt: saved });
        } catch (e) {
            return res.status(500).json({ ok: false, error: e.message });
        }
    }

    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
}
