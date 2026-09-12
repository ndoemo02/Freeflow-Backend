import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ getUser: vi.fn(), from: vi.fn(), select: vi.fn(), eq: vi.fn() }));
vi.mock('../../_supabase.js', () => ({ supabase: {
  auth: { getUser: mock.getUser }, from: mock.from,
} }));
import handler from '../../owner/workspaceAccess.js';

const membership = (capabilities, status = 'active') => ({
  business_account_id: 'business-a', business_roles: { capabilities }, business_accounts: { status },
});
const response = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), setHeader: vi.fn() });
beforeEach(() => {
  vi.clearAllMocks();
  mock.getUser.mockResolvedValue({ data: { user: { id: 'verified-user' } }, error: null });
  mock.from.mockReturnValue({ select: mock.select });
  mock.select.mockReturnValue({ eq: mock.eq });
  mock.eq.mockResolvedValue({ data: [], error: null });
});
const request = { method: 'GET', headers: { authorization: 'Bearer test-jwt' }, query: { user_id: 'forged-owner' } };

describe('workspace access uses real auth and membership capability resolver', () => {
  it.each([
    ['owner', ['orders.read', 'orders.update_status', 'venue.manage', 'menu.manage', 'members.manage', 'analytics.read', 'billing.read']],
    ['staff', ['orders.read', 'orders.update_status']],
    ['custom venue role', ['venue.manage']],
  ])('%s allowed without metadata', async (_, capabilities) => {
    mock.eq.mockResolvedValue({ data: [membership(capabilities)], error: null });
    const res = response();
    await handler(request, res);
    expect(mock.getUser).toHaveBeenCalledWith('test-jwt');
    expect(mock.from).toHaveBeenCalledWith('business_members');
    for (const args of mock.eq.mock.calls) expect(args).toEqual(['user_id', 'verified-user']);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ ok: true, user_id: 'verified-user', workspace_access: true });
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });
  it.each([
    ['consumer with forged flags', []],
    ['suspended owner', [membership(['orders.read', 'venue.manage'], 'suspended')]],
    ['unrelated capability', [membership(['billing.read'])]],
  ])('%s denied', async (_, rows) => {
    mock.getUser.mockResolvedValue({ data: { user: {
      id: 'verified-user', email: 'ndoemo02@gmail.com',
      user_metadata: { role: 'owner', workspace_access: true, is_admin: true },
      app_metadata: { workspace_access: true },
    } } });
    mock.eq.mockResolvedValue({ data: rows, error: null });
    const res = response();
    await handler(request, res);
    expect(res.json).toHaveBeenCalledWith({ ok: true, user_id: 'verified-user', workspace_access: false });
  });
  it('missing JWT denies before database access', async () => {
    const res = response();
    await handler({ method: 'GET', headers: {} }, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(mock.from).not.toHaveBeenCalled();
  });
  it.each([{ error: new Error('invalid JWT'), data: null }, { data: { user: { id: 'anon', is_anonymous: true } } }])('invalid/anonymous identity denied', async identity => {
    mock.getUser.mockResolvedValue(identity);
    const res = response();
    await handler(request, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(mock.from).not.toHaveBeenCalled();
  });
  it('database failure closes access without exposing database error', async () => {
    mock.eq.mockResolvedValue({ data: null, error: new Error('private database detail') });
    const res = response();
    await handler(request, res);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ ok: false, error: 'workspace_access_unavailable' });
  });
  it('rejects writes', async () => {
    const res = response();
    await handler({ ...request, method: 'POST' }, res);
    expect(res.status).toHaveBeenCalledWith(405);
    expect(mock.from).not.toHaveBeenCalled();
  });
});
