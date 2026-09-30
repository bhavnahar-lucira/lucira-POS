// src/lib/checkout/paymentAllocation.js
//
// Splits ONE combined pool of payment rows (what the operator actually
// entered, in one unified payment section) into the two independent
// paymentModes[] arrays the Invoice and Order Create calls each need —
// invoice-first: the invoice's own due amount is filled before anything
// rolls over to the order's (optional) advance. See CheckoutPaymentSection's
// own header for why the payment UI is unified but the two documents
// created from it are not (reported directly, 2026-09-30: two independent
// payment sections meant picking a tender and typing an amount twice for
// one sale).

/**
 * @param {{
 *   payments: { key: string, amount: number, nectorPromotion?: object }[],
 *   invoiceAmountDue: number,
 *   orderAmountDue: number,
 * }} params
 * @returns {{ invoicePayments: object[], orderPayments: object[] }}
 */
export function splitPaymentsAcrossDocuments({ payments, invoiceAmountDue, orderAmountDue }) {
  let invoiceRemaining = Math.max(0, invoiceAmountDue);
  let orderRemaining   = Math.max(0, orderAmountDue);
  const invoicePayments = [];
  const orderPayments   = [];

  const push = (list, payment, amount, suffix) => {
    if (amount <= 0) return;
    list.push({ ...payment, key: `${payment.key}-${suffix}`, amount });
  };

  // Nector Loyalty is re-emitted VERBATIM from its own promotion object at
  // Create time (documentFields.js's nector branch reads promo.credit_value/
  // coin_value, NOT mode.amount, once that shape is present) — splitting its
  // `amount` across two documents would resubmit the SAME full redemption on
  // BOTH, double-claiming the customer's real Nector balance. It must land
  // on exactly ONE document, whichever fits it whole (invoice preferred).
  const nectorRow = payments.find((p) => p.nectorPromotion);
  if (nectorRow) {
    const amount = Number(nectorRow.amount) || 0;
    const goesToInvoice = amount <= invoiceRemaining
      || (amount > orderRemaining && invoiceRemaining >= orderRemaining);
    if (goesToInvoice) {
      push(invoicePayments, nectorRow, amount, 'inv');
      invoiceRemaining = Math.max(0, invoiceRemaining - amount);
    } else {
      push(orderPayments, nectorRow, amount, 'ord');
      orderRemaining = Math.max(0, orderRemaining - amount);
    }
  }

  // Every other row (plain tenders AND helper/credit rows — both safe to
  // split by amount; documentFields.js's credit branch reads `mode.amount`
  // directly, no re-derivation) waterfalls: invoice's remaining need first,
  // whatever's left rolls to order, in the order the operator selected them.
  for (const payment of payments) {
    if (payment === nectorRow) continue;
    const amount = Number(payment.amount) || 0;
    if (amount <= 0) continue;
    const toInvoice = Math.min(amount, invoiceRemaining);
    const toOrder   = Math.min(amount - toInvoice, orderRemaining);
    push(invoicePayments, payment, toInvoice, 'inv');
    push(orderPayments,   payment, toOrder,   'ord');
    invoiceRemaining -= toInvoice;
    orderRemaining   -= toOrder;
  }

  return { invoicePayments, orderPayments };
}
