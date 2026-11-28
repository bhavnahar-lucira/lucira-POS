// Cross-store Order/Invoice fetching for identities whose Order/List and
// Invoice/List are server-side restricted to their own home company.
//
// For at least one real multi-store identity, POS/Order/List and
// POS/Invoice/List ignore the company_id filter entirely and only ever
// return that identity's OWN home company's rows, no matter what company_id
// is requested. A dedicated single-store login is unaffected (its own
// company already matches whatever it asks for), so this module is a no-op
// for it.
//
// The two List endpoints are not the only way to reach this data:
//   - POS/OrderReceipt/List and POS/InvoiceReceipt/List DO honour company_id
//     correctly, even for a restricted identity. But they're RECEIPT-level,
//     not document-level — many real invoices have more than one receipt row
//     (split/instalment payments), each carrying only that instalment's
//     amount, not the document's real net_amount/balance_amount/line_items.
//     Showing these rows directly would list the same invoice twice with
//     wrong partial amounts.
//   - POS/Order/Retrieve and POS/Invoice/Retrieve (fetching ONE document by
//     its known transaction_id) are NOT restricted at all.
//
// So: use the Receipt List (correctly scoped) purely to DISCOVER which
// transaction_ids belong to the target store, collapse the receipt rows back
// into one entry per transaction_id (summing `amount` is NOT the real
// net_amount — it's only used to sort by recency, never shown to the user),
// then Retrieve only the ones on the requested PAGE for the real record.
// This path only runs when the plain List call has already proven itself
// unreliable for the requested company — see fetchStoreScopedDocuments below.
//
// PAGINATION: the grouped list (one entry per document) is the real,
// complete, correctly-scoped index. `take`/`skip` are applied to THAT
// grouped index, not to the raw receipt rows (a raw Take/Skip on receipts
// could split a multi-instalment document's rows across two pages and
// produce an incomplete group at the boundary) — so Retrieve only ever runs
// for the page actually being viewed, and `totalCount` reflects every real
// document.

import {
  getOrders, getOrderDetail,
  getInvoiceList, getInvoiceDetail,
} from '@/services/orderService';
import axiosInstance from '@/lib/axios/axiosInstance';
import { mapWithConcurrency } from '@/lib/mapWithConcurrency';
import API from '@/constants/apiEndpoints';

export async function getOrderReceiptList({ take = 0, company_id } = {}) {
  const response = await axiosInstance.post(API.ORDERS.RECEIPT_LIST, {
    Take: take,
    company_id,
  });
  return response.data;
}

export async function getInvoiceReceiptList({ take = 0, company_id } = {}) {
  const response = await axiosInstance.post(API.INVOICE_RECEIPTS.LIST, {
    Take: take,
    company_id,
  });
  return response.data;
}

/**
 * Collapses receipt-level rows (one per payment/instalment) back into one
 * entry per document, newest first. `amount` here is the SUM of that
 * document's receipts — real money, but not the same figure as net_amount
 * (a partly-paid document's receipts sum to less than its total) — used
 * only to pick which transaction_ids to Retrieve, never shown to the user.
 */
function groupReceiptsByTransaction(rows) {
  // `documentDateMs` is computed ONCE per raw receipt row here, instead of
  // re-parsing date strings into Date objects both inside this loop (every
  // duplicate row for the same transaction_id) and again on every comparator
  // invocation during the final .sort() below. `rows` is this store's entire
  // receipt history when this fallback path runs, so for a long-lived store
  // this can be hundreds to low-thousands of rows.
  const byTx = new Map();
  for (const row of rows) {
    const key = row.transaction_id;
    const rowDateMs = row.document_date ? new Date(row.document_date).getTime() : 0;
    const existing = byTx.get(key);
    if (existing) {
      existing.amount += row.amount ?? 0;
      if (rowDateMs > existing.documentDateMs) {
        existing.documentDate = row.document_date;
        existing.documentDateMs = rowDateMs;
      }
    } else {
      byTx.set(key, {
        transactionId: row.transaction_id,
        documentDate: row.document_date,
        documentDateMs: rowDateMs,
        amount: row.amount ?? 0,
      });
    }
  }
  return [...byTx.values()].sort((a, b) => b.documentDateMs - a.documentDateMs);
}

