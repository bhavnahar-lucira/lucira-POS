import { getSessionFromRequest } from '@/lib/ornaverse/session';
import { getUserStoresCached } from '@/lib/reports/serverAccess';
import { getDb } from '@/lib/mongo/client';
import { transferEventSchema, TRANSFER_DOC_TYPES } from '@/validators/branchTransferSchema';

const COLLECTION = 'branchTransferEvents_POS';
let indexReady = null;

async function getCollection() {
  const col = (await getDb()).collection(COLLECTION);
  indexReady ??= col.createIndex({ env: 1, doc_type: 1, transaction_id: 1, at: 1 }).catch((err) => {
    indexReady = null;
    throw err;
  });
  await indexReady;
  return col;
}

/** Actions done through the POS on one transfer/allocation, oldest first. */
export async function GET(request) {
  const session = await getSessionFromRequest(request);
  if (!session) return Response.json({ error: 'Not authenticated' }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const docType = params.get('doc_type');
  const ids = (params.get('transaction_ids') ?? '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 10);
  // OrnaVerse deletes a cancelled stock allocation, so the POS log is the only record of it — listed per store.
  const cancelledOnly = params.get('action') === 'cancelled';
  if (!TRANSFER_DOC_TYPES.includes(docType) || (!ids.length && !cancelledOnly)) {
    return Response.json({ error: 'doc_type and transaction_ids are required' }, { status: 400 });
  }
  try {
    const filter = cancelledOnly && !ids.length
      ? { env: session.env, doc_type: docType, action: 'cancelled', store_id: session.companyId ?? null }
      : { env: session.env, doc_type: docType, transaction_id: { $in: ids } };
    const events = await (await getCollection())
      .find(filter, { projection: { _id: 0 } })
      .sort({ at: cancelledOnly && !ids.length ? -1 : 1 })
      .limit(200)
      .toArray();
    return Response.json({ events });
  } catch (err) {
    console.error('[api/branch-transfer/events] GET', err);
    return Response.json({ error: 'Failed to load activity' }, { status: 500 });
  }
}

export async function POST(request) {
  const session = await getSessionFromRequest(request);
  if (!session) return Response.json({ error: 'Not authenticated' }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = transferEventSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid event' }, { status: 400 });

  try {
    const store = session.companyId
      ? (await getUserStoresCached(session).catch(() => [])).find((s) => s.company_id === session.companyId) ?? null
      : null;
    await (await getCollection()).insertOne({
      ...parsed.data,
      env: session.env,
      at: new Date(),
      user: session.username,
      store_id: session.companyId ?? null,
      store_code: store?.company_code ?? null,
    });
    return Response.json({ ok: true });
  } catch (err) {
    console.error('[api/branch-transfer/events] POST', err);
    return Response.json({ error: 'Failed to record activity' }, { status: 500 });
  }
}
