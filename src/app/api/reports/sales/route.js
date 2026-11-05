import API from '@/constants/apiEndpoints';
import { getSessionFromRequest } from '@/lib/ornaverse/session';
import {
  DATE_RE, isValidCompanyIds, getAuthorizedStores, postUpstream, toRfc1123,
} from '@/lib/reports/serverAccess';
import { salesPersonDocumentTotals } from '@/lib/mongo/buyerPurchases';
import { syncStoreInBackground } from '@/lib/nonBuyers/server';

const normalizeName = (name) => String(name ?? '').trim().toLowerCase();

const CATEGORY_COLUMNS = [
  'type_name', 'total_pieces', 'total_weight', 'total_net_weight',
  'total_sub_total', 'total_discount', 'total_tax_amount', 'total_Net_Amount',
  'total_diamond_pieces', 'total_diamond_weight', 'total_diamond_amount',
  'total_stone_pieces', 'total_stone_weight',
  'total_color_stone_pieces', 'total_color_stone_weight', 'total_color_stone_amount',
  'total_other_pieces', 'total_other_weight', 'total_other_amount',
];
const SALES_PERSON_COLUMNS = [
  'document_date', 'sales_person_id', 'employee_code', 'employee_name', 'pieces', 'weight', 'net_weight',
  'diamond_pieces', 'diamond_weight', 'diamond_amount',
  'color_stone_pieces', 'color_stone_weight', 'color_stone_amount',
  'sub_total', 'net_amount', 'company_code', 'mailing_name',
];
const OPEN_ORDER_COLUMNS = [
  'document_no', 'document_date', 'party_name',
  'pieces', 'weight', 'sub_total', 'tax_amount', 'net_amount',
  'receipt_amount', 'balance_amount', 'company_id', 'company_code',
];

