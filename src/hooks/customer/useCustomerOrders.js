import APP_CONFIG from '@/constants/appConfig';

function isEmptyValue(v) {
  return v === null || v === undefined || v === 'NA' || v === '';
}

/**
 * Shared by normalizeCustomerOrder (below) and useInvoiceList.js's
 * normalizeInvoice — one place for the document_status precedence so the
 * customer profile Orders tab, /orders, and /invoices can't drift apart
 * on what "Cancelled" means again.
 * @param {number|null|undefined} documentStatus — 0 Draft / 1 Posted / 2 Cancelled
 * @param {number|null} balanceAmount
 * @param {number|null} receiptAmount
 * @returns {string} one of APP_CONFIG.ORDER_STATUS
 */
export function deriveDocumentStatus(documentStatus, balanceAmount, receiptAmount) {
  if (documentStatus === 2) return APP_CONFIG.ORDER_STATUS.CANCELLED;
  if (documentStatus === 0) return APP_CONFIG.ORDER_STATUS.DRAFT;

  if (balanceAmount != null && balanceAmount > 0) {
    return receiptAmount != null && receiptAmount > 0
      ? APP_CONFIG.ORDER_STATUS.PARTIAL
      : APP_CONFIG.ORDER_STATUS.DUE;
  }
  return APP_CONFIG.ORDER_STATUS.PAID;
}

/**
 * @param {object} entity — raw OrderRow or InvoiceRow
 * @param {'order'|'invoice'} documentType — which endpoint this came from;
 *   surfaced so a merged list (e.g. the Orders panel) can still tell them
 *   apart for display/actions, even though the fields below are identical.
 */
export function normalizeCustomerOrder(entity, documentType = 'order') {
  if (!entity) return null;
  const get = (key) => (!isEmptyValue(entity[key]) ? entity[key] : null);

  const balanceAmount = get('balance_amount');
  const receiptAmount = get('receipt_amount');
  const status = deriveDocumentStatus(entity.document_status, balanceAmount, receiptAmount);

  return {
    orderId:       get('transaction_id'),
    orderNo:       get('document_no'),
    orderDate:     get('document_date'),
    customerId:    get('party_id'),
    customerName:  get('party_name'),
    totalAmount:   get('net_amount'),
    balanceAmount,
    receiptAmount,
    status,
    companyId:     get('company_id'),
    companyName:   get('company_name'),
    lineItems:     Array.isArray(entity.line_items) ? entity.line_items : [],
    documentType,
    raw: entity,
  };
}

// Note: the useCustomerOrders() hook that used to live in this file was
// removed as dead code (superseded by Customer 360). deriveDocumentStatus and
// normalizeCustomerOrder above are still used directly by useInvoiceList.js
// and useAllOrders.js.