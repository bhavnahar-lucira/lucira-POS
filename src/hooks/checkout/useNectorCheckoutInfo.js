import { useQuery } from '@tanstack/react-query';
import { getLoyaltyCheckoutSettings, previewLoyaltyCheckout } from '@/services/nectorService';
import { isThirdPartyLoyalty, evaluateLoyaltyEligibility } from '@/lib/checkout/loyaltyEligibility';
import { QUERY_KEYS } from '@/constants/queryKeys';

/**
 * @param {{
 *   mobile: string|null, companyId: number|null, partyId: number|null,
 *   netAmount: number, remainingDue: number,
 *   lineItems: { item_group_id: number|null, taxable_amount: number }[],
 * }} params
 * @param {{ enabled?: boolean }} [options]
 * @returns {{
 *   promotion: { coin_value: number, credit_value: number, cart_amount: number }|null,
 *     — shaped to drop straight into documentFields.js's Nector receipt branch.
 *   isEligible: boolean, isLoading: boolean, isError: boolean,
 *   ineligibleReason: string|null, — a real, readable reason when settings-level
 *     rules (min invoice value / item group) block it BEFORE ever calling Preview.
 * }}
 */
export function useNectorCheckoutInfo(
  { mobile, companyId, partyId, netAmount, remainingDue, lineItems = [] },
  { enabled = true } = {}
) {
  const settingsQuery = useQuery({
    queryKey: QUERY_KEYS.NECTOR.LOYALTY_CHECKOUT_SETTINGS(companyId),
    queryFn: () => getLoyaltyCheckoutSettings(companyId),
    enabled: enabled && !!companyId,
    staleTime: 5 * 60 * 1000, // near-static, same as payment modes/document config
  });

  const settings = settingsQuery.data;
  const isThirdParty = isThirdPartyLoyalty(settings);

  const lines = lineItems.map((li) => ({
    item_group_id: li.item_group_id ?? null,
    taxable_amount: li.taxable_amount ?? 0,
  }));

  const eligibility = settings
    ? evaluateLoyaltyEligibility({
        netAmount, remainingDue, minInvoiceValue: settings.min_invoice_value,
        itemGroups: settings.item_groups, lines,
      })
    : null;

  const readyForPreview = enabled && isThirdParty && !!eligibility?.ok
    && !!mobile && !!companyId && !!partyId && netAmount > 0;

  const previewQuery = useQuery({
    queryKey: QUERY_KEYS.NECTOR.LOYALTY_CHECKOUT_PREVIEW(partyId, eligibility?.eligibleAmount, companyId),
    queryFn: () => previewLoyaltyCheckout({
      companyId, partyId, cartAmount: eligibility.eligibleAmount,
      applyCoins: true, applyCredits: settings?.enable_nector_credits === true,
      mobile, netAmount, remainingDue, lines,
    }),
    enabled: readyForPreview,
    staleTime: 0,
  });

  const preview = previewQuery.data;
  const isRedeemable = !!preview?.success
    && ((Number(preview.coin_value) || 0) + (Number(preview.credit_value) || 0)) > 0.01;

  return {
    promotion: isRedeemable ? preview : null,
    isEligible: isRedeemable,
    isLoading: settingsQuery.isLoading || (readyForPreview && previewQuery.isLoading),
    isError: settingsQuery.isError || previewQuery.isError,
    ineligibleReason: !isThirdParty
      ? null // not a third-party-loyalty tenant — Loyalty tile simply doesn't apply
      : eligibility && !eligibility.ok
        ? eligibility.error
        : preview && !preview.success
          ? preview.error ?? 'Loyalty points could not be loaded.'
          : null,
  };
}
