import { getDb } from './client';
import { normalizeMobileKey } from './normalizeMobile';

const COLLECTION = 'recentlyViewed_POS';
const MAX_ITEMS = 20;

function buildFilter(partyId, customerMobile) {
  const mobileKey = normalizeMobileKey(customerMobile);
  return mobileKey ? { mobileKey } : { party_id: partyId };
}

/**
 * Records one product view, moving it to the front if already present.
 * @param {{ party_id: number, customerName?: string, customerMobile?: string, item: object }} params
 */
export async function upsertRecentlyViewedItem({ party_id, customerName, customerMobile, item }) {
  const db = await getDb();
  const coll = db.collection(COLLECTION);
  const filter = buildFilter(party_id, customerMobile);
  const mobileKey = normalizeMobileKey(customerMobile);
  
  await coll.updateOne(
    filter,
    { $pull: { items: { item_id: item.item_id } } },
  );

  await coll.updateOne(
    filter,
    {
      $set: {
        mobileKey,
        party_id,
        customerName: customerName ?? null,
        customerMobile: customerMobile ?? null,
        updatedAt: new Date(),
      },
      $setOnInsert: { createdAt: new Date() },
      $push: {
        items: {
          $each: [{ ...item, viewedAt: new Date() }],
          $position: 0,
          $slice: MAX_ITEMS,
        },
      },
    },
    { upsert: true },
  );
}

/**
 * @param {{ partyId: number, customerMobile?: string }} params
 * @returns {Promise<object[]>} most-recently-viewed first, capped at MAX_ITEMS
 */
export async function getRecentlyViewedItems({ partyId, customerMobile }) {
  const db = await getDb();
  const doc = await db.collection(COLLECTION).findOne(buildFilter(partyId, customerMobile));
  return doc?.items ?? [];
}
