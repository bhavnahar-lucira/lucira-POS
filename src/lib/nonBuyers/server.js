// Server side of the Non-Buyers tab: walk-in visits come live from OrnaVerse (only as far back as the
// chosen period), purchases from our own POS DB copy (buyerPurchases_POS), so the browser only ever
// receives one page of results at a time, however long the store's history gets.
import { after } from 'next/server';

import { postUpstream, getUserStoresCached } from '@/lib/reports/serverAccess';
import { listStoreSales } from '@/lib/mongo/buyerPurchases';
import { syncStorePurchases } from '@/lib/ornaverse/buyerSync';
import { normalizeCrmVisit } from '@/lib/normalizers/customer';
import { deriveNonBuyers } from './deriveNonBuyers';
import API from '@/constants/apiEndpoints';

const VISIT_PAGE_SIZE = 200;
const MAX_VISIT_PAGES = 100;
const RESULT_TTL_MS = 2 * 60 * 1000;
const SYNC_INTERVAL_MS = 15 * 60 * 1000;

// shortcut: in-memory per server instance, so another instance may recompute once; move to a shared
// store if Non-Buyers ever runs on many instances under heavy use.
const results = new Map();
const lastSyncAt = new Map();

const dayOf = (value) => (value ? String(value).slice(0, 10) : null);

/**
 * The store's walk-in visits (raw OrnaVerse rows), newest first, reading page by page only until the
 * period's start date. With no start date the whole history is needed, so it is fetched in one call.
 */
export async function fetchVisits(session, companyId, fromDate) {
  const page = async (skip, take) => (await postUpstream(session, API.CRM.CUSTOMER_VISITS_LIST, {
    Take: take, Skip: skip, EqualityFilter: { company_id: companyId }, Sort: ['date DESC'],
  }))?.Entities ?? [];

  if (!fromDate) return page(0, 0);

  // Dates are stored in UTC; reading one extra day keeps visits just after midnight IST on the start date.
  const stopBefore = new Date(Date.parse(`${fromDate}T00:00:00Z`) - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const rows = [];
  for (let i = 0; i < MAX_VISIT_PAGES; i += 1) {
    const batch = await page(i * VISIT_PAGE_SIZE, VISIT_PAGE_SIZE);
    // If OrnaVerse ignored Skip, page 2 repeats page 1 — fall back to one full fetch rather than miss visits.
    if (i > 0 && batch.length && batch[0]?.id === rows[0]?.id) return page(0, 0);
    rows.push(...batch);
    if (batch.length < VISIT_PAGE_SIZE || (dayOf(batch.at(-1)?.date) ?? '') < stopBefore) break;
  }
  return rows;
}

/** A POS DB sale in the shape deriveNonBuyers indexes (the same fields the orders list used to give it). */
function toMatchingDocument(sale) {
  const date = sale.documentDate ? new Date(sale.documentDate).toISOString() : null;
  return {
    raw: { document_status: sale.documentStatus, mobile: sale.customerMobile, party_name: sale.customerName },
    balanceAmount: sale.balanceAmount,
    receiptAmount: sale.receiptAmount,
    orderDate: date,
    orderNo: sale.documentNo ?? null,
    documentType: sale.documentType,
    totalAmount: sale.totalAmount ?? null,
    customerName: sale.customerName ?? null,
  };
}

/** Refreshes our POS DB copy of the store's sales from OrnaVerse in the background, at most every 15 minutes. */
function syncStoreInBackground(session, companyId) {
  const key = `${session.env}|${companyId}`;
  if (Date.now() - (lastSyncAt.get(key) ?? 0) < SYNC_INTERVAL_MS) return;
  lastSyncAt.set(key, Date.now());
  after(async () => {
    try {
      await syncStorePurchases({ companyId, session });
      for (const resultKey of results.keys()) {
        if (resultKey.startsWith(`${key}|`)) results.delete(resultKey);
      }
    } catch (err) {
      lastSyncAt.delete(key);
      console.error('[nonBuyers] store sync failed', companyId, err?.message);
    }
  });
}

/** Every non-buyer for the store and period (cached briefly so scrolling pages don't recompute it). */
export async function getNonBuyers({ session, companyId, fromDate = '', toDate = '', minVisits = 2, refresh = false }) {
  syncStoreInBackground(session, companyId);

  const key = `${session.env}|${companyId}|${fromDate}|${toDate}|${minVisits}`;
  const cached = results.get(key);
  if (!refresh && cached && Date.now() - cached.at < RESULT_TTL_MS) return cached.rows;

  const [visits, sales] = await Promise.all([
    fetchVisits(session, companyId, fromDate),
    listStoreSales(companyId),
  ]);
  const rows = deriveNonBuyers({
    visits: visits.map(normalizeCrmVisit).filter(Boolean),
    documents: sales.map(toMatchingDocument),
    fromDate,
    toDate,
    minVisits,
  });
  results.set(key, { rows, at: Date.now() });
  return rows;
}

/**
 * Super admin "All stores": each store is still matched on its own (a non-buyer is someone who hasn't
 * bought at the store they visited), and every row says which store that was.
 */
export async function getNonBuyersAllStores({ session, ...options }) {
  const stores = await getUserStoresCached(session);
  const perStore = await Promise.all(stores.map(async (store) => {
    const rows = await getNonBuyers({ session, companyId: store.company_id, ...options });
    return rows.map((row) => ({
      ...row, key: `${store.company_id}:${row.key}`, storeId: store.company_id, storeName: store.mailing_name ?? null,
    }));
  }));
  return perStore.flat();
}

/** Search + sort over the full result, then one page of it. */
export function pageNonBuyers(rows, { search = '', sort = 'visits', skip = 0, limit = 48 }) {
  const term = search.trim().toLowerCase();
  const digits = term.replace(/\D/g, '');
  const matching = term
    ? rows.filter((n) => n.name?.toLowerCase().includes(term)
      || (digits.length >= 3 && String(n.mobile ?? '').replace(/\D/g, '').includes(digits)))
    : rows;
  const byRecent = (a, b) => new Date(b.lastVisitAt) - new Date(a.lastVisitAt);
  const sorted = [...matching].sort(sort === 'recent' ? byRecent : (a, b) => b.visitCount - a.visitCount || byRecent(a, b));
  const page = sorted.slice(skip, skip + limit);
  return {
    rows: page,
    total: sorted.length,
    pastBuyerCount: sorted.filter((n) => n.isPastBuyer).length,
    nextSkip: skip + page.length < sorted.length ? skip + page.length : null,
  };
}
