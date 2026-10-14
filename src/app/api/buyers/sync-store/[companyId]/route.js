import { getSessionFromRequest } from '@/lib/ornaverse/session';
import { syncStorePurchases } from '@/lib/ornaverse/buyerSync';

// On-demand store-level historical sync — called from the /buyers LIST page
// right after it loads. The list can only ever show customers that already
// have a Mongo record, so without this the very first visit to a store with
// no prior live-captured sales has nothing to show AND nothing to click into
// to trigger a sync (the per-customer sync lives on the detail page, which
// is unreachable from an empty list). This pulls every Invoice/Order for one
// store directly from OrnaVerse and upserts them — idempotent, safe to
// re-run. See buyerSync.js for the List → Receipt-List-fallback → Retrieve
// logic (same approach as scripts/backfillBuyerPurchases.mjs).
export async function POST(request, { params }) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { companyId } = await params;
  const id = Number(companyId);
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: 'Invalid companyId' }, { status: 400 });
  }

  try {
    const result = await syncStorePurchases({ companyId: id, session });
    return Response.json({ ok: true, ...result });
  } catch (err) {
    console.error('[api/buyers/sync-store] failed', err);
    return Response.json({ error: 'Could not reach OrnaVerse' }, { status: 502 });
  }
}
