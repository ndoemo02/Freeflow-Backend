import { requireOwner } from '../_auth.js';
import { supabase } from '../_supabase.js';
import { getCapableAccountIds, CAPABILITY_VENUE_MANAGE } from './_helpers.js';

// Workspace entry only; each resource still enforces its own capability/scope.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }
  const auth = await requireOwner(req, res);
  if (!auth) return;

  try {
    const orders = await getCapableAccountIds(supabase, auth.userId, 'orders.read');
    const venues = orders.length ? [] : await getCapableAccountIds(supabase, auth.userId, CAPABILITY_VENUE_MANAGE);
    return res.status(200).json({
      ok: true,
      user_id: auth.userId,
      workspace_access: orders.length > 0 || venues.length > 0,
    });
  } catch {
    return res.status(503).json({ ok: false, error: 'workspace_access_unavailable' });
  }
}
