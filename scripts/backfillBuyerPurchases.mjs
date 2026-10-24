// One-time historical backfill for the Buyers module (src/lib/mongo/
// buyerPurchases.js) — walks every store's existing Invoices and Orders and
// POSTs each one to this app's own /api/buyers/record-purchase, the SAME
// route the live checkout hook (recordBuyerPurchase.js) calls, so a
// backfilled purchase and a freshly-captured one are indistinguishable.
//
// Safe to re-run in full: the target route upserts by `${documentType}-
// ${transactionId}`, so a repeat run just overwrites the same documents.
//
// AUTH — this is a cookie session, not a Bearer token. getSessionFromRequest
// (src/lib/ornaverse/session.js) only ever reads this app's own
// `pos_orna_session_*` cookie chunks — there is no Authorization/Bearer
// support anywhere in this app's own API routes or its Services/* proxy
// (confirmed by reading both before writing this script). To get a cookie
// value:
//   1. Open this app in a browser and log in normally.
//   2. Open DevTools → Network, click any request to this app's own origin
//      (e.g. a Services/* call), and copy the ENTIRE "Cookie" request header
//      value verbatim (it already contains every pos_orna_session_N chunk).
//   3. Pass it as --cookie "<value>" (quote it — it contains semicolons) or
//      via the COOKIE env var.
//
// Usage:
//   node scripts/backfillBuyerPurchases.mjs --cookie "pos_orna_session_0=...; pos_orna_session_1=..." [--base-url http://localhost:3000] [--companies 1,2,3]
//
// Without --companies, every store the logged-in account can see
// (Services/Administration/Stores/GetUserStores) is backfilled.

const args = process.argv.slice(2);

function getArg(flag) {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : undefined;
}

const COOKIE      = getArg('--cookie') ?? process.env.COOKIE;
const BASE_URL    = (getArg('--base-url') ?? process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const COMPANIES_ARG = getArg('--companies') ?? process.env.COMPANIES;
const CONCURRENCY = 5; // parallel Retrieve/record-purchase calls — gentle on OrnaVerse + Mongo

if (!COOKIE) {
  console.error('Missing --cookie (or COOKIE env var). See this script\'s header comment for how to grab one from a logged-in browser session.');
  process.exit(1);
}

async function apiPost(path, body) {
  const res = await fetch(`${BASE_URL}/api/${path}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Cookie: COOKIE },
    body:    JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${path} failed: HTTP ${res.status} ${text.slice(0, 200)}`);
  }
  return res.json();
}

async function getUserStores() {
  const data = await apiPost('Services/Administration/Stores/GetUserStores', {});
  return Array.isArray(data) ? data : [];
}

const LIST_PATH     = { order: 'Services/POS/Order/List',         invoice: 'Services/POS/Invoice/List' };
const RETRIEVE_PATH = { order: 'Services/POS/Order/Retrieve',      invoice: 'Services/POS/Invoice/Retrieve' };
const RECEIPT_PATH  = { order: 'Services/POS/OrderReceipt/List',   invoice: 'Services/POS/InvoiceReceipt/List' };

async function getList(kind, companyId) {
  return apiPost(LIST_PATH[kind], { Take: 0, Skip: 0, company_id: companyId });
}

async function getReceiptList(kind, companyId, take) {
  return apiPost(RECEIPT_PATH[kind], { Take: take, company_id: companyId });
}

async function getRetrieve(kind, transactionId) {
  return apiPost(RETRIEVE_PATH[kind], { EntityId: transactionId });
}

// Same collapse-to-one-row-per-document logic as
// src/services/crossStoreDocuments.js's groupReceiptsByTransaction — receipt
// rows are the only company_id-reliable index when List itself can't be
// trusted for a given store (see that file's own header for why).
function groupReceiptsByTransaction(rows) {
  const byTx = new Map();
  for (const row of rows) {
    const key = row.transaction_id;
    const rowDateMs = row.document_date ? new Date(row.document_date).getTime() : 0;
    const existing = byTx.get(key);
    if (existing) {
      if (rowDateMs > existing.documentDateMs) existing.documentDateMs = rowDateMs;
    } else {
      byTx.set(key, { transactionId: key, documentDateMs: rowDateMs });
    }
  }
  return [...byTx.values()];
}

// List's own rows do NOT carry line_items/promotion_details — confirmed
// live: every purchase synced via List alone came back with items:[] and
// promotions:[] (only receipt_details/payments were present). Retrieve is
// the only endpoint that returns the full document, so List (or, when it
// can't be trusted for this company, the Receipt List fallback — same
// src/services/crossStoreDocuments.js approach) is used ONLY to discover
// which transaction_ids belong to this store; every one of them is then
// Retrieved individually for the real record.
async function fetchStoreDocuments(kind, companyId) {
  const list = await getList(kind, companyId);
  const entities = list?.Entities ?? [];
  const trustworthy = entities.filter((e) => e.company_id === companyId);

  let transactionIds;
  if (trustworthy.length > 0) {
    transactionIds = trustworthy.map((e) => e.transaction_id);
  } else {
    const receiptPeek = await getReceiptList(kind, companyId, 1);
    if ((receiptPeek?.TotalCount ?? 0) === 0) {
      return []; // genuinely nothing for this store
    }

    const receiptData = await getReceiptList(kind, companyId, 0);
    transactionIds = groupReceiptsByTransaction(receiptData?.Entities ?? []).map((g) => g.transactionId);
  }

  const retrieved = await runWithConcurrency(transactionIds, async (transactionId) => {
    try {
      const data = await getRetrieve(kind, transactionId);
      return data?.Entity ?? null;
    } catch {
      return null;
    }
  }, CONCURRENCY);

  return retrieved.filter((e) => e && e.company_id === companyId);
}

