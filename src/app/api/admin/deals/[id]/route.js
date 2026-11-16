import { getSessionFromRequest } from '@/lib/ornaverse/session';
import { getSingleZohoDeal } from '@/lib/zoho/zohoCrmService';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
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

  const { id } = await params;
  if (!id) {
    return Response.json({ error: 'Deal ID is required' }, { status: 400 });
  }

  try {
    const deal = await getSingleZohoDeal(id);
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
