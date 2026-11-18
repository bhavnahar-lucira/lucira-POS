import { getSessionFromRequest } from '@/lib/ornaverse/session';
import { getZohoBirthdays } from '@/lib/zoho/zohoCrmService';
import { getCrmScope, publicScope } from '@/lib/zoho/crmAccess';

export const dynamic = 'force-dynamic';

/** Zoho leads with a birthday / anniversary, read-only. */
export async function GET(request) {
  const session = await getSessionFromRequest(request);
  if (!session) return Response.json({ error: 'Unauthenticated' }, { status: 401 });
  const p = new URL(request.url).searchParams;
  const type = ['birthday', 'anniversary'].includes(p.get('type')) ? p.get('type') : 'all';
  const month = /^(1[0-2]|[1-9])$/.test(p.get('month') ?? '') ? p.get('month') : 'all';
  try {
    const scope = await getCrmScope(session);
    if (!scope.all && !scope.ownerIds.length) return Response.json({ ok: true, scope: publicScope(scope), rows: [], owners: [] });
    const data = await getZohoBirthdays({
      type, month,
      owner: scope.all ? p.get('owner') || 'all' : 'all',
      ownerIds: scope.all ? null : scope.ownerIds,
    });
    return Response.json({ ok: true, scope: publicScope(scope), ...data });
  } catch (err) {
    console.error('[API /api/admin/deals/birthdays]', err);
    return Response.json({ ok: false, error: err.message || 'Failed to fetch Zoho birthdays' }, { status: 500 });
  }
}