function shapeRecord(kind, entity, companyId, storeName) {
  const items = (entity.line_items ?? []).map((row) => ({
    item_id:     row.item_id != null ? String(row.item_id) : undefined,
    item_name:   row.item_name ?? undefined,
    item_size:   row.item_size_name ?? undefined,
    item_weight: row.net_weight ?? row.weight ?? undefined,
    price:       row.sub_total ?? row.item_rate ?? undefined,
    quantity:    row.pieces ?? 1,
  }));

  const promoByCode = new Map();
  for (const row of entity.promotion_details ?? []) {
    if (!row?.promotion_code) continue;
    const amount = Number(row.promotion_amount) || 0;
    const existing = promoByCode.get(row.promotion_code);
    if (existing) existing.amount += amount;
    else promoByCode.set(row.promotion_code, { code: row.promotion_code, name: row.promotion_name || row.promotion_code, amount });
  }

  const payments = (entity.receipt_details ?? []).map((p) => ({
    modeName: p.mode_name ?? null,
    amount:   p.amount ?? 0,
    refNo:    p.ref_no ?? null,
  }));

  return {
    customerId:      entity.party_id,
    customerName:    entity.party_name ?? null,
    customerMobile:  entity.mobile ?? null,
    customerEmail:   null,
    customerAddress: null,
    transactionId:   entity.transaction_id,
    documentType:    kind,
    documentNo:      entity.document_no ?? null,
    documentDate:    entity.document_date ?? new Date().toISOString(),
    companyId,
    storeName:       entity.company_name ?? storeName ?? null,
    salesPersonId:   entity.sales_person_id ?? null,
    salesPersonName: null, // not resolvable from the retrieved entity alone
    items,
    promotions: [...promoByCode.values()],
    payments,
    totalAmount: entity.net_amount ?? null,
  };
}

async function recordOne(record) {
  try {
    await apiPost('buyers/record-purchase', record);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// Simple fixed-concurrency pool — no extra dependency for a one-off script.
async function runWithConcurrency(items, worker, concurrency) {
  const results = [];
  let nextIndex = 0;

  async function runNext() {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await worker(items[i]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runNext));
  return results;
}

async function backfillStore(store) {
  const companyId = store.company_id;
  const storeName = store.mailing_name;
  console.log(`\n== Store ${companyId} (${storeName}) ==`);

  let totalOk = 0;
  let totalFail = 0;

  for (const kind of ['invoice', 'order']) {
    const entities = await fetchStoreDocuments(kind, companyId);
    console.log(`  ${kind}: ${entities.length} document(s) found`);
    if (entities.length === 0) continue;

    // No customer attached (a guest sale) — nothing to retarget, same guard
    // recordBuyerPurchase.js applies live. Filtered here so the summary
    // below only counts documents actually worth recording.
    const withCustomer = entities.filter((e) => e.party_id != null);
    const records = withCustomer.map((e) => shapeRecord(kind, e, companyId, storeName));

    const results = await runWithConcurrency(records, recordOne, CONCURRENCY);
    const ok = results.filter((r) => r.ok).length;
    const fail = results.length - ok;
    totalOk += ok;
    totalFail += fail;
    console.log(`    recorded ${ok}/${records.length}${fail > 0 ? `, ${fail} failed` : ''}`);
    if (fail > 0) {
      results.filter((r) => !r.ok).slice(0, 5).forEach((r) => console.log(`      ${r.error}`));
    }
  }

  return { companyId, totalOk, totalFail };
}

async function main() {
  console.log(`Base URL: ${BASE_URL}`);

  let stores;
  if (COMPANIES_ARG) {
    stores = COMPANIES_ARG.split(',').map((id) => ({ company_id: Number(id.trim()), mailing_name: null }));
  } else {
    console.log('No --companies given — discovering every store via GetUserStores...');
    stores = await getUserStores();
  }
  console.log(`Backfilling ${stores.length} store(s).`);

  const summaries = [];
  for (const store of stores) {
    summaries.push(await backfillStore(store));
  }

  console.log('\n=== Summary ===');
  let grandOk = 0;
  let grandFail = 0;
  for (const s of summaries) {
    console.log(`  Store ${s.companyId}: ${s.totalOk} recorded, ${s.totalFail} failed`);
    grandOk += s.totalOk;
    grandFail += s.totalFail;
  }
  console.log(`Total: ${grandOk} recorded, ${grandFail} failed`);

  if (grandFail > 0) process.exit(1);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
