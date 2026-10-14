// src/lib/checkout/recordBuyerPurchase.js
//
// Fire-and-forget write into the Buyers module (see src/lib/mongo/
// buyerPurchases.js) right after a real sale succeeds — same non-blocking
// pattern useUpdateCustomer.js's syncCustomerUpdateToShopify already uses
// (never fails the sale confirmation over this). Shared by
// useCreateInvoice.js and useCreateOrder.js's onSuccess so the exact same
// shaping logic (and the SAME record-purchase endpoint the historical
// backfill script also posts to) is never duplicated or allowed to drift.
//
// Reuses toOrderItems/summarizeAppliedPromotions from orderTracking.js —
// the same mapping already proven correct for the analytics event this
// fires alongside.

import { toOrderItems, summarizeAppliedPromotions } from '@/lib/analytics/orderTracking';

/**
 * @param {'invoice'|'order'} documentType
 * @param {number} transactionId
 * @param {object} entity — the built InvoiceRow/OrderRow (buildInvoiceEntity/
 *   buildOrderEntity's return value)
 * @param {object[]} lineItems — the priced line items on that entity
 * @param {{customerId, customerName, customerMobile, customerEmail, customerAddress}} customer
 * @param {{activeStoreId, activeStoreName}} store
 * @param {{modeCode?, modeName?, amount, refNo?}[]} paymentModes
 * @param {number} salesPersonId
 * @param {string} [salesPersonName]
 */
export function recordBuyerPurchase({
  documentType, transactionId, entity, lineItems,
  customerId, customerName, customerMobile, customerEmail, customerAddress,
  activeStoreId, activeStoreName,
  paymentModes, salesPersonId, salesPersonName,
}) {
  // A guest sale (no customer attached) has nothing to build a retargeting
  // history against — nothing to record.
  if (!customerId) return;

  const payments = (paymentModes ?? []).map((p) => ({
    modeName: p.modeCode ?? p.modeName ?? null,
    amount:   p.amount ?? 0,
    refNo:    p.refNo ?? null,
  }));

  const body = {
    customerId, customerName, customerMobile, customerEmail, customerAddress,
    transactionId, documentType,
    documentNo:   entity?.document_no ?? null,
    documentDate: entity?.document_date ?? new Date().toISOString(),
    companyId:    activeStoreId,
    storeName:    activeStoreName,
    salesPersonId, salesPersonName,
    items:       toOrderItems(lineItems),
    promotions:  summarizeAppliedPromotions(entity?.promotion_details),
    payments,
    totalAmount: entity?.net_amount ?? null,
  };

  fetch('/api/buyers/record-purchase', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  }).catch((err) => console.warn('[recordBuyerPurchase] failed', err));
}
