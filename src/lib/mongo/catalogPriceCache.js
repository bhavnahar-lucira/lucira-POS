import { getDb } from './client';

const COLLECTION = 'catalogPriceCache_POS';

// The MongoDB driver's own default connection timeout is ~30s — fine for
// every other Mongo-backed feature here, where a write is the whole point
// of the request. This cache is different: it's a pure speed optimization
// the catalog's live-pricing fallback already covers, so a slow/partitioned
// Mongo must fail fast rather than ever making the catalog slower than its
// un-cached baseline. 1.5s is generous for a real connection, tight enough
// that the live-fetch fallback is still clearly the faster path if hit.
const DB_TIMEOUT_MS = 1500;

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('catalogPriceCache: DB timed out')), ms)),
  ]);
}

function docId(itemId, storeId, epoch) {
  return `${itemId}:${storeId}:${epoch}`;
}

/**
 * Batched read — only returns entries that exist AND match the current
 * epoch. A rate change rotates the epoch, so an old-epoch document simply
 * isn't found here any more; no explicit invalidation is needed (see
 * catalogPriceCache plan for why this is safe).
 * @param {number} storeId
 * @param {string} epoch
 * @param {number[]} itemIds
 * @returns {Promise<Map<number, number>>} item_id -> net_amount
 */
export async function getCachedPrices(storeId, epoch, itemIds) {
  if (!itemIds?.length) return new Map();
  const run = async () => {
    const db = await getDb();
    return db.collection(COLLECTION).find(
      { item_id: { $in: itemIds }, store_id: storeId, epoch },
      { projection: { item_id: 1, net_amount: 1, _id: 0 } },
    ).toArray();
  };
  const docs = await withTimeout(run(), DB_TIMEOUT_MS);

  const prices = new Map();
  for (const doc of docs) prices.set(doc.item_id, doc.net_amount);
  return prices;
}

/**
 * Fire-and-forget write — one bulk upsert of freshly live-computed prices,
 * tagged with the epoch they were computed under. Redundant concurrent
 * writes from other terminals for the same item/epoch are harmless
 * (idempotent upsert).
 * @param {number} storeId
 * @param {string} epoch
 * @param {{item_id: number, net_amount: number}[]} entries
 */
export async function setCachedPrices(storeId, epoch, entries) {
  if (!entries?.length) return;
  const run = async () => {
    const db = await getDb();
    const now = new Date();
    await db.collection(COLLECTION).bulkWrite(
      entries.map(({ item_id, net_amount }) => ({
        updateOne: {
          filter: { _id: docId(item_id, storeId, epoch) },
          update: {
            $set: { item_id, store_id: storeId, epoch, net_amount, cachedAt: now },
          },
          upsert: true,
        },
      })),
      { ordered: false },
    );
  };
  await withTimeout(run(), DB_TIMEOUT_MS);
}
