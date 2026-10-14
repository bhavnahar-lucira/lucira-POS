import { getBuyerHistory } from '@/lib/mongo/buyerPurchases';
import { getSessionFromRequest } from '@/lib/ornaverse/session';

export async function GET(request, { params }) {
  if (!(await getSessionFromRequest(request))) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { customerId } = await params;
  const id = Number(customerId);
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: 'Invalid customerId' }, { status: 400 });
  }

  try {
    const purchases = await getBuyerHistory(id);
    return Response.json({ purchases });
  } catch (err) {
    console.error('[api/buyers/[customerId]] GET', err);
    return Response.json({ error: 'Failed to load purchase history' }, { status: 500 });
  }
}
