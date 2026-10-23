import { deriveDocumentStatus } from '@/hooks/customer/useCustomerOrders';
import APP_CONFIG from '@/constants/appConfig';

// Groups raw purchase documents (src/lib/mongo/buyerPurchases.js's
// listPurchases) into one summary row per customer — done client-side,
// AFTER the /buyers page's own date-range/document-type filters have
// already been applied to the raw purchases, so every number on a buyer's
// card (purchase count, spend, last purchase date) reflects the currently
// filtered set, not a fixed lifetime total baked into a server-side
// aggregation.
//
// Also rolls up each buyer's post-sale OUTCOMES (returned/exchanged/bought
// back an item, or had an order/return/etc cancelled) — same documentType/
// documentStatus buyerSync.js now syncs for return/exchange/buyback
// alongside invoice/order. This is the lead-quality signal: a buyer who
// gave items back (or cancelled) is a weaker retargeting lead than one
// whose purchases all stuck — surfaced so staff know who's worth a
// follow-up call and who to skip.
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
        returnCount:    0,
        exchangeCount:  0,
        buybackCount:   0,
        cancelledCount: 0,
        totalSpend:     0,
        lastPurchaseDateMs: 0,
        lastPurchaseDate:   null,
      };
      byCustomer.set(key, entry);
    }
    if (p.storeName) entry.stores.add(p.storeName);
    if (p.documentType === 'invoice') entry.invoiceCount += 1;
    else if (p.documentType === 'order') entry.orderCount += 1;
    else if (p.documentType === 'return') entry.returnCount += 1;
    else if (p.documentType === 'exchange') entry.exchangeCount += 1;
    else if (p.documentType === 'buyback') entry.buybackCount += 1;

    if (deriveDocumentStatus(p.documentStatus, p.balanceAmount, p.receiptAmount) === APP_CONFIG.ORDER_STATUS.CANCELLED) {
      entry.cancelledCount += 1;
    }

    // Only invoice/order amounts count as real spend — a return/exchange/
    // buyback's totalAmount is what came BACK to the customer, not spend.
    if (p.documentType === 'invoice' || p.documentType === 'order') {
      entry.totalSpend += p.totalAmount ?? 0;
    }
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
      hasOutcomes: rest.returnCount + rest.exchangeCount + rest.buybackCount + rest.cancelledCount > 0,
    }))
    .sort((a, b) => (b.lastPurchaseDate ? new Date(b.lastPurchaseDate) : 0) - (a.lastPurchaseDate ? new Date(a.lastPurchaseDate) : 0));
}
