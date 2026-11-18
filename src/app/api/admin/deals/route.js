import { getSessionFromRequest } from '@/lib/ornaverse/session';
import { getZohoDeals } from '@/lib/zoho/zohoCrmService';
import { getCrmScope, publicScope } from '@/lib/zoho/crmAccess';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page     = Number(searchParams.get('page')) || 1;
  const perPage  = Number(searchParams.get('perPage')) || 50;
  const store    = searchParams.get('store') || 'all';
  const stage    = searchParams.get('stage') || 'all';
  const search   = searchParams.get('search') || '';
  const fromDate = searchParams.get('fromDate') || '';
  const toDate   = searchParams.get('toDate') || '';

  try {
    const scope = await getCrmScope(session);
    if (!scope.all && !scope.ownerIds.length) {
      return Response.json({
        ok: true, scope: publicScope(scope), deals: [],
        info: { page, per_page: perPage, count: 0, more_records: false },
        summary: { total: 0, totalValue: 0, wonCount: 0, lostCount: 0, stores: [], stages: [], utmSources: [] },
      });
    }
    const data = await getZohoDeals({
      page,
      perPage,
      store: scope.all ? store : 'all',
      stage,
      search,
      fromDate,
      toDate,
      ownerIds: scope.all ? null : scope.ownerIds,
    });
    return Response.json({ ok: true, scope: publicScope(scope), ...data });
  } catch (err) {
    console.error('[API /api/admin/deals] Error:', err);
    return Response.json(
      {
        ok: false,
        error: err.message || 'Failed to fetch Zoho CRM deals',
      },
      { status: 500 }
    );
  }
}
