// Curated business reports — fetched through our own /api/reports/* routes,
// which check the operator's store access and return only the requested
// stores' rows (OrnaVerse's own endpoints don't all respect company_ids).
//
// Every report takes companyIds — the active store for a store login, or any
// selection of stores for a super admin (see the Reports page's store filter).
// `fromDate`/`toDate` are plain "YYYY-MM-DD" strings.

async function postReport(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Report failed: HTTP ${res.status}`);
  return res.json();
}

const runSalesReport = (report, params) => postReport('/api/reports/sales', { report, ...params });

/** POS Dashboard KPIs + payment-mode breakdown, aggregated across companyIds. */
export async function getPosDashboard(params) {
  return (await runSalesReport('summary', params)).data ?? null;
}

/** @returns {Promise<object[]>} category totals, one row per store × category */
export async function getCategoryWiseSales(params) {
  return (await runSalesReport('category', params)).rows ?? [];
}

/** @returns {Promise<object[]>} per-salesperson totals */
export async function getSalesPersonWiseSales(params) {
  return (await runSalesReport('salesperson', params)).rows ?? [];
}

/** @returns {Promise<object[]>} merchandising velocity per SKU */
export async function getSkuVelocity(params) {
  return (await runSalesReport('velocity', params)).rows ?? [];
}

/** @returns {Promise<object[]>} open POS order lines */
export async function getOpenPosOrders(params) {
  return (await runSalesReport('openOrders', params)).rows ?? [];
}

/** @returns {Promise<object[]>} every walk-in visit in the range (IST dates), newest first */
export async function getWalkinVisits({ companyIds, fromDate, toDate }) {
  return (await postReport('/api/reports/walkins', { companyIds, fromDate, toDate })).rows ?? [];
}

/** @returns {Promise<object[]>} jewellery stock on hand as of toDate (cost fields stripped server-side) */
export async function getStockReport({ companyIds, toDate }) {
  return (await postReport('/api/reports/stock', { companyIds, toDate })).rows ?? [];
}
