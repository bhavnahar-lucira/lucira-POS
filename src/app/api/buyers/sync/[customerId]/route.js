import { getSessionFromRequest } from '@/lib/ornaverse/session';
import { syncCustomerPurchases } from '@/lib/ornaverse/buyerSync';

// On-demand per-customer historical sync — called from the /buyers/[customerId]
// page right after it loads, so a customer's past purchases (placed before
// this module existed, or directly on OrnaVerse's own client, never through
// this app's own checkout) show up without needing
// scripts/backfillBuyerPurchases.mjs run first. See buyerSync.js for the
// actual GetPartyTransactions → Retrieve-each → upsert logic — idempotent,
// safe to re-run every time this page loads.
export async function POST(request, { params }) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { customerId } = await params;
  const partyId = Number(customerId);
  if (!Number.isInteger(partyId) || partyId <= 0) {
    return Response.json({ error: 'Invalid customerId' }, { status: 400 });
  }

  try {
    const result = await syncCustomerPurchases({ partyId, session });
    return Response.json({ ok: true, ...result });
  } catch (err) {
    console.error('[api/buyers/sync] failed', err);
    return Response.json({ error: 'Could not reach OrnaVerse' }, { status: 502 });
  }
}