/**
 * The Retrieve-based fallback path — only reached once List has already
 * proven unreliable for this company (see fetchStoreScopedDocuments).
 * `take`/`skip` page the GROUPED (one-per-document) index, not the raw
 * receipt rows — see this file's header for why that distinction matters.
 * `take: 0` (or omitted) means "every document", matching how
 * getOrders/getInvoiceList already treat Take: 0 elsewhere in this app.
 * @param {{ kind: 'order'|'invoice', companyId: number, take?: number, skip?: number }} params
 * @returns {Promise<{ entities: object[], totalCount: number }>} raw
 *   OrderRow[]/InvoiceRow[] (Retrieve shape), scoped to companyId, newest
 *   first; totalCount is the real number of distinct documents for this
 *   store, independent of how many were actually Retrieved for this page
 */
const RETRIEVE_CONCURRENCY = 3;

export async function fetchDocumentsByRetrieve({ kind, companyId, take = 0, skip = 0 }) {
  const getReceipts = kind === 'order' ? getOrderReceiptList : getInvoiceReceiptList;
  const getDetail   = kind === 'order' ? getOrderDetail      : getInvoiceDetail;

  const receiptData = await getReceipts({ take: 0, company_id: companyId });
  const receiptRows = receiptData?.Entities ?? [];
  const grouped = groupReceiptsByTransaction(receiptRows);
  const page = take > 0 ? grouped.slice(skip, skip + take) : grouped;

  const details = await mapWithConcurrency(
    page,
    ({ transactionId }) => getDetail(transactionId).catch(() => null),
    RETRIEVE_CONCURRENCY,
  );

  // Defensive re-check, not redundant: Retrieve has no reason to hand back a
  // different store's record given a transaction_id sourced from a
  // company_id-filtered receipt list, but this is financial data — fail
  // closed rather than trust that chain silently.
  const entities = details
    .map((d) => d?.Entity ?? null)
    .filter((entity) => entity && entity.company_id === companyId);

  return { entities, totalCount: grouped.length };
}

/**
 * Fetches Orders or Invoices for a store, working around the confirmed
 * server-side restriction where List silently returns the wrong company's
 * data for some identities (see this file's header comment). Tries the
 * cheap List call first; only pays for the Retrieve-based fallback when
 * List's own response proves it can't be trusted for this company.
 *
 * @param {{ kind: 'order'|'invoice', companyId: number, take?: number, skip?: number }} params
 * @returns {Promise<{ entities: object[], totalCount: number, viaFallback: boolean }>}
 */
export async function fetchStoreScopedDocuments({ kind, companyId, take = 0, skip = 0, sort, fallbackTake = take }) {
  const list = kind === 'order'
    ? await getOrders({ take, skip, company_id: companyId, sort })
    : await getInvoiceList({ take, skip, company_id: companyId, sort });

  const entities = list?.Entities ?? [];

  if (entities.some((e) => e.company_id === companyId)) {
    // At least one row genuinely belongs to the requested store — List is
    // trustworthy here, whatever else it does.
    return { entities, totalCount: list?.TotalCount ?? entities.length, viaFallback: false };
  }

  // List returned nothing at all, or returned some OTHER company's rows.
  // Either way its own TotalCount can't be trusted at face value — a
  // restricted identity can see Invoice/List report TotalCount: 0 even
  // though the store genuinely has hundreds of real invoices, while
  // Order/List reports a nonzero TotalCount alongside the wrong company's
  // rows — different failure signatures, so "TotalCount === 0" is not proof
  // of a genuinely empty store for every endpoint. The receipt endpoint is
  // the one source of truth for "does this store actually have anything";
  // peek at its count (Take: 1, cheap) before deciding.
  const getReceipts = kind === 'order' ? getOrderReceiptList : getInvoiceReceiptList;
  const receiptPeek = await getReceipts({ take: 1, company_id: companyId });
  const receiptTotal = receiptPeek?.TotalCount ?? 0;

  if (receiptTotal === 0) {
    // Genuinely nothing for this store — not the restriction.
    return { entities: [], totalCount: 0, viaFallback: false };
  }

  const fallback = await fetchDocumentsByRetrieve({ kind, companyId, take: fallbackTake, skip });
  return { entities: fallback.entities, totalCount: fallback.totalCount, viaFallback: true };
}
