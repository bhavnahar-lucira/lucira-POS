import { listPurchases } from '@/lib/mongo/buyerPurchases';
import { getSessionFromRequest } from '@/lib/ornaverse/session';

// `company_id` query param scopes the list to one store — omitted means
// every store, which is only meaningful for an admin session (the /buyers
// page itself is what enforces that distinction: a non-admin always passes
// their own activeStoreId, an admin may omit it). This route doesn't
// re-check isSuperAdmin itself — same trust boundary as every other proxy
// route here, which scopes by whatever company_id the authenticated
// session's own app state says is active.
export async function GET(request) {
  if (!(await getSessionFromRequest(request))) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const companyIdParam = new URL(request.url).searchParams.get('company_id');
  const companyId = companyIdParam ? Number(companyIdParam) : undefined;

  try {
    const purchases = await listPurchases({ companyId });
    return Response.json({ purchases });
  } catch (err) {
    console.error('[api/buyers] GET', err);
    return Response.json({ error: 'Failed to load buyers' }, { status: 500 });
  }
}
