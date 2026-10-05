import { getDb } from './client';
import { normalizeMobileKey } from './normalizeMobile';

const COLLECTION = 'wishlist_POS';
const MAX_ITEMS = 200;

function buildFilter(partyId, customerMobile) {
  const mobileKey = normalizeMobileKey(customerMobile);
  return mobileKey ? { mobileKey } : { party_id: partyId };
}

/**
 * @param {{ party_id: number, customerName?: string, customerMobile?: string, item: object }} params
 */
export async function addWishlistItem({ party_id, customerName, customerMobile, item }) {
  const db = await getDb();
  const coll = db.collection(COLLECTION);
  const itemSizeId = item.item_size_id ?? null;
  const filter = buildFilter(party_id, customerMobile);
  const mobileKey = normalizeMobileKey(customerMobile);

  await coll.updateOne(
    filter,
    { $pull: { items: { item_id: item.item_id, item_size_id: itemSizeId } } },
  );

  await coll.updateOne(
    filter,
    {
      $set: { mobileKey, party_id, customerName: customerName ?? null, customerMobile: customerMobile ?? null, updatedAt: new Date() },
      $setOnInsert: { createdAt: new Date() },
      $push: {
        items: {
          $each: [{ ...item, addedAt: new Date() }],
          $position: 0,
          $slice: MAX_ITEMS,
        },
      },
    },
    { upsert: true },
  );
}

/**
 * @param {{ party_id: number, customerMobile?: string, item_id: number, item_size_id?: number|null }} params
 */
export async function removeWishlistItem({ party_id, customerMobile, item_id, item_size_id = null }) {
  const db = await getDb();
  await db.collection(COLLECTION).updateOne(
    buildFilter(party_id, customerMobile),
    { $pull: { items: { item_id, item_size_id } }, $set: { updatedAt: new Date() } },
  );
}

/**
 * @param {{ partyId: number, customerMobile?: string }} params
 * @returns {Promise<object[]>} most-recently-added first
 */
export async function getWishlist({ partyId, customerMobile }) {
  const db = await getDb();
  const doc = await db.collection(COLLECTION).findOne(buildFilter(partyId, customerMobile));
  return doc?.items ?? [];
}
