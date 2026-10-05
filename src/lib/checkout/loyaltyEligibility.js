/**
 * @param {object|null} settings — getLoyaltyCheckoutSettings()'s result
 * @returns {boolean} true when Nector (the third-party provider) is the
 *   configured loyalty backend — loyalty_provider is a numeric enum on this
 *   tenant (1), but also accepts a literal "thirdparty" string per their own
 *   client's tolerance for both shapes.
 */
export function isThirdPartyLoyalty(settings) {
  const v = settings?.loyalty_provider;
  if (v == null || v === '') return false;
  if (v === 1 || Number(v) === 1) return true;
  return String(v).trim().toLowerCase() === 'thirdparty';
}

/**
 * @param {{
 *   netAmount: number, remainingDue: number,
 *   minInvoiceValue?: number|null, itemGroups?: number[]|null,
 *   lines: { item_group_id: number|null, taxable_amount: number }[],
 * }} params
 * @returns {{ ok: boolean, error?: string, eligibleAmount: number }}
 */
export function evaluateLoyaltyEligibility({
  netAmount = 0, remainingDue, minInvoiceValue, itemGroups, lines = [],
}) {
  const groups = itemGroups ?? [];
  const eligibleAmount = groups.length === 0
    ? netAmount
    : lines
      .filter((l) => l.item_group_id != null && groups.includes(Number(l.item_group_id)))
      .reduce((sum, l) => sum + (l.taxable_amount ?? 0), 0);

  const min = minInvoiceValue ?? 0;
  if (min > 0 && netAmount < min) {
    return { ok: false, error: `Invoice net amount must be at least ${min} to apply loyalty.`, eligibleAmount: 0 };
  }
  if (min > 0 && groups.length > 0 && eligibleAmount < min) {
    return { ok: false, error: `Eligible item-group taxable amount must be at least ${min} to apply loyalty.`, eligibleAmount: 0 };
  }
  return { ok: true, eligibleAmount: Math.max(0, Math.min(eligibleAmount, remainingDue ?? eligibleAmount)) };
}
