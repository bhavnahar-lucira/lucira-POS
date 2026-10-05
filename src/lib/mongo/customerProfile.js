import { getDb } from './client';

const COLLECTION = 'customers_POS';
const EXCLUDED_FIELDS = ['pan_no', 'pan_document'];

function omitExcludedFields(profile) {
  const clean = { ...profile };
  for (const field of EXCLUDED_FIELDS) delete clean[field];
  return clean;
}

/**
 * @param {{ party_id: number, profile: object }} params — profile is the raw
 *   CustomerRow (normalizeCustomer(entity).raw, or the entity itself)
 */
export async function upsertCustomerProfile({ party_id, profile }) {
  const db = await getDb();
  const toStore = omitExcludedFields(profile);

  await db.collection(COLLECTION).updateOne(
    { party_id },
    {
      $set: { party_id, profile: toStore, syncedAt: new Date() },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true },
  );
}

/**
 * @param {number} partyId
 * @returns {Promise<object|null>} the stored profile (never contains PAN — see above)
 */
export async function getCustomerProfile(partyId) {
  const db = await getDb();
  const doc = await db.collection(COLLECTION).findOne({ party_id: partyId });
  return doc?.profile ?? null;
}
