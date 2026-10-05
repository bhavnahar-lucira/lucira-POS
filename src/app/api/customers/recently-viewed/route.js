import { recordViewSchema } from '@/validators/recentlyViewedSchema';
import { upsertRecentlyViewedItem, getRecentlyViewedItems } from '@/lib/mongo/recentlyViewed';
import { getSessionFromRequest } from '@/lib/ornaverse/session';

export async function POST(request) {
  if (!(await getSessionFromRequest(request))) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = recordViewSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { party_id, customerName, customerMobile, item } = parsed.data;

  try {
    await upsertRecentlyViewedItem({ party_id, customerName, customerMobile, item });
    return Response.json({ ok: true });
  } catch (err) {
    console.error('[api/customers/recently-viewed] POST', err);
    return Response.json({ error: 'Failed to record view' }, { status: 500 });
  }
}

export async function GET(request) {
  if (!(await getSessionFromRequest(request))) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }
  
  const url = new URL(request.url);
  const partyId = Number(url.searchParams.get('party_id'));
  const customerMobile = url.searchParams.get('customer_mobile') || null;
  const validPartyId = Number.isInteger(partyId) && partyId > 0 ? partyId : null;
  if (!validPartyId && !customerMobile) {
    return Response.json({ error: 'Invalid party_id' }, { status: 400 });
  }

  try {
    const items = await getRecentlyViewedItems({ partyId: validPartyId, customerMobile });
    return Response.json({ items });
  } catch (err) {
    console.error('[api/customers/recently-viewed] GET', err);
    return Response.json({ error: 'Failed to fetch recently viewed' }, { status: 500 });
  }
}
