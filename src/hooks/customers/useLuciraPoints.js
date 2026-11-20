import { useQuery } from '@tanstack/react-query';
import { getLoyaltyCheckoutSettings, previewLoyaltyCheckout } from '@/services/nectorService';
import { isThirdPartyLoyalty } from '@/lib/checkout/loyaltyEligibility';
import { createConcurrencyQueue } from '@/lib/concurrencyQueue';
import { QUERY_KEYS } from '@/constants/queryKeys';

// Same balance source as the customer profile's Lucira Coins card: a Preview quote for a cart large
// enough to clear any minimum, which returns the stored coin balance. Nothing is redeemed.
const PROBE_AMOUNT = 1000000;
const previewQueued = createConcurrencyQueue(previewLoyaltyCheckout, { concurrency: 2 });

/** A customer's Lucira points (Nector coins) at the store: { points, isLoading, isAvailable }. */
export function useLuciraPoints({ companyId, partyId, mobile }, { enabled = true } = {}) {
  const settingsQuery = useQuery({
    queryKey: QUERY_KEYS.NECTOR.LOYALTY_CHECKOUT_SETTINGS(companyId),
    queryFn: () => getLoyaltyCheckoutSettings(companyId),
    enabled: enabled && !!companyId,
    staleTime: 5 * 60 * 1000,
  });
  const settings = settingsQuery.data;
  const ready = enabled && !!companyId && !!partyId && !!mobile && isThirdPartyLoyalty(settings);
  const itemGroup = settings?.item_groups?.[0] ?? null;

  const balanceQuery = useQuery({
    queryKey: ['nector', 'points-balance', companyId, partyId],
    queryFn: () => previewQueued({
      companyId, partyId, mobile,
      cartAmount: PROBE_AMOUNT, applyCoins: true, applyCredits: false,
      netAmount: PROBE_AMOUNT, remainingDue: PROBE_AMOUNT,
      lines: itemGroup != null ? [{ item_group_id: itemGroup, taxable_amount: PROBE_AMOUNT }] : [],
    }),
    enabled: ready,
    staleTime: 10 * 60 * 1000,
  });

  const preview = balanceQuery.data;
  return {
    points: preview?.success ? Number(preview.coin_value) || 0 : 0,
    isLoading: settingsQuery.isLoading || (ready && balanceQuery.isLoading),
    isAvailable: ready,
  };
}
