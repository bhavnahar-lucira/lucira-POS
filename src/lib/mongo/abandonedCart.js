
import { getDb } from './client';
import { normalizeMobileKey } from './normalizeMobile';

const COLLECTION = 'abandonedCarts_POS';

function buildFilter(partyId, customerMobile) {
  const mobileKey = normalizeMobileKey(customerMobile);
  return mobileKey ? { mobileKey } : { party_id: partyId };
}

/**
 * @param {{ party_id: number, customerName?: string, customerMobile?: string,
 *   items: object[], subtotal?: number, taxAmount?: number, total?: number,
 *   company_id?: number }} params
 */
export async function upsertAbandonedCart({ party_id, customerName, customerMobile, items, subtotal, taxAmount, total, company_id }) {
  const db = await getDb();
  const mobileKey = normalizeMobileKey(customerMobile);
  await db.collection(COLLECTION).updateOne(
    buildFilter(party_id, customerMobile),
    {
      $set: {
        mobileKey,
        party_id,
        customerName:  customerName  ?? null,
        customerMobile: customerMobile ?? null,
        items,
        subtotal:  subtotal  ?? null,
        taxAmount: taxAmount ?? null,
        total:     total     ?? null,
        company_id: company_id ?? null,
        updatedAt: new Date(),
      },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true },
  );
}

/**
 * @param {{ partyId: number, customerMobile?: string }} params
 * @returns {Promise<object|null>}
 */
export async function getAbandonedCart({ partyId, customerMobile }) {
  const db = await getDb();
  return db.collection(COLLECTION).findOne(buildFilter(partyId, customerMobile));
}

/**
 * Called once the cart is no longer pending — a completed sale or a
 * manual clear (see the middleware's cart/clearCart case).
 * @param {{ partyId: number, customerMobile?: string }} params
 */
export async function deleteAbandonedCart({ partyId, customerMobile }) {
  const db = await getDb();
  await db.collection(COLLECTION).deleteOne(buildFilter(partyId, customerMobile));
}
