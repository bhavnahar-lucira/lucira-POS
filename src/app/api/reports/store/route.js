import { getSessionFromRequest } from '@/lib/ornaverse/session';
import {
  DATE_RE, isValidCompanyIds, getAuthorizedStores, postUpstream, toRfc1123, cachedReport,
} from '@/lib/reports/serverAccess';

export const maxDuration = 60;

const POSTED = 1;
const ALL_HISTORY_FROM = '2020-01-01';
const SCHEME_ACTIVE = 1;
const REPAIR_ORDER_DOC = 75;
const DRAFT = 0;
const CANCELLED = 2;
const HEAD_OFFICE_LOCATION = 1;

const num = (v) => Number(v) || 0;
const istDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' });
// OrnaVerse sends UTC timestamps with a zone and IST wall-clock times without one.
const dayOf = (value) => {
  if (!value) return null;
  if (typeof value === 'string' && !/(Z|[+-]\d{2}:\d{2})$/.test(value)) return value.slice(0, 10);
  return istDay.format(new Date(value));
};
const daysBetween = (fromDay, toDay) => Math.round((Date.parse(toDay) - Date.parse(fromDay)) / 86_400_000);

const entities = (data) => data?.Entities ?? [];

async function mapWithConcurrency(items, worker, limit = 4) {
  const results = new Array(items.length);
  let next = 0;
  const run = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}
const perStore = (companyIds, fetchStore) => mapWithConcurrency(companyIds, async (companyId) => (
  (await fetchStore(companyId)).map((row) => ({ ...row, company_id: companyId }))
)).then((parts) => parts.flat());

