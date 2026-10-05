import { upsertAbandonedCartSchema } from '@/validators/abandonedCartSchema';
import { upsertAbandonedCart, getAbandonedCart, deleteAbandonedCart } from '@/lib/mongo/abandonedCart';
import { getSessionFromRequest } from '@/lib/ornaverse/session';

function parseIdentity(request) {
  const url = new URL(request.url);
  const partyId = Number(url.searchParams.get('party_id'));
  const customerMobile = url.searchParams.get('customer_mobile') || null;
  return {
    partyId: Number.isInteger(partyId) && partyId > 0 ? partyId : null,
    customerMobile,
  };
}

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

  const parsed = upsertAbandonedCartSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    await upsertAbandonedCart(parsed.data);
    return Response.json({ ok: true });
  } catch (err) {
    console.error('[api/customers/abandoned-cart] POST', err);
    return Response.json({ error: 'Failed to save abandoned cart' }, { status: 500 });
  }
}

export async function GET(request) {
  if (!(await getSessionFromRequest(request))) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { partyId, customerMobile } = parseIdentity(request);
  if (!partyId && !customerMobile) {
    return Response.json({ error: 'Invalid party_id' }, { status: 400 });
  }

  try {
    const cart = await getAbandonedCart({ partyId, customerMobile });
    return Response.json({ cart });
  } catch (err) {
    console.error('[api/customers/abandoned-cart] GET', err);
    return Response.json({ error: 'Failed to fetch abandoned cart' }, { status: 500 });
  }
}

export async function DELETE(request) {
  if (!(await getSessionFromRequest(request))) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { partyId, customerMobile } = parseIdentity(request);
  if (!partyId && !customerMobile) {
    return Response.json({ error: 'Invalid party_id' }, { status: 400 });
  }

  try {
    await deleteAbandonedCart({ partyId, customerMobile });
    return Response.json({ ok: true });
  } catch (err) {
    console.error('[api/customers/abandoned-cart] DELETE', err);
    return Response.json({ error: 'Failed to delete abandoned cart' }, { status: 500 });
  }
}
