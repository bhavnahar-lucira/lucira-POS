import { getSessionFromRequest } from '@/lib/ornaverse/session';
import { getSingleZohoDeal } from '@/lib/zoho/zohoCrmService';
import { getCrmScope } from '@/lib/zoho/crmAccess';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return Response.json({ error: 'Deal ID is required' }, { status: 400 });
  }

  try {
    const scope = await getCrmScope(session);
    const deal = await getSingleZohoDeal(id, { ownerIds: scope.all ? null : scope.ownerIds });
    if (!deal) {
      return Response.json({ ok: false, error: 'Deal not found in Zoho CRM' }, { status: 404 });
    }
    return Response.json({ ok: true, deal });
  } catch (err) {
    console.error(`[API /api/admin/deals/${id}] Error:`, err);
    return Response.json(
      { ok: false, error: err.message || 'Failed to retrieve Zoho deal' },
      { status: 500 }
    );
  }
}