// Every report's rows are filtered here to the requested stores, so the browser
// never receives another store's data (SKU Velocity ignores company_ids upstream).
const REPORTS = {
  async summary(session, { companyIds, fromDate, toDate }) {
    const data = await postUpstream(session, API.REPORTS.POS_DASHBOARD, {
      company_ids: companyIds, from_date: toRfc1123(fromDate), to_date: toRfc1123(toDate),
    });
    return { data };
  },

  // OrnaVerse merges categories across company_ids and applies Take before grouping,
  // so: one call per store, no Take (both confirmed live 2026-10-27).
  async category(session, { companyIds, fromDate, toDate }) {
    const perStore = await Promise.all(companyIds.map(async (companyId) => {
      const data = await postUpstream(session, API.REPORTS.CATEGORY_WISE_SALES, {
        document_status: 1, company_ids: [companyId], from_date: fromDate, to_date: toDate,
        IncludeColumns: CATEGORY_COLUMNS,
      });
      return (data?.Entities ?? []).map((row) => ({ ...row, company_id: companyId }));
    }));
    return { rows: perStore.flat() };
  },

  // OrnaVerse's report covers invoices only; invoice/MTO counts come from our POS DB copy of
  // every store's sales (refreshed in the background, at most every 15 minutes per store).
  async salesperson(session, { companyIds, fromDate, toDate }, stores) {
    for (const companyId of companyIds) syncStoreInBackground(session, companyId);
    const [data, documents] = await Promise.all([
      postUpstream(session, API.REPORTS.SALES_PERSON_WISE_SALES, {
        document_status: 1, company_ids: companyIds, from_date: fromDate, to_date: toDate,
        IncludeColumns: SALES_PERSON_COLUMNS,
      }),
      salesPersonDocumentTotals({ companyIds, fromDate, toDate }).catch((err) => {
        console.error('[api/reports/sales] salesperson document totals failed', err?.message);
        return null;
      }),
    ]);
    const byCode = new Map(stores.map((s) => [s.company_code, s]));
    // The report has a separate "(Return/Exchange/Buyback/URD)" row per sales person; counts go on the sales row.
    const isReturnsRow = (row) => /\(Return/i.test(String(row.employee_code ?? ''));
    const zero = documents ? { invoice_count: 0, invoice_value: 0, mto_count: 0, mto_value: 0 } : {};
    const rows = [];
    const salesRowByPerson = new Map();
    for (const row of data?.Entities ?? []) {
      const store = byCode.get(row.company_code);
      if (!store) continue;
      const out = {
        ...row, ...(isReturnsRow(row) ? {} : zero), company_id: store.company_id,
        employee_name: row.employee_name ?? `Former employee #${row.sales_person_id}`,
      };
      rows.push(out);
      if (!isReturnsRow(row)) salesRowByPerson.set(`${store.company_id}|${row.sales_person_id}`, out);
    }
    for (const d of documents ?? []) {
      const counts = {
        invoice_count: d.invoices, invoice_value: d.invoiceValue, mto_count: d.orders, mto_value: d.orderValue,
      };
      const salesRow = salesRowByPerson.get(`${d.companyId}|${d.salesPersonId}`);
      if (salesRow) {
        Object.assign(salesRow, counts);
      } else {
        // Sales people with invoices/MTO orders but no sales row in OrnaVerse's report still get a row.
        const store = stores.find((s) => s.company_id === d.companyId);
        rows.push({
          company_id: d.companyId, company_code: store?.company_code, mailing_name: store?.mailing_name,
          sales_person_id: d.salesPersonId, employee_name: d.salesPersonName ?? (d.salesPersonId ? `Employee #${d.salesPersonId}` : 'No sales person'),
          ...counts,
        });
      }
    }
    return { rows, documentCountsAvailable: documents != null };
  },

  async velocity(session, { companyIds, fromDate, toDate }, stores) {
    const data = await postUpstream(session, API.REPORTS.SKU_VELOCITY, {
      company_ids: companyIds, from_date: fromDate, to_date: toDate,
    });
    const byName = new Map(stores.map((s) => [normalizeName(s.mailing_name), s.company_id]));
    return {
      rows: (data?.Entities ?? []).flatMap((row) => {
        const companyId = byName.get(normalizeName(row.Company));
        return companyId ? [{ ...row, company_id: companyId }] : [];
      }),
    };
  },

  async openOrders(session, { companyIds, fromDate, toDate }) {
    const data = await postUpstream(session, API.REPORTS.OPEN_POS_ORDERS, {
      document_status: 1, company_ids: companyIds, from_date: fromDate, to_date: toDate,
      IncludeColumns: OPEN_ORDER_COLUMNS,
    });
    const allowed = new Set(companyIds);
    return { rows: (data?.Entities ?? []).filter((row) => allowed.has(row.company_id)) };
  },
};

export async function POST(request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { report, companyIds, fromDate, toDate } = body ?? {};
  const run = Object.hasOwn(REPORTS, report) ? REPORTS[report] : null;
  if (!run || !isValidCompanyIds(companyIds) || !DATE_RE.test(fromDate ?? '') || !DATE_RE.test(toDate ?? '')) {
    return Response.json({ error: 'report, companyIds, fromDate and toDate (YYYY-MM-DD) are required' }, { status: 400 });
  }

  let stores;
  try {
    stores = await getAuthorizedStores(session, companyIds);
  } catch (err) {
    console.error('[api/reports/sales] store authorization check failed', err);
    return Response.json({ error: 'Could not verify store access' }, { status: 502 });
  }
  if (!stores) {
    return Response.json({ error: 'Not authorized for this store' }, { status: 403 });
  }

  try {
    return Response.json(await run(session, { companyIds, fromDate, toDate }, stores));
  } catch (err) {
    console.error(`[api/reports/sales] ${report} failed`, err);
    return Response.json({ error: 'Report failed' }, { status: err.status === 401 ? 401 : 502 });
  }
}
