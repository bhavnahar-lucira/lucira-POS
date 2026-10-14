// Groups raw purchase documents (src/lib/mongo/buyerPurchases.js's
// listPurchases) into one summary row per customer — done client-side,
// AFTER the /buyers page's own date-range/document-type filters have
// already been applied to the raw purchases, so every number on a buyer's
// card (purchase count, spend, last purchase date) reflects the currently
// filtered set, not a fixed lifetime total baked into a server-side
// aggregation.
export function groupPurchasesByBuyer(purchases) {
  const byCustomer = new Map();

  for (const p of purchases) {
    const key = p.customerId;
    const dateMs = p.documentDate ? new Date(p.documentDate).getTime() : 0;
    let entry = byCustomer.get(key);
    if (!entry) {
      entry = {
        _id: key,
        customerName:   p.customerName ?? null,
        customerMobile: p.customerMobile ?? null,
        stores:         new Set(),
        invoiceCount:   0,
        orderCount:     0,
        totalSpend:     0,
        lastPurchaseDateMs: 0,
        lastPurchaseDate:   null,
      };
      byCustomer.set(key, entry);
    }
    if (p.storeName) entry.stores.add(p.storeName);
    if (p.documentType === 'invoice') entry.invoiceCount += 1;
    else if (p.documentType === 'order') entry.orderCount += 1;
    entry.totalSpend += p.totalAmount ?? 0;
    if (dateMs >= entry.lastPurchaseDateMs) {
      entry.lastPurchaseDateMs = dateMs;
      entry.lastPurchaseDate = p.documentDate;
      // Newest purchase wins for display name/mobile — a customer's name
      // can be corrected over time; the most recent record is the most
      // likely to be right.
      entry.customerName   = p.customerName ?? entry.customerName;
      entry.customerMobile = p.customerMobile ?? entry.customerMobile;
    }
  }

  return [...byCustomer.values()]
    .map(({ stores, lastPurchaseDateMs, ...rest }) => ({
      ...rest,
      stores: [...stores],
      purchaseCount: rest.invoiceCount + rest.orderCount,
    }))
    .sort((a, b) => (b.lastPurchaseDate ? new Date(b.lastPurchaseDate) : 0) - (a.lastPurchaseDate ? new Date(a.lastPurchaseDate) : 0));
}
