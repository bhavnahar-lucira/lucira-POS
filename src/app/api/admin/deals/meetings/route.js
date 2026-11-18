import { getSessionFromRequest } from '@/lib/ornaverse/session';
import { getZohoMeetings } from '@/lib/zoho/zohoCrmService';
import { getCrmScope, publicScope } from '@/lib/zoho/crmAccess';

export const dynamic = 'force-dynamic';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Zoho meetings (Events), read-only. */
export async function GET(request) {
  const session = await getSessionFromRequest(request);
  if (!session) return Response.json({ error: 'Unauthenticated' }, { status: 401 });
  const p = new URL(request.url).searchParams;
  const fromDate = p.get('fromDate') ?? '';
  const toDate = p.get('toDate') ?? '';
  if ((fromDate && !DATE_RE.test(fromDate)) || (toDate && !DATE_RE.test(toDate))) {
    return Response.json({ error: 'Dates must be YYYY-MM-DD' }, { status: 400 });
  }
  try {
    const scope = await getCrmScope(session);
    if (!scope.all && !scope.zohoStore) {
      return Response.json({ ok: true, scope: publicScope(scope), meetings: [], owners: [], info: { more_records: false } });
    }
    const data = await getZohoMeetings({
      page: Number(p.get('page')) || 1,
      perPage: Math.min(Number(p.get('perPage')) || 100, 200),
      fromDate, toDate,
      owner: scope.all ? p.get('owner') || 'all' : 'all',
      search: p.get('search') || '',
      zohoStore: scope.all ? null : scope.zohoStore,
    });
    return Response.json({ ok: true, scope: publicScope(scope), ...data });
  } catch (err) {
    console.error('[API /api/admin/deals/meetings]', err);
    return Response.json({ ok: false, error: err.message || 'Failed to fetch Zoho meetings' }, { status: 500 });
  }
}
