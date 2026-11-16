import API from '@/constants/apiEndpoints';
import { getSessionFromRequest } from '@/lib/ornaverse/session';
import {
  DATE_RE, isValidCompanyIds, getAuthorizedStores, getUserStoresCached, postUpstream, toRfc1123,
} from '@/lib/reports/serverAccess';
import { countBills } from '@/lib/reports/billCounts';
import { salesPersonDocumentTotals, salesPersonSalesDetails, listAllSalesForRepeatReport } from '@/lib/mongo/buyerPurchases';
import { syncStoreInBackground, fetchVisits } from '@/lib/nonBuyers/server';
import { deriveRepeatCustomers } from '@/lib/reports/repeatCustomers';

export const maxDuration = 60;

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

const istDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' });
const istTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });
const cleanStr = (v) => (v && v !== 'NA' ? String(v).trim() : null);

function resolveItemCategory(item) {
  if (!item) return 'Jewellery';
  const explicit = item.item_category || item.category || item.type_name || item.item_group_name;
  if (explicit && explicit !== 'NA') {
    const s = String(explicit).trim();
    if (s && s !== 'Jewellery' && s !== 'Jewelry') return s;
  }

  const name = String(item.item_name || item.name || '').toUpperCase();
  if (name.includes('RING')) return 'Rings';
  if (name.includes('EARRING') || name.includes('STUD') || name.includes('JHUMKA') || name.includes('HOOP') || name.includes('BALI')) return 'Earrings';
  if (name.includes('PENDANT')) return 'Pendants';
  if (name.includes('BRACELET')) return 'Bracelets';
  if (name.includes('BANGLE') || name.includes('KADA')) return 'Bangles';
  if (name.includes('NECKLACE') || name.includes('COLLAR') || name.includes('CHOKER') || name.includes('HAAR')) return 'Necklaces';
  if (name.includes('CHAIN')) return 'Chains';
  if (name.includes('MANGALSUTRA') || name.includes('TANMANIYA')) return 'Mangalsutra';
  if (name.includes('NOSE PIN') || name.includes('NOSEPIN') || name.includes('NATH')) return 'Nose Pins';
  if (name.includes('COIN') || name.includes('BAR') || name.includes('VEDHANI')) return 'Coins';
  return explicit || item.item_name || 'Jewellery';
}

async function fetchWalkinsByConsultant(session, companyIds, fromDate, toDate) {
  try {
    const perStore = await Promise.all(companyIds.map(async (companyId) => {
      const visits = await fetchVisits(session, companyId, fromDate);
      return visits.flatMap((v) => {
        const at = v.date ? new Date(v.date) : null;
        if (!at || Number.isNaN(at.getTime())) return [];
        const day = istDay.format(at);
        if (day < fromDate || day > toDate) return [];
        return [{
          company_id: companyId,
          visit_id: v.id,
          customer_id: v.customer_id ?? null,
          sales_representative_id: v.sales_representative_id ?? v.employee_id ?? v.sales_person_id ?? null,
          visited_on: day,
          visited_time: istTime.format(at),
          visited_at: at.toISOString(),
          customer_name: cleanStr(v.customer_name) || 'Walk-in Visitor',
          mobile: cleanStr(v.mobile),
          source: cleanStr(v.source),
          notes: cleanStr(v.notes),
        }];
      });
    }));

    const rows = perStore.flat();
    if (!rows.length) return new Map();

    const customerIds = [...new Set(rows.map((r) => r.customer_id).filter(Boolean))];
    const chunks = [];
    for (let i = 0; i < customerIds.length; i += 500) chunks.push(customerIds.slice(i, i + 500));
    const [customers, employees] = await Promise.all([
      customerIds.length > 0
        ? Promise.all(chunks.map((chunk) => postUpstream(session, API.CRM.CUSTOMER_LIST, {
            Take: 0, Criteria: [['customer_id'], 'in', [chunk]],
          })))
        : [],
      postUpstream(session, API.HR.EMPLOYEE_LIST, { Take: 0 }),
    ]);

    const names = new Map((employees?.Entities ?? []).map((e) => [e.employee_id, e.employee_name]));
    const consultantByCustomer = new Map();
    for (const c of customers.flatMap((d) => d?.Entities ?? [])) {
      const id = c.sales_representative_id;
      if (id != null) {
        consultantByCustomer.set(c.customer_id, {
          id,
          name: names.get(id) ?? `Employee #${id}`,
        });
      }
    }

    const byConsultant = new Map();
    for (const row of rows) {
      let consultant = consultantByCustomer.get(row.customer_id);
      if (!consultant && row.sales_representative_id != null) {
        consultant = {
          id: row.sales_representative_id,
          name: names.get(row.sales_representative_id) ?? `Employee #${row.sales_representative_id}`,
        };
      }
      if (!consultant) continue;

      const keyId = `${row.company_id}|${consultant.id}`;
      const keyName = `${row.company_id}|${consultant.name.toLowerCase()}`;
      const generalKey = consultant.name.toLowerCase();
      const walkinWithConsultant = { ...row, jewelry_consultant: consultant.name };

      if (!byConsultant.has(keyId)) byConsultant.set(keyId, []);
      byConsultant.get(keyId).push(walkinWithConsultant);

      if (keyName !== keyId) {
        if (!byConsultant.has(keyName)) byConsultant.set(keyName, []);
        byConsultant.get(keyName).push(walkinWithConsultant);
      }

      if (!byConsultant.has(generalKey)) byConsultant.set(generalKey, []);
      byConsultant.get(generalKey).push(walkinWithConsultant);
    }
    return byConsultant;
  } catch (err) {
    console.error('[api/reports/sales] fetchWalkinsByConsultant failed', err?.message);
    return new Map();
  }
}

