import API from '@/constants/apiEndpoints';
import { postUpstream } from '@/lib/reports/serverAccess';

const POSTED = 1;
const CONCURRENCY = 4;
const ALL_HISTORY_FROM = '2020-01-01';
const INVOICE_LINE_COLUMNS = ['transaction_id', 'document_no', 'document_date', 'company_id', 'document_status', 'is_gift', 'item_id'];

function nextDay(dateString) {
  const d = new Date(`${dateString}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// InvoiceItems/List ignores IncludeColumns and is slow without a store filter, so it's fetched per store and month.
function monthChunks(fromDate, toDate) {
  const chunks = [];
  let start = fromDate;
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
 * Posted bills in the range with at least one non-gift line, split into MTO (a line fulfils a POS order,
 * per OrnaVerse's Order Bifurcation report) and RTS (the rest).
 * Checked on LIVE 2026-11-10 against the POS Dashboard's Closed MTO amount: exact in 67 of 74 store-months.
 */
export async function countBills(session, { companyIds, fromDate, toDate }, orderCompanyIds) {
  const [lines, fulfilled] = await Promise.all([
    fetchInvoiceLines(session, companyIds, fromDate, toDate),
    fetchFulfilledOrderLines(session, orderCompanyIds, toDate),
  ]);

  const bills = new Map();
  for (const line of lines) {
    const bill = bills.get(line.transaction_id) ?? { companyId: line.company_id, hasSale: false, mto: false };
    bills.set(line.transaction_id, bill);
    if (line.is_gift) continue;
    bill.hasSale = true;
    if (fulfilled.has(`${line.document_no}|${line.item_id}`)) bill.mto = true;
  }

  const tally = (list) => {
    const mto = list.filter((b) => b.mto).length;
    return { total_bill_count: list.length, mto_bill_count: mto, rts_bill_count: list.length - mto };
  };
  const counted = [...bills.values()].filter((b) => b.hasSale);
  const byStore = Object.fromEntries(companyIds.map((id) => [id, tally(counted.filter((b) => b.companyId === id))]));
  return { ...tally(counted), byStore };
}
