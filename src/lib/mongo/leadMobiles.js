import { getDb } from './client';
import { normalizeMobileKey } from './normalizeMobile';
import { isMaskedValue } from '@/lib/normalizers/customer';

// OrnaVerse masks CRM mobiles for store logins. Full numbers seen under an admin session are kept here
// (CRM lead id → mobile) so the POS can show store staff the number for their own store's visitors.
const COLLECTION = 'crmLeadMobiles_POS';
const LEGACY_WALKINS = 'walkins_POS';

let indexReady = null;

async function collection() {
  const col = (await getDb()).collection(COLLECTION);
  indexReady ??= col.createIndex({ environment: 1, leadId: 1 }, { unique: true }).catch((err) => {
    indexReady = null;
    throw err;
  });
  await indexReady;
  return col;
}

/** A stored number may stand in for a masked one only if every digit OrnaVerse left visible agrees. */
function fits(full, masked) {
  if (!full) return false;
  const mask = String(masked ?? '').replace(/[^\d*]/g, '');
  let compared = 0;
  for (let i = 1; i <= Math.min(mask.length, full.length); i += 1) {
    const m = mask[mask.length - i];
    if (m === '*') continue;
    if (m !== full[full.length - i]) return false;
    compared += 1;
  }
  return compared >= 2;
}

/** Saves every full (unmasked) lead mobile in these visits. */
export async function rememberLeadMobiles(env, visits) {
  const latest = new Map();
  for (const v of visits) {
    if (!v.leadId || !v.mobile || isMaskedValue(v.mobile)) continue;
    const mobile = normalizeMobileKey(v.mobile);
    if (mobile) latest.set(v.leadId, mobile);
  }
  if (!latest.size) return;
  const now = new Date();
  await (await collection()).bulkWrite([...latest].map(([leadId, mobile]) => ({
    updateOne: {
      filter: { environment: env, leadId },
      update: { $set: { mobile, updatedAt: now }, $setOnInsert: { environment: env, leadId, createdAt: now } },
      upsert: true,
    },
  })), { ordered: false });
}

/** Replaces masked visit mobiles with the full number we hold for that lead, when it fits the mask. */
export async function unmaskVisitMobiles(env, visits) {
  const maskedIds = [...new Set(visits.filter((v) => v.leadId && isMaskedValue(v.mobile)).map((v) => v.leadId))];
  if (!maskedIds.length) return visits;

  const db = await getDb();
  const [known, legacy] = await Promise.all([
    (await collection()).find({ environment: env, leadId: { $in: maskedIds } }, { projection: { _id: 0, leadId: 1, mobile: 1 } }).toArray(),
    db.collection(LEGACY_WALKINS).find({ walkInCustomerId: { $in: maskedIds } }, { projection: { _id: 0, walkInCustomerId: 1, mobile: 1 } }).toArray(),
  ]);
  const byLead = new Map(legacy.map((w) => [w.walkInCustomerId, normalizeMobileKey(w.mobile)]));
  for (const k of known) byLead.set(k.leadId, k.mobile);

  return visits.map((v) => {
    if (!isMaskedValue(v.mobile)) return v;
    const full = byLead.get(v.leadId);
    return fits(full, v.mobile) ? { ...v, mobile: full } : v;
  });
}