function extractCustomerNames(walkins = [], customersSold = []) {
  const walkinNames = [];
  const seenWalkin = new Set();
  for (const w of walkins) {
    const name = cleanStr(w.customer_name);
    if (name && name.toLowerCase() !== 'walk-in visitor' && !seenWalkin.has(name.toLowerCase())) {
      seenWalkin.add(name.toLowerCase());
      walkinNames.push(name);
    }
  }
  if (walkinNames.length === 0 && walkins.length > 0) {
    walkinNames.push(`Walk-in Visitor (${walkins.length})`);
  }

  const soldNames = [];
  const seenSold = new Set();
  for (const c of customersSold) {
    const name = cleanStr(c.customer_name);
    if (name && name.toLowerCase() !== 'customer' && !seenSold.has(name.toLowerCase())) {
      seenSold.add(name.toLowerCase());
      soldNames.push(name);
    }
  }

  const allNames = [];
  const seenAll = new Set();
  for (const name of [...walkinNames, ...soldNames]) {
    if (!seenAll.has(name.toLowerCase())) {
      seenAll.add(name.toLowerCase());
      allNames.push(name);
    }
  }

  return {
    attended_customers: allNames.length > 0 ? allNames.join(', ') : '—',
    attended_customers_list: allNames,
    walkin_customers_names: walkinNames.length > 0 ? walkinNames.join(', ') : '—',
    sold_customers_names: soldNames.length > 0 ? soldNames.join(', ') : '—',
  };
}

function summarizeSalesDocs(docs = []) {
  let invoices = 0;
  let invoiceValue = 0;
  let orders = 0;
  let orderValue = 0;

  const categoryMap = new Map();
  const customerMap = new Map();

  for (const doc of docs) {
    const isInv = doc.documentType === 'invoice';
    const isOrd = doc.documentType === 'order';
    const amt = Number(doc.totalAmount) || 0;

    if (isInv) {
      invoices += 1;
      invoiceValue += amt;
    } else if (isOrd) {
      orders += 1;
      orderValue += amt;
    }

    const docCategories = new Set();
    for (const item of (doc.items ?? [])) {
      const cat = resolveItemCategory(item);
      docCategories.add(cat);
      const pieces = Number(item.quantity || item.pieces) || 1;
      const val = Number(item.price || item.sub_total) || 0;
      const prev = categoryMap.get(cat) || { category: cat, pieces: 0, total_value: 0 };
      prev.pieces += pieces;
      prev.total_value += val;
      categoryMap.set(cat, prev);
    }

    const custKey = `${doc.customerId ?? doc.customerMobile ?? doc.customerName}|${doc.documentNo}`;
    if (!customerMap.has(custKey)) {
      customerMap.set(custKey, {
        document_no: doc.documentNo || '—',
        document_type: doc.documentType,
        document_date: doc.documentDate ? new Date(doc.documentDate).toISOString() : null,
        customer_id: doc.customerId,
        customer_name: doc.customerName || 'Customer',
        customer_mobile: doc.customerMobile || null,
        total_amount: amt,
        categories: Array.from(docCategories),
        items_count: (doc.items ?? []).reduce((s, it) => s + (Number(it.quantity || it.pieces) || 1), 0) || 1,
      });
    }
  }

  const categories_breakdown = Array.from(categoryMap.values())
    .sort((a, b) => b.pieces - a.pieces || b.total_value - a.total_value);

  const top_categories = categories_breakdown.length > 0
    ? categories_breakdown.slice(0, 3).map((c) => `${c.category} (${c.pieces})`).join(', ')
    : '—';

  const customers_sold = Array.from(customerMap.values())
    .sort((a, b) => new Date(b.document_date || 0) - new Date(a.document_date || 0));

  const uniqueCustomerIds = new Set(docs.map((d) => d.customerId || d.customerMobile).filter(Boolean));

  return {
    invoice_count: invoices,
    invoice_value: invoiceValue,
    mto_count: orders,
    mto_value: orderValue,
    buyers_count: uniqueCustomerIds.size,
    top_categories,
    categories_breakdown,
    customers_sold,
  };
}

