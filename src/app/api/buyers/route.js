import { listPurchases } from '@/lib/mongo/buyerPurchases';
import { getSessionFromRequest } from '@/lib/ornaverse/session';

// `company_id` query param scopes the list to one store — omitted means
// every store, which is only meaningful for an admin session (the /buyers
// page itself is what enforces that distinction: a non-admin always passes
// their own activeStoreId, an admin may omit it). SECURITY (2026-10-19):
// that distinction used to be UI-only — a non-admin calling this route
// directly with no company_id got every store's buyer data. Now enforced
// server-side: omitting it requires session.isSuperAdmin.
export async function GET(request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const companyIdParam = new URL(request.url).searchParams.get('company_id');
  const companyId = companyIdParam ? Number(companyIdParam) : undefined;

  if (companyId === undefined && !session.isSuperAdmin) {
    return Response.json({ error: 'company_id is required' }, { status: 400 });
  }

  try {
    const purchases = await listPurchases({ companyId });
    return Response.json({ purchases });
  } catch (err) {
    console.error('[api/buyers] GET', err);
    return Response.json({ error: 'Failed to load buyers' }, { status: 500 });
  }
}
