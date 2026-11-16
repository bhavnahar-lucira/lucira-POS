import { getDb } from './client';
import { normalizeMobileKey } from './normalizeMobile';

const COLLECTION = 'walkinVisits_POS';



/** One staff-confirmed walk-in: the visit itself is in OrnaVerse; this keeps its purpose. */
export async function recordWalkinVisit({ env, companyId, storeName, mobile, customerId, customerName, purpose, user }) {
  const db = await getDb();
  const now = new Date();
  await db.collection(COLLECTION).insertOne({
    environment: env, companyId, storeName: storeName ?? null,
    mobileKey: normalizeMobileKey(mobile), customerId: customerId ?? null, customerName: customerName ?? null,
    purpose, recordedBy: user ?? null, recordedAt: now,
  });
}

/** Walk-ins recorded at a store between two instants (newest first). */
export async function listWalkinVisits({ env, companyId, from, to, mobile }) {
  const db = await getDb();
  const match = { environment: env, companyId };
  if (from || to) match.recordedAt = { ...(from && { $gte: from }), ...(to && { $lte: to }) };
  if (mobile) match.mobileKey = normalizeMobileKey(mobile);
  return db.collection(COLLECTION)
    .find(match, { projection: { _id: 0 } })
    .sort({ recordedAt: -1 })
    .limit(5000)
    .toArray();
}