// Every report's rows are filtered here to the requested stores, so the browser
// never receives another store's data (SKU Velocity ignores company_ids upstream).
const REPORTS = {
  // New MTO's amount is exactly the open POS orders in the range (confirmed live 2026-11-06),
  // so its order count comes from the same report.
  async summary(session, { companyIds, fromDate, toDate }) {
    const [data, orders] = await Promise.all([
      postUpstream(session, API.REPORTS.POS_DASHBOARD, {
        company_ids: companyIds, from_date: toRfc1123(fromDate), to_date: toRfc1123(toDate),
      }),
      postUpstream(session, API.REPORTS.OPEN_POS_ORDERS, {
        document_status: 1, company_ids: companyIds, from_date: fromDate, to_date: toDate,
        IncludeColumns: ['document_no', 'company_id'],
      }),
    ]);
    const allowed = new Set(companyIds);
    const orderNos = new Set((orders?.Entities ?? []).filter((r) => allowed.has(r.company_id)).map((r) => r.document_no));
    return { data: data && { ...data, new_mto_count: orderNos.size } };
  },

  // One POS Dashboard call per store; OrnaVerse's Schemes figure only ever covers the login's current store.
  async summaryStores(session, { companyIds, fromDate, toDate }) {
    const [perStore, orders] = await Promise.all([
      Promise.all(companyIds.map((companyId) => postUpstream(session, API.REPORTS.POS_DASHBOARD, {
        company_ids: [companyId], from_date: toRfc1123(fromDate), to_date: toRfc1123(toDate),
      }))),
      postUpstream(session, API.REPORTS.OPEN_POS_ORDERS, {
        document_status: 1, company_ids: companyIds, from_date: fromDate, to_date: toDate,
        IncludeColumns: ['document_no', 'company_id'],
      }),
    ]);
    const orderNos = new Map(companyIds.map((id) => [id, new Set()]));
    for (const row of orders?.Entities ?? []) orderNos.get(row.company_id)?.add(row.document_no);
    const fields = ['total_sales_amount', 'total_order_amount', 'mto_orders', 'mto_sales', 'rts_and_mto', 'returns', 'pending_mto', 'total_urd', 'scheme'];
    return {
      rows: companyIds.map((companyId, i) => ({
        company_id: companyId,
        ...Object.fromEntries(fields.map((f) => [f, perStore[i]?.[f] ?? 0])),
        new_mto_count: orderNos.get(companyId).size,
      })),
    };
  },

  // Loaded separately from summary: it reads every bill line in the range, so it's slower.
  async summaryBills(session, params) {
    const orderCompanyIds = (await getUserStoresCached(session)).map((s) => s.company_id);
    return { data: await countBills(session, params, orderCompanyIds) };
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
    const [data, salesDocs, walkinsByConsultant] = await Promise.all([
      postUpstream(session, API.REPORTS.SALES_PERSON_WISE_SALES, {
        document_status: 1, company_ids: companyIds, from_date: fromDate, to_date: toDate,
        IncludeColumns: SALES_PERSON_COLUMNS,
      }),
      salesPersonSalesDetails({ companyIds, fromDate, toDate }).catch((err) => {
        console.error('[api/reports/sales] salesPersonSalesDetails failed', err?.message);
        return [];
      }),
      fetchWalkinsByConsultant(session, companyIds, fromDate, toDate).catch((err) => {
        console.error('[api/reports/sales] fetchWalkinsByConsultant failed', err?.message);
        return new Map();
      }),
    ]);

    const salesDocsByConsultant = new Map();
    for (const doc of (salesDocs ?? [])) {
      const keyId = `${doc.companyId}|${doc.salesPersonId}`;
      const keyName = doc.salesPersonName ? `${doc.companyId}|${doc.salesPersonName.toLowerCase()}` : null;
      if (!salesDocsByConsultant.has(keyId)) salesDocsByConsultant.set(keyId, []);
      salesDocsByConsultant.get(keyId).push(doc);
      if (keyName && keyName !== keyId) {
        if (!salesDocsByConsultant.has(keyName)) salesDocsByConsultant.set(keyName, []);
        salesDocsByConsultant.get(keyName).push(doc);
      }
    }

    const byCode = new Map(stores.map((s) => [s.company_code, s]));
    const isReturnsRow = (row) => /\(Return/i.test(String(row.employee_code ?? ''));
    const zeroCounts = {
      invoice_count: 0, invoice_value: 0, mto_count: 0, mto_value: 0,
      walkin_count: 0, buyers_count: 0, top_categories: '—',
      attended_customers: '—', attended_customers_list: [],
      walkin_customers_names: '—', sold_customers_names: '—',
      categories_breakdown: [], customers_sold: [], walkin_customers: [],
    };

    const rows = [];
    const salesRowByPerson = new Map();
    for (const row of data?.Entities ?? []) {
      const store = byCode.get(row.company_code);
      if (!store) continue;
      const keyId = `${store.company_id}|${row.sales_person_id}`;
      const keyName = row.employee_name ? `${store.company_id}|${row.employee_name.toLowerCase()}` : keyId;
      const generalKey = row.employee_name ? row.employee_name.toLowerCase() : null;

      const matchedSales = salesDocsByConsultant.get(keyId) ?? salesDocsByConsultant.get(keyName) ?? (generalKey ? salesDocsByConsultant.get(generalKey) : null) ?? [];
      const salesSummary = isReturnsRow(row) ? {} : summarizeSalesDocs(matchedSales);

      const walkins = isReturnsRow(row) ? [] : (walkinsByConsultant.get(keyId) ?? walkinsByConsultant.get(keyName) ?? (generalKey ? walkinsByConsultant.get(generalKey) : null) ?? []);
      const namesMeta = isReturnsRow(row) ? {} : extractCustomerNames(walkins, salesSummary.customers_sold ?? []);

      const out = {
        ...row,
        ...(isReturnsRow(row) ? {} : zeroCounts),
        ...salesSummary,
        ...namesMeta,
        walkin_count: walkins.length,
        walkin_customers: walkins,
        company_id: store.company_id,
        employee_name: row.employee_name ?? `Former employee #${row.sales_person_id}`,
      };
      rows.push(out);
      if (!isReturnsRow(row)) {
        salesRowByPerson.set(keyId, out);
        if (keyName !== keyId) salesRowByPerson.set(keyName, out);
        if (generalKey) salesRowByPerson.set(generalKey, out);
      }
    }

    // Include consultants who have sales in MongoDB but had no row in OrnaVerse's report
    for (const [key, docs] of salesDocsByConsultant.entries()) {
      if (salesRowByPerson.has(key)) continue;
      const [compIdStr, personIdStr] = key.split('|');
      const compId = Number(compIdStr);
      const store = stores.find((s) => s.company_id === compId);
      const firstDoc = docs[0];
      const salesSummary = summarizeSalesDocs(docs);
      const walkins = walkinsByConsultant.get(key) ?? [];
      const namesMeta = extractCustomerNames(walkins, salesSummary.customers_sold ?? []);

      const out = {
        company_id: compId,
        company_code: store?.company_code,
        mailing_name: store?.mailing_name,
        sales_person_id: Number(personIdStr) || firstDoc?.salesPersonId || null,
        employee_name: firstDoc?.salesPersonName ?? (Number(personIdStr) ? `Employee #${personIdStr}` : 'No jewelry consultant'),
        pieces: 0, weight: 0, net_weight: 0, sub_total: 0, net_amount: 0,
        ...zeroCounts,
        ...salesSummary,
        ...namesMeta,
        walkin_count: walkins.length,
        walkin_customers: walkins,
      };
      rows.push(out);
      salesRowByPerson.set(key, out);
    }

    // Include consultants who only attended walk-ins in this period
    for (const [key, walkins] of walkinsByConsultant.entries()) {
      if (salesRowByPerson.has(key) || !walkins.length) continue;
      const [compIdStr, personIdStr] = key.split('|');
      const compId = Number(compIdStr);
      const store = stores.find((s) => s.company_id === compId);
      const consultantName = walkins[0]?.jewelry_consultant || (Number(personIdStr) ? `Employee #${personIdStr}` : personIdStr);
      const namesMeta = extractCustomerNames(walkins, []);

      const out = {
        company_id: compId,
        company_code: store?.company_code,
        mailing_name: store?.mailing_name,
        sales_person_id: Number(personIdStr) || null,
        employee_name: consultantName,
        pieces: 0, weight: 0, net_weight: 0, sub_total: 0, net_amount: 0,
        ...zeroCounts,
        ...namesMeta,
        walkin_count: walkins.length,
        walkin_customers: walkins,
      };
      rows.push(out);
      salesRowByPerson.set(key, out);
    }

    return { rows, documentCountsAvailable: true };
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

  // Repeat = bought at any Lucira store on an earlier day, so every store's history is read; only the
  // selected stores' rows are returned.
  async repeat(session, { companyIds, fromDate, toDate }) {
    for (const companyId of companyIds) syncStoreInBackground(session, companyId);
    const docs = await listAllSalesForRepeatReport();
    return deriveRepeatCustomers(docs, { companyIds, fromDate, toDate });
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
