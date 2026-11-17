import APP_CONFIG from '@/constants/appConfig';

export function paymentRequiresBank(mode) {
  if (mode.creditRef) return false;
  if (mode.modeCode === 'Cash') return false;
  if (mode.modeType === APP_CONFIG.PAYMENT_MODES.LOYALTY_MODE_TYPE) return false;
  return true;
}

const formatINR = (n) => `${APP_CONFIG.CURRENCY.INR_SYMBOL}${(Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/**
 * Shared check for every screen that takes payments through CheckoutPaymentSection.
 * Returns the first problem as a user-facing message, or null when the payments are valid.
 *
 * @param {object[]} payments  rows emitted by CheckoutPaymentSection
 * @param {{ amountDue: number, allowPartial?: boolean, requireBank?: boolean, label?: string }} options
 *   allowPartial — the total may be less than amountDue (but never more).
 *   requireBank  — card/UPI/bank tenders need a bank account and reference number.
 */
export function validatePayments(payments, {
  amountDue, allowPartial = false, requireBank = true, label = 'the amount due',
}) {
  const list = payments ?? [];
  if (!list.length) return 'Select at least one payment mode.';

  for (const p of list) {
    const amount = Number(p.amount);
    if (!(amount > 0)) return `Enter an amount for ${p.modeName || 'each payment mode'}, or remove it.`;
    if (requireBank && paymentRequiresBank(p)) {
      if (p.bankPosId == null) return `Select the bank account for ${p.modeName}.`;
      if (!p.refNo?.trim()) return `Enter the reference number for ${p.modeName}.`;
    }
  }

  const total = Math.round(list.reduce((s, p) => s + (Number(p.amount) || 0), 0) * 100) / 100;
  const due = Math.round((Number(amountDue) || 0) * 100) / 100;
  if (total > due + 0.01) return `Payments (${formatINR(total)}) are more than ${label} (${formatINR(due)}).`;
  if (!allowPartial && Math.abs(total - due) > 0.01) {
    return `Payments (${formatINR(total)}) must add up to ${label} (${formatINR(due)}).`;
  }
  return null;
}

/** The fields worth keeping when a payment split is stored outside OrnaVerse. */
export function toStoredPayment(p) {
  return {
    modeId:    p.modeId ?? null,
    modeCode:  p.modeCode ?? '',
    modeName:  p.modeName ?? '',
    amount:    Number(p.amount) || 0,
    bankPosId: p.bankPosId ?? null,
    refNo:     p.refNo?.trim() || '',
  };
}
