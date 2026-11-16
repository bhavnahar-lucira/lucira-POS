import { getSessionFromRequest } from '@/lib/ornaverse/session';
import { getZohoDeals } from '@/lib/zoho/zohoCrmService';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  // Super Admin gating: only accounts with isSuperAdmin are permitted
  if (!session.isSuperAdmin) {
    return Response.json(
      { error: 'Forbidden: This module is restricted to Super Admin only.' },
      { status: 403 }
    );
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
    const data = await getZohoDeals({
      page,
      perPage,
      store,
      stage,
      search,
      fromDate,
      toDate,
    });
    return Response.json({ ok: true, ...data });
  } catch (err) {
    console.error('[API /api/admin/deals] Error:', err);
    return Response.json(
      {
        ok: false,
        error: err.message || 'Failed to fetch Zoho CRM deals',
        details: err?.cause?.message || String(err),
      },
      { status: 500 }
    );
  }
}
