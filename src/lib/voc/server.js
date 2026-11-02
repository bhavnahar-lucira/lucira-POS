import API from '@/constants/apiEndpoints';
import { postUpstream, DATE_RE } from '@/lib/reports/serverAccess';
import { buildFilter, istDay } from '@/lib/mongo/vocResponses';
import { QUESTIONS } from './questions';

const PURCHASE_VALUES = QUESTIONS.find((q) => q.id === 'q7').options.map((o) => o.value);
const POSTED = 1;
const LOOKUP_CONCURRENCY = 6;
const MOBILE_TTL_MS = 10 * 60 * 1000;

export const positiveInt = (value) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

export const toPublicResponse = ({ _id, ...rest }) => ({ id: String(_id), ...rest });

/** The list/summary/export filter from the URL, limited to what this login may see. Returns { filter } or { error, status }. */
export function filterFromParams(session, params) {
  const fromDay = params.get('from') || undefined;
  const toDay = params.get('to') || undefined;
  if ((fromDay && !DATE_RE.test(fromDay)) || (toDay && !DATE_RE.test(toDay))) {
    return { error: 'Dates must be YYYY-MM-DD', status: 400 };
  }
  const purchased = params.get('purchased') || undefined;
  if (purchased && !PURCHASE_VALUES.includes(purchased)) return { error: 'Invalid purchase filter', status: 400 };

  let storeIds;
  if (session.isSuperAdmin) {
    const storeId = positiveInt(params.get('storeId'));
    storeIds = storeId ? [storeId] : null;
  } else if (session.companyId) {
    storeIds = [session.companyId];
  } else {
    return { error: 'Switch to a store to view Voice of Lucira.', status: 403 };
  }
  return { filter: buildFilter({ env: session.env, storeIds, fromDay, toDay, jcId: positiveInt(params.get('jcId')), purchased }) };
}

async function mapLimited(items, worker) {
  const results = new Array(items.length);
  let next = 0;
  const run = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(LOOKUP_CONCURRENCY, items.length) }, run));
  return results;
}

// A plain OrnaVerse date is already the store's day; a full timestamp is converted to India time.
export const documentDay = (value) => (/(Z|[+-]\d\d:\d\d)$/.test(value) ? istDay(new Date(value)) : String(value).slice(0, 10));

/** 'yes' if the customer has a posted (not draft or cancelled) invoice or order at this login's store today, otherwise 'no'. */
export async function purchasedToday(session, partyId) {
  const today = istDay();
  const tx = await postUpstream(session, API.CUSTOMER_HISTORY.PARTY_TRANSACTIONS, { party_id: partyId });
  const bought = [...(tx?.Invoices ?? []), ...(tx?.Orders ?? [])].some((row) => row.company_id === session.companyId
    && row.document_status === POSTED
    && row.document_date && documentDay(row.document_date) === today);
  return bought ? 'yes' : 'no';
}

const mobileCache = new Map();

/** Super admins only: each row's mobile as OrnaVerse shows it to them (unmasked), in place of the stored one. */
export async function withFullMobiles(session, rows) {
  if (!session.isSuperAdmin || !rows.length) return rows;
  const mobiles = new Map();
  const missing = [];
  for (const id of new Set(rows.map((r) => r.customer.party_id))) {
    const hit = mobileCache.get(`${session.env}|${id}`);
    if (hit && hit.expiresAt > Date.now()) mobiles.set(id, hit.mobile);
    else missing.push(id);
  }
  await mapLimited(missing, async (id) => {
    try {
      const mobile = (await postUpstream(session, API.CUSTOMERS.RETRIEVE, { EntityId: id }))?.Entity?.mobile ?? null;
      mobileCache.set(`${session.env}|${id}`, { mobile, expiresAt: Date.now() + MOBILE_TTL_MS });
      mobiles.set(id, mobile);
    } catch {
      // keep the stored mobile for this customer
    }
  });
  return rows.map((r) => {
    const mobile = mobiles.get(r.customer.party_id);
    return mobile ? { ...r, customer: { ...r.customer, mobile } } : r;
  });
}
