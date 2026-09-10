# Applied order status grant change

On 2026-09-10, migration `20260910175512_revoke_authenticated_order_status_update`
was applied through Supabase MCP to the current FreeFlow project after explicit
user approval. The matching SQL file is a copy of that applied statement, using
the version returned by the remote migration history. It is not pending work.

The change removes only authenticated UPDATE(status) on public.orders.
Effective privileges checked before and after:

| Role | SELECT orders | Table UPDATE | UPDATE status before -> after | UPDATE confirmed_at |
| --- | --- | --- | --- | --- |
| anon | false | false | false -> false | false |
| authenticated | true | false | true -> false | false |
| service_role | true | true | true -> true | true |

SELECT remains subject to existing RLS. No order records, SELECT policies,
restaurant publication settings or other grants were changed. The security
advisor reported no ERROR and the same existing notices after the change.

The deployed frontend asset `index-BnLOMuy2.js` was inspected before application:
KDS start/ready/complete callbacks use authenticated PATCH /api/owner/orders/:id;
the dashboard reads the same scoped backend feed. This verifies static routing,
not a successful authenticated end-to-end interaction.

The backend transition guard in commit 31adb62 still requires a separately
authorized deployment. Revoking a direct database grant does not update the
deployed API. Account isolation and real Stripe test/E2E remain release gates.

## Migration history boundary

The remote migration list returned only this version at verification time.
This repository also contains historical migration files for an older database
baseline. Do not run the whole migration directory with db push/reset to
reproduce this one change. Reconciling the existing baseline is separate work;
neither old migrations nor the project link/config were changed here.

Source evidence and the detailed operational checkpoint are retained in the
local FreeFlow reports/progress log. No raw database metadata or credentials
are included in this commit.
