import { getSessionFromRequest } from '@/lib/ornaverse/session';
import { getZohoBirthdays } from '@/lib/zoho/zohoCrmService';

export const dynamic = 'force-dynamic';

/** Zoho leads with a birthday / anniversary, read-only — Super Admin only, like the rest of CRM Deals. */
export async function GET(request) {
  const session = await getSessionFromRequest(request);
  if (!session) return Response.json({ error: 'Unauthenticated' }, { status: 401 });
  if (!session.isSuperAdmin) {
    return Response.json({ error: 'Forbidden: This module is restricted to Super Admin only.' }, { status: 403 });
  }
  const p = new URL(request.url).searchParams;
  const type = ['birthday', 'anniversary'].includes(p.get('type')) ? p.get('type') : 'all';
  const month = /^(1[0-2]|[1-9])$/.test(p.get('month') ?? '') ? p.get('month') : 'all';
  try {
    const data = await getZohoBirthdays({ type, month, owner: p.get('owner') || 'all' });
    return Response.json({ ok: true, ...data });
  } catch (err) {
    console.error('[API /api/admin/deals/birthdays]', err);
    return Response.json({ ok: false, error: err.message || 'Failed to fetch Zoho birthdays' }, { status: 500 });
  }
}
