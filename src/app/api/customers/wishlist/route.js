import { addWishlistItemSchema } from '@/validators/wishlistSchema';
import { addWishlistItem, removeWishlistItem, getWishlist } from '@/lib/mongo/wishlist';
import { getSessionFromRequest } from '@/lib/ornaverse/session';

function parseIntParam(url, name) {
  const value = Number(new URL(url).searchParams.get(name));
  return Number.isInteger(value) && value > 0 ? value : null;
}

function parseMobileParam(url) {
  return new URL(url).searchParams.get('customer_mobile') || null;
}

function parseOptionalIntParam(url, name) {
  const raw = new URL(url).searchParams.get(name);
  if (raw == null || raw === '') return null;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : null;
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

  const parsed = addWishlistItemSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    await addWishlistItem(parsed.data);
    return Response.json({ ok: true });
  } catch (err) {
    console.error('[api/customers/wishlist] POST', err);
    return Response.json({ error: 'Failed to add to wishlist' }, { status: 500 });
  }
}

export async function GET(request) {
  if (!(await getSessionFromRequest(request))) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const partyId = parseIntParam(request.url, 'party_id');
  const customerMobile = parseMobileParam(request.url);
  if (!partyId && !customerMobile) {
    return Response.json({ error: 'Invalid party_id' }, { status: 400 });
  }

  try {
    const items = await getWishlist({ partyId, customerMobile });
    return Response.json({ items });
  } catch (err) {
    console.error('[api/customers/wishlist] GET', err);
    return Response.json({ error: 'Failed to fetch wishlist' }, { status: 500 });
  }
}

export async function DELETE(request) {
  if (!(await getSessionFromRequest(request))) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const partyId    = parseIntParam(request.url, 'party_id');
  const customerMobile = parseMobileParam(request.url);
  const itemId     = parseIntParam(request.url, 'item_id');
  const itemSizeId = parseOptionalIntParam(request.url, 'item_size_id');
  if ((!partyId && !customerMobile) || !itemId) {
    return Response.json({ error: 'Invalid party_id or item_id' }, { status: 400 });
  }

  try {
    await removeWishlistItem({ party_id: partyId, customerMobile, item_id: itemId, item_size_id: itemSizeId });
    return Response.json({ ok: true });
  } catch (err) {
    console.error('[api/customers/wishlist] DELETE', err);
    return Response.json({ error: 'Failed to remove from wishlist' }, { status: 500 });
  }
}