const REPORTS = {
  // OrnaVerse POS Dashboard "Payment Collections", one call per store.
  async collections(session, { companyIds, fromDate, toDate }) {
    const rows = await perStore(companyIds, async (companyId) => {
      const data = await postUpstream(session, 'Services/Reports/POSDashbaord/List', {
        company_ids: [companyId], from_date: toRfc1123(fromDate), to_date: toRfc1123(toDate),
      });
      return (data?.total_collections ?? []).filter((c) => num(c.sales) !== 0)
        .map((c) => ({ mode: c.mode_type, amount: num(c.sales) }));
    });
    return { rows };
  },

  // OrnaVerse "Order Tracking V2": one row per ordered item, filtered on the order date.
  async orderStatus(session, { companyIds, fromDate, toDate }) {
    const data = await postUpstream(session, 'Services/Reports/OrderTrackingReportV2/List', {
      Take: 0, document_status: POSTED, company_ids: companyIds, from_date: fromDate, to_date: toDate,
    });
    const allowed = new Set(companyIds);
    const today = dayOf(Date.now());
    const rows = entities(data).filter((r) => allowed.has(r.company_id)).map((r) => {
      const deliveryDay = dayOf(r.delivery_date);
      const isClosed = /shipped|cancel|delivered/i.test(r.reason_status_description ?? '');
      return {
        company_id: r.company_id,
        document_no: r.document_no,
        order_date: dayOf(r.document_date),
        party_name: r.party_name,
        mobile: r.mobile ? `${r.phone_code ? `+${r.phone_code} ` : ''}${r.mobile}` : null,
        item_code: r.item_code,
        item_name: r.item_name,
        status: r.reason_status_description || 'Unknown',
        delivery_date: deliveryDay,
        days_late: !isClosed && deliveryDay && deliveryDay < today ? daysBetween(deliveryDay, today) : null,
        bill_no: r.current_document_id === 54 ? r.current_document_no : null,
        pieces: num(r.pieces),
        weight: num(r.weight),
        net_amount: num(r.net_amount),
      };
    });
    return { rows };
  },

  // Open POS orders (all dates up to the To date) that still have money to collect.
  async balanceDue(session, { companyIds, toDate }) {
    const [orders, tracking] = await Promise.all([
      postUpstream(session, 'Services/Reports/OpenPOSOrdersReport/List', {
        Take: 0, document_status: POSTED, company_ids: companyIds, from_date: ALL_HISTORY_FROM, to_date: toDate,
      }),
      postUpstream(session, 'Services/Reports/OrderTrackingReportV2/List', {
        Take: 0, document_status: POSTED, company_ids: companyIds, from_date: ALL_HISTORY_FROM, to_date: toDate,
      }),
    ]);
    const mobileByOrder = new Map(entities(tracking).filter((r) => r.mobile)
      .map((r) => [r.document_no, `${r.phone_code ? `+${r.phone_code} ` : ''}${r.mobile}`]));
    const allowed = new Set(companyIds);
    const today = dayOf(Date.now());
    const byOrder = new Map();
    for (const r of entities(orders)) {
      if (!allowed.has(r.company_id)) continue;
      const row = byOrder.get(r.document_no) ?? {
        company_id: r.company_id,
        document_no: r.document_no,
        order_date: dayOf(r.document_date),
        delivery_date: dayOf(r.delivery_date),
        party_name: r.party_name,
        mobile: mobileByOrder.get(r.document_no) ?? null,
        employee_name: r.employee_name || null,
        net_amount: 0,
        receipt_amount: 0,
        balance_amount: 0,
      };
      row.net_amount += num(r.net_amount);
      row.receipt_amount += num(r.receipt_amount);
      row.balance_amount += num(r.balance_amount);
      byOrder.set(r.document_no, row);
    }
    const rows = [...byOrder.values()]
      .filter((r) => r.balance_amount > 1)
      .map((r) => ({ ...r, days_open: r.order_date ? daysBetween(r.order_date, today) : null }));
    return { rows };
  },

  // OrnaVerse "Customer Credits Summary": credit created at this store, net of what was used here.
  async credits(session, { companyIds }) {
    const rows = await perStore(companyIds, async (companyId) => {
      const data = await postUpstream(session, 'Services/Reports/CustomerCreditsSummary/List', {
        Take: 0, document_status: POSTED, company_ids: [companyId],
      });
      return entities(data).filter((r) => num(r.amount) > 0.5).map((r) => ({
        party_name: r.party_name,
        advance: num(r.advance),
        credit_note: num(r.credit_note),
        return_amount: num(r.return_amount),
        exchange: num(r.exchange),
        urd_purchase: num(r.urd_purchase),
        amount: num(r.amount),
      }));
    });
    return { rows };
  },

  // OrnaVerse lists scheme enrollments only for the store the operator is logged into.
  async schemeDues(session, { companyIds, toDate }) {
    if (!companyIds.includes(session.companyId)) return { rows: [], sessionStoreOnly: true };
    const data = await postUpstream(session, 'Services/POS/SchemeEnrollment/List', { Take: 0 });
    const today = dayOf(Date.now());
    const rows = entities(data)
      .filter((e) => e.scheme_status === SCHEME_ACTIVE && companyIds.includes(e.company_id))
      .flatMap((e) => {
        const months = e.scheme_monthly_details ?? [];
        const due = months.filter((m) => !m.payment_made && dayOf(m.due_date) && dayOf(m.due_date) <= toDate);
        if (!due.length) return [];
        const oldest = due.map((m) => dayOf(m.due_date)).sort()[0];
        const graceEnds = new Date(Date.parse(oldest) + num(e.grace_period) * 86_400_000).toISOString().slice(0, 10);
        return [{
          company_id: e.company_id,
          document_no: e.document_no,
          enrolled_on: dayOf(e.document_date),
          party_name: e.party_name,
          mobile: e.mobile ? `${e.phone_code ? `+${e.phone_code} ` : ''}${e.mobile}` : null,
          scheme: e.scheme_code,
          paid_count: months.filter((m) => m.payment_made).length,
          tenure: e.tenure,
          due_count: due.length,
          due_amount: due.reduce((s, m) => s + num(m.month_amount), 0),
          oldest_due: oldest,
          days_overdue: oldest < today ? daysBetween(oldest, today) : 0,
          status: oldest >= today ? 'Due' : graceEnds >= today ? 'In grace period' : 'Overdue',
        }];
      });
    return { rows, sessionStoreOnly: companyIds.length > 1 };
  },

  // OrnaVerse lists repair orders only for the logged-in store; billing comes from the store-scoped repair invoice items.
  async repairs(session, { companyIds, fromDate, toDate }) {
    if (!companyIds.includes(session.companyId)) return { rows: [], sessionStoreOnly: true };
    const [orders, billedItems] = await Promise.all([
      postUpstream(session, 'Services/Inventory/Repair/List', { Take: 0, Sort: ['transaction_id DESC'] }),
      postUpstream(session, 'Services/POS/RepairInvoiceItems/List', {
        Take: 0, document_status: POSTED, company_ids: [session.companyId],
      }),
    ]);
    const billedBy = new Map(entities(billedItems)
      .filter((l) => l.ref_document_id === REPAIR_ORDER_DOC)
      .map((l) => [l.ref_transaction_id, l.document_no]));
    const today = dayOf(Date.now());
    const inRange = entities(orders).filter((o) => {
      const day = dayOf(o.document_date);
      return o.company_id === session.companyId && day >= fromDate && day <= toDate;
    });
    const open = inRange.filter((o) => o.document_status === POSTED && !billedBy.has(o.transaction_id));
    const details = new Map(await mapWithConcurrency(open, async (o) => {
      const doc = await postUpstream(session, 'Services/Inventory/Repair/Retrieve', { EntityId: o.transaction_id })
        .then((d) => d?.Entity).catch(() => null);
      return [o.transaction_id, doc];
    }));
    const rows = inRange.map((o) => {
      const doc = details.get(o.transaction_id);
      const billedOn = billedBy.get(o.transaction_id) ?? null;
      let status;
      if (o.document_status === CANCELLED) status = 'Cancelled';
      else if (o.document_status === DRAFT) status = 'Draft';
      else if (billedOn) status = 'Billed';
      else if (doc && doc.repair_location_type !== HEAD_OFFICE_LOCATION) status = 'At workshop';
      else if (doc?.is_transferred) status = 'Sent to HO';
      else if (doc) status = 'Not sent to HO';
      else status = 'Open';
      const day = dayOf(o.document_date);
      return {
        company_id: o.company_id,
        document_no: o.document_no,
        repair_date: day,
        party_name: o.party_name,
        items: (doc?.line_items ?? []).map((l) => l.item_name || l.item_code).filter(Boolean).join(', ') || null,
        pieces: num(o.pieces),
        weight: num(o.weight),
        status,
        billed_on: billedOn,
        days_open: status === 'Billed' || status === 'Cancelled' ? null : daysBetween(day, today),
      };
    });
    return { rows, sessionStoreOnly: companyIds.length > 1 };
  },

  // OrnaVerse "Stock Aging (Branch Wise)": pieces in stock today, by days since they came in.
  async stockAging(session, { companyIds }) {
    const rows = await perStore(companyIds, async (companyId) => {
      const data = await postUpstream(session, 'Services/Inventory/StockAging/List', {
        Take: 0, document_status: POSTED, company_ids: [companyId],
      });
      return entities(data).filter((r) => num(r.total_pieces) > 0).map((r) => ({
        item_code: r.item_code,
        sku: r.sku || null,
        type_name: r.type_name,
        sub_type_name: r.sub_type_name,
        collection_name: r.collection_name,
        total_pieces: num(r.total_pieces),
        pieces30: num(r.pieces30),
        pieces60: num(r.pieces60),
        pieces120: num(r.pieces120),
        pieces180: num(r.pieces180),
        pieces270: num(r.pieces270),
        pieces360: num(r.pieces360),
        pieces360_plus: num(r.pieces360_plus),
        over_180: num(r.pieces270) + num(r.pieces360) + num(r.pieces360_plus),
      }));
    });
    return { rows };
  },

  // OrnaVerse "Stock Summary (Yesterday Vs Today)": closing stock by category, end of yesterday vs now.
  async stockMovement(session, { companyIds }) {
    const rows = await perStore(companyIds, async (companyId) => {
      const data = await postUpstream(session, 'Services/Reports/StockSummary/List', {
        Take: 0, document_status: POSTED, company_ids: [companyId],
      });
      return entities(data).map((r) => ({
        type_name: r.today_type_name || r.yes_type_name || r.type_name,
        yes_pieces: num(r.yes_pieces),
        today_pieces: num(r.today_pieces),
        change_pieces: num(r.today_pieces) - num(r.yes_pieces),
        yes_weight: num(r.yes_weight),
        today_weight: num(r.today_weight),
        change_weight: num(r.today_weight) - num(r.yes_weight),
        today_diamond_weight: num(r.today_diamond_weight),
      }));
    });
    return { rows };
  },

  // OrnaVerse "Item Discounts": every billed item with the discount given on it.
  async discounts(session, { companyIds, fromDate, toDate }) {
    const rows = await perStore(companyIds, async (companyId) => {
      const data = await postUpstream(session, 'Services/Reports/ItemDiscounts/List', {
        Take: 0, document_status: POSTED, company_ids: [companyId], from_date: fromDate, to_date: toDate,
      });
      // sub_total is the pre-discount price: sub_total − discount + tax = net (checked on LIVE).
      return entities(data).map((r) => {
        const gross = num(r.sub_total);
        return {
          document_no: r.document_no,
          bill_date: dayOf(r.document_date),
          employee_name: r.employee_name || null,
          party_name: r.party_name,
          item_name: r.item_name,
          sku: r.sku,
          type_name: r.type_name,
          gross_amount: gross,
          metal_discount: num(r.metal_discount),
          diamond_discount: num(r.diamond_discount),
          color_stone_discount: num(r.color_stone_discount),
          making_discount: num(r.operation_discount),
          discount: num(r.discount),
          discount_percent: gross > 0 ? Math.round((num(r.discount) / gross) * 1000) / 10 : 0,
          taxable_amount: gross - num(r.discount),
          net_amount: num(r.net_amount),
        };
      });
    });
    return { rows };
  },
};

export async function POST(request) {
  const session = await getSessionFromRequest(request);
  if (!session) return Response.json({ error: 'Not authenticated' }, { status: 401 });

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

  try {
    if (!(await getAuthorizedStores(session, companyIds))) {
      return Response.json({ error: 'Not authorized for this store' }, { status: 403 });
    }
  } catch (err) {
    console.error('[api/reports/store] store authorization check failed', err);
    return Response.json({ error: 'Could not verify store access' }, { status: 502 });
  }

  try {
    return Response.json(await cachedReport(session, `store:${report}`, { companyIds, fromDate, toDate }, () => run(session, { companyIds, fromDate, toDate })));
  } catch (err) {
    console.error(`[api/reports/store] ${report} failed`, err);
    return Response.json({ error: 'Report failed' }, { status: err.status === 401 ? 401 : 502 });
  }
}
