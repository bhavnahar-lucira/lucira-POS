// Repeat-customer metrics from our POS DB copy of every store's invoices and orders.
// Rules (agreed 2026-11-05):
// - A purchase is a posted invoice or MTO order; a ₹0 invoice (free gift) is not a purchase.
// - An invoice that settles an MTO order is the same purchase as that order, dated on the order. It is
//   recognised by an "Order Advance" payment referencing a posted order, or by carrying the same item as
//   an earlier posted order of that customer (the advance can point at a cancelled order it was moved from).
// - One customer's purchases at one store on one IST day are one visit.
// - A visit is a repeat if the customer bought at any Lucira store on an earlier day.
// - Return/exchange credit used to pay is not new money, so it is left out of the sale value.

const ORDER_ADVANCE = 'order advance';
const RETURN_CREDIT_MODES = new Set(['return', 'exchange']);

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
export const istDay = (date) => new Date(new Date(date).getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);

const isPosted = (doc) => doc.documentStatus !== 0 && doc.documentStatus !== 2;
const mode = (p) => String(p?.modeName ?? '').trim().toLowerCase();
const round2 = (n) => Math.round(n * 100) / 100;

// Promo giveaways (gold coins, freebies) appear on many orders and invoices, so they never link one to another.
const GIVEAWAY = /coin|freebie|gift/i;
const itemNames = (doc) => (doc.items ?? [])
  .map((i) => String(i?.item_name ?? '').trim().toLowerCase())
  .filter((n) => n && !GIVEAWAY.test(n));

function toPurchases(docs) {
  const posted = docs.filter((d) => d.customerId != null && d.documentDate && isPosted(d));
  const orders = posted.filter((d) => d.documentType === 'order');
  const orderNos = new Set(orders.filter((d) => d.documentNo).map((d) => d.documentNo));
  const ordersByCustomer = new Map();
  for (const o of orders) {
    const list = ordersByCustomer.get(o.customerId) ?? [];
    list.push({ at: new Date(o.documentDate).getTime(), items: new Set(itemNames(o)) });
    ordersByCustomer.set(o.customerId, list);
  }
  const settlesOrder = (invoice) => {
    if ((invoice.payments ?? []).some((p) => mode(p) === ORDER_ADVANCE && orderNos.has(p.refNo))) return true;
    const at = new Date(invoice.documentDate).getTime();
    const names = itemNames(invoice);
    return (ordersByCustomer.get(invoice.customerId) ?? [])
      .some((o) => o.at <= at && names.some((n) => o.items.has(n)));
  };

  return posted.flatMap((doc) => {
    const payments = doc.payments ?? [];
    if (doc.documentType === 'invoice' && (!(Number(doc.totalAmount) > 0) || settlesOrder(doc))) {
      return [];
    }
    const credit = payments.filter((p) => RETURN_CREDIT_MODES.has(mode(p))).reduce((s, p) => s + (Number(p.amount) || 0), 0);
    return [{
      customerId: doc.customerId,
      customerName: doc.customerName ?? null,
      customerMobile: doc.customerMobile ?? null,
      companyId: doc.companyId,
      day: istDay(doc.documentDate),
      documentNo: doc.documentNo ?? null,
      products: (doc.items ?? []).map((i) => String(i?.item_name ?? '').trim()).filter(Boolean),
      value: Math.max(0, (Number(doc.totalAmount) || 0) - credit),
      exchangeCredit: credit,
    }];
  });
}

/** "Ring, Gold Coin ×9" — each product once, with a count when repeated. */
function describeProducts(names) {
  const counts = new Map();
  for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1);
  return [...counts].map(([n, c]) => (c > 1 ? `${n} ×${c}` : n)).join(', ');
}

/**
 * @param {object[]} docs every store's invoices + orders (buyerPurchases_POS shape)
 * @param {{ companyIds: number[], fromDate: string, toDate: string }} scope IST dates, inclusive
 * @returns {{ total: object, purchases: object[] }} purchases = one row per repeat purchase
 */
export function deriveRepeatCustomers(docs, { companyIds, fromDate, toDate }) {
  const visits = new Map();
  const firstByCustomer = new Map();
  for (const p of toPurchases(docs)) {
    const key = `${p.customerId}|${p.companyId}|${p.day}`;
    const visit = visits.get(key);
    if (visit) {
      visit.value += p.value;
      visit.exchangeCredit += p.exchangeCredit;
      visit.products.push(...p.products);
      if (p.documentNo) visit.documentNos.push(p.documentNo);
    } else {
      visits.set(key, { ...p, products: [...p.products], documentNos: p.documentNo ? [p.documentNo] : [] });
    }
    const first = firstByCustomer.get(p.customerId);
    if (!first || p.day < first.day || (p.day === first.day && p.companyId < first.companyId)) {
      firstByCustomer.set(p.customerId, { day: p.day, companyId: p.companyId, key });
    }
  }

  const selected = new Set(companyIds);
  const total = {
    customers: new Set(), repeatCustomers: new Set(), visits: 0, repeat_visits: 0, sales: 0, repeat_sales: 0,
  };
  const purchases = [];

  for (const v of visits.values()) {
    if (!selected.has(v.companyId) || v.day < fromDate || v.day > toDate) continue;
    const first = firstByCustomer.get(v.customerId);
    const isRepeat = v.day > first.day;
    total.customers.add(v.customerId);
    total.visits += 1;
    total.sales += v.value;
    if (!isRepeat) continue;
    total.repeatCustomers.add(v.customerId);
    total.repeat_visits += 1;
    total.repeat_sales += v.value;

    purchases.push({
      company_id: v.companyId,
      customer_id: v.customerId,
      customer_name: v.customerName,
      mobile: v.customerMobile,
      purchased_on: v.day,
      year: v.day.slice(0, 4),
      month: v.day.slice(0, 7),
      documents: v.documentNos.join(', '),
      products: describeProducts(v.products),
      value: round2(v.value),
      exchange_credit: round2(v.exchangeCredit),
      first_purchase_on: first.day,
      first_purchase_year: first.day.slice(0, 4),
      first_purchase_company_id: first.companyId,
      first_purchase_products: describeProducts(visits.get(first.key).products),
    });
  }

  const pct = (part, whole) => (whole ? round2((part / whole) * 100) : 0);
  const summarize = ({ customers: all, repeatCustomers, ...s }) => ({
    ...s,
    sales: round2(s.sales),
    repeat_sales: round2(s.repeat_sales),
    purchasing_customers: all.size,
    repeat_customers: repeatCustomers.size,
    new_customers: all.size - repeatCustomers.size,
    repeat_customer_pct: pct(repeatCustomers.size, all.size),
    repeat_sales_pct: pct(s.repeat_sales, s.sales),
  });
  const repeatCount = new Map();
  for (const p of purchases) {
    const key = `${p.company_id}|${p.customer_id}`;
    repeatCount.set(key, (repeatCount.get(key) ?? 0) + 1);
  }
  return {
    total: summarize(total),
    purchases: purchases
      .map((p) => ({ ...p, repeat_count: repeatCount.get(`${p.company_id}|${p.customer_id}`) }))
      .sort((a, b) => b.purchased_on.localeCompare(a.purchased_on)),
  };
}
