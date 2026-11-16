import { getSessionFromRequest } from '@/lib/ornaverse/session';
import { getUserStoresCached } from '@/lib/reports/serverAccess';
import { recordWalkinVisit, listWalkinVisits } from '@/lib/mongo/walkinVisits';
import { WALKIN_PURPOSES } from '@/constants/walkin';

async function storeFor(session, companyId) {
  return (await getUserStoresCached(session)).find((s) => s.company_id === companyId) ?? null;
}

/** ?company_id&from&to (ISO) [&mobile] — purposes of staff-confirmed walk-ins. */
export async function GET(request) {
  const session = await getSessionFromRequest(request);
  if (!session) return Response.json({ error: 'Not authenticated' }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const companyId = Number(params.get('company_id'));
  if (!(await storeFor(session, companyId))) return Response.json({ error: 'Not authorized for this store' }, { status: 403 });
  const date = (v) => (v && !Number.isNaN(Date.parse(v)) ? new Date(v) : null);
  try {
    const visits = await listWalkinVisits({
      env: session.env, companyId, from: date(params.get('from')), to: date(params.get('to')), mobile: params.get('mobile'),
    });
    return Response.json({ visits });
  } catch (err) {
    console.error('[api/walkins/visits] GET', err);
    return Response.json({ error: 'Failed to load walk-ins' }, { status: 500 });
  }
}

export async function POST(request) {
  const session = await getSessionFromRequest(request);
  if (!session) return Response.json({ error: 'Not authenticated' }, { status: 401 });
  const body = await request.json().catch(() => null);
  const companyId = Number(body?.companyId);
  if (!body?.mobile || !WALKIN_PURPOSES.includes(body.purpose)) return Response.json({ error: 'Invalid request' }, { status: 400 });
  const store = await storeFor(session, companyId);
  if (!store) return Response.json({ error: 'Not authorized for this store' }, { status: 403 });
  try {
    await recordWalkinVisit({
      env: session.env, companyId, storeName: store.mailing_name, mobile: body.mobile,
      customerId: body.customerId, customerName: body.customerName, purpose: body.purpose, user: session.username,
    });
    return Response.json({ ok: true }, { status: 201 });
  } catch (err) {
    console.error('[api/walkins/visits] POST', err);
    return Response.json({ error: 'Failed to record the walk-in' }, { status: 500 });
  }
}
