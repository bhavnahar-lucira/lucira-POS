import { getCachedPrices, setCachedPrices } from '@/lib/mongo/catalogPriceCache';
import { getSessionFromRequest } from '@/lib/ornaverse/session';

function parseReadBody(body) {
  const storeId = Number(body?.storeId);
  const epoch = typeof body?.epoch === 'string' ? body.epoch : null;
  const itemIds = Array.isArray(body?.itemIds) ? body.itemIds.map(Number).filter(Number.isInteger) : [];
  if (!Number.isInteger(storeId) || !epoch || !itemIds.length) return null;
  return { storeId, epoch, itemIds };
}

function parseWriteBody(body) {
  const storeId = Number(body?.storeId);
  const epoch = typeof body?.epoch === 'string' ? body.epoch : null;
  const entries = Array.isArray(body?.entries)
    ? body.entries
        .map((e) => ({ item_id: Number(e?.item_id), net_amount: Number(e?.net_amount) }))
        .filter((e) => Number.isInteger(e.item_id) && Number.isFinite(e.net_amount))
    : [];
  if (!Number.isInteger(storeId) || !epoch || !entries.length) return null;
  return { storeId, epoch, entries };
}

// Read is cache-only, never falls through to OrnaVerse itself — the caller
// (useLiveCatalogPrices) already owns the live-fetch fallback for whatever
// comes back missing, so any failure here (bad body, Mongo down) degrades
// to "no hits" rather than a hard error, keeping the catalog's own pricing
// path unaffected either way.
export async function POST(request) {
  if (!(await getSessionFromRequest(request))) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ prices: {} });
  }

  const parsed = parseReadBody(body);
  if (!parsed) return Response.json({ prices: {} });

  try {
    const prices = await getCachedPrices(parsed.storeId, parsed.epoch, parsed.itemIds);
    return Response.json({ prices: Object.fromEntries(prices) });
  } catch (err) {
    console.error('[api/catalog/price-cache] POST', err);
    return Response.json({ prices: {} });
  }
}

// Fire-and-forget from the client — always resolves 200/ok even on a
// malformed body or a Mongo failure, since a missed write only costs the
// NEXT viewer a cache miss, never anything the current viewer sees.
export async function PUT(request) {
  if (!(await getSessionFromRequest(request))) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: true });
  }

  const parsed = parseWriteBody(body);
  if (!parsed) return Response.json({ ok: true });

  try {
    await setCachedPrices(parsed.storeId, parsed.epoch, parsed.entries);
  } catch (err) {
    console.error('[api/catalog/price-cache] PUT', err);
  }
  return Response.json({ ok: true });
}
