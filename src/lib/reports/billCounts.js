import API from '@/constants/apiEndpoints';
import { postUpstream } from '@/lib/reports/serverAccess';

const POSTED = 1;
const CONCURRENCY = 4;
const ALL_HISTORY_FROM = '2020-01-01';
const STOCK_ALLOCATION_DOC = 37;
const INVOICE_LINE_COLUMNS = [
  'transaction_id', 'document_no', 'document_date', 'company_id', 'document_status', 'is_gift', 'item_id',
  'ref_document_id', 'taxable_amount',
];

function nextDay(dateString) {
  const d = new Date(`${dateString}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// InvoiceItems/List ignores IncludeColumns and is slow without a store filter, so it's fetched per store and month.
const EARLIEST_REPORT_DAY = '2020-01-01';

function monthChunks(fromDate, toDate) {
  const chunks = [];
  let start = fromDate < EARLIEST_REPORT_DAY ? EARLIEST_REPORT_DAY : fromDate;
  while (start <= toDate) {
    const [y, m] = start.split('-').map(Number);
    const monthEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    const end = monthEnd < toDate ? monthEnd : toDate;
    chunks.push([start, end]);
    start = nextDay(end);
  }
  return chunks;
}

async function mapWithConcurrency(items, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, run));
  return results;
}

async function fetchInvoiceLines(session, companyIds, fromDate, toDate) {
  const jobs = companyIds.flatMap((companyId) => monthChunks(fromDate, toDate).map(([from, to]) => ({ companyId, from, to })));
  const pages = await mapWithConcurrency(jobs, async ({ companyId, from, to }) => {
    const data = await postUpstream(session, API.REPORTS.INVOICE_LINES, {
      Take: 0, company_id: companyId, from_date: from, to_date: to, IncludeColumns: INVOICE_LINE_COLUMNS,
    });
    return (data?.Entities ?? []).filter((l) => l.company_id === companyId && l.document_status === POSTED);
  });
  return pages.flat();
}

// Order Bifurcation filters on the order date, so it's read from the start of history to find every order fulfilled in the range.
async function fetchFulfilledOrderLines(session, orderCompanyIds, toDate) {
  const data = await postUpstream(session, API.REPORTS.ORDER_BIFURCATION, {
    Take: 0, company_ids: orderCompanyIds, from_date: ALL_HISTORY_FROM, to_date: toDate,
  });
  return new Set((data?.Entities ?? [])
    .filter((row) => row.invoice_document_no)
    .map((row) => `${row.invoice_document_no}|${row.item_id}`));
}

/**
 * Every posted bill in the range, as OrnaVerse counts invoices. A line is MTO when it fulfils a POS order
 * (OrnaVerse's Order Bifurcation report) or comes from a Stock Allocation (website order); the rest is RTS.
 * A bill holding both counts once under each. Values are pre-GST taxable amounts, the POS Dashboard's basis:
 * on LIVE (Aug–Nov 2026) value matched RTS / MTO exactly in every store-month and Closed MTO within 1%.
 */
export async function countBills(session, { companyIds, fromDate, toDate }, orderCompanyIds) {
  const [lines, fulfilled] = await Promise.all([
    fetchInvoiceLines(session, companyIds, fromDate, toDate),
    fetchFulfilledOrderLines(session, orderCompanyIds, toDate),
  ]);

  const bills = new Map();
  for (const line of lines) {
    const bill = bills.get(line.transaction_id)
      ?? { companyId: line.company_id, hasMto: false, hasRts: false, mtoValue: 0, rtsValue: 0 };
    bills.set(line.transaction_id, bill);
    const value = Number(line.taxable_amount) || 0;
    const isMto = !line.is_gift && (
      fulfilled.has(`${line.document_no}|${line.item_id}`) || line.ref_document_id === STOCK_ALLOCATION_DOC
    );
    if (isMto) bill.mtoValue += value;
    else bill.rtsValue += value;
    // A free (zero-value) gift doesn't make a bill RTS; paid gold coins are also flagged is_gift.
    if (line.is_gift && value <= 0) continue;
    if (isMto) bill.hasMto = true;
    else bill.hasRts = true;
  }
  // Every posted invoice is a bill, as OrnaVerse counts them; a bill of only free gifts is stock-issued, so RTS.
  for (const bill of bills.values()) {
    if (!bill.hasMto && !bill.hasRts) bill.hasRts = true;
  }

  const tally = (list) => {
    const sum = (key) => list.reduce((s, b) => s + b[key], 0);
    return {
      total_bill_count: list.length,
      mto_bill_count: list.filter((b) => b.hasMto).length,
      rts_bill_count: list.filter((b) => b.hasRts).length,
      mto_value: sum('mtoValue'),
      rts_value: sum('rtsValue'),
      total_value: sum('mtoValue') + sum('rtsValue'),
    };
  };
  const counted = [...bills.values()];
  const byStore = Object.fromEntries(companyIds.map((id) => [id, tally(counted.filter((b) => b.companyId === id))]));
  return { ...tally(counted), byStore };
}
