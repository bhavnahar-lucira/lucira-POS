import { recordPurchaseSchema } from '@/validators/buyerPurchaseSchema';
import { upsertPurchase } from '@/lib/mongo/buyerPurchases';
import { getSessionFromRequest } from '@/lib/ornaverse/session';

// Called from two places: the live checkout hook (useCreateInvoice.js/
// useCreateOrder.js, cookie session) right after a real sale, and the
// standalone backfill script (scripts/backfillBuyerPurchases.mjs, Bearer
// token — getSessionFromRequest already supports both, same as every other
// proxy route) for historical sales. Both funnel through the SAME upsert,
// keyed by documentType+transactionId, so a backfilled and a freshly
// captured purchase are indistinguishable and safe to re-send.
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

  const parsed = recordPurchaseSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    await upsertPurchase(parsed.data);
    return Response.json({ ok: true });
  } catch (err) {
    console.error('[api/buyers/record-purchase] POST', err);
    return Response.json({ error: 'Failed to record purchase' }, { status: 500 });
  }
}
