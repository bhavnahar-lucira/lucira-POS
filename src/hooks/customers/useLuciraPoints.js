import { useQuery } from '@tanstack/react-query';
import { getLoyaltyCheckoutSettings, getPointsBalance } from '@/services/nectorService';
import { isThirdPartyLoyalty } from '@/lib/checkout/loyaltyEligibility';
import { createConcurrencyQueue } from '@/lib/concurrencyQueue';
import { QUERY_KEYS } from '@/constants/queryKeys';

// Same balance source as the customer profile's Lucira Coins card: a Preview quote for a cart large
// enough to clear any minimum, which returns the stored coin balance. Nothing is redeemed.
const PROBE_AMOUNT = 1000000;
export const POINTS_FRESH_MS = 10 * 60 * 1000;
const POINTS_GC_MS = 30 * 60 * 1000;
const RETRY_DELAYS_MS = [1500, 4000];

// One queue for every points lookup in the app; OrnaVerse LIVE starts returning 429 at ~6 parallel Previews.
const previewQueued = createConcurrencyQueue(getPointsBalance, { concurrency: 3 });
const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

async function fetchPointsBalance(payload) {
  for (let attempt = 0; ; attempt++) {
    const res = await previewQueued(payload);
    if (res?.success || !res?.retryable) return res;
    if (attempt >= RETRY_DELAYS_MS.length) throw new Error(res.error || 'Lucira points could not be loaded.');
    await wait(RETRY_DELAYS_MS[attempt]);
  }
}

export const pointsBalanceKey = (companyId, partyId) => ['nector', 'points-balance', companyId, Number(partyId)];

export const pointsFromPreview = (preview) => (preview?.success ? Number(preview.coin_value) || 0 : 0);

/** Query options for one customer's balance, shared by the per-row pills and the bulk sort sweep. */
export function pointsBalanceQuery({ companyId, partyId, mobile, itemGroup }) {
  return {
    queryKey: pointsBalanceKey(companyId, partyId),
    queryFn: () => fetchPointsBalance({
      companyId, partyId: Number(partyId), mobile,
      cartAmount: PROBE_AMOUNT, applyCoins: true, applyCredits: false,
      netAmount: PROBE_AMOUNT, remainingDue: PROBE_AMOUNT,
      lines: itemGroup != null ? [{ item_group_id: itemGroup, taxable_amount: PROBE_AMOUNT }] : [],
    }),
    staleTime: POINTS_FRESH_MS,
    gcTime: POINTS_GC_MS,
    retry: false,
  };
}

export function useLoyaltySettings(companyId, { enabled = true } = {}) {
  const settingsQuery = useQuery({
    queryKey: QUERY_KEYS.NECTOR.LOYALTY_CHECKOUT_SETTINGS(companyId),
    queryFn: () => getLoyaltyCheckoutSettings(companyId),
    enabled: enabled && !!companyId,
    staleTime: 5 * 60 * 1000,
  });
  const settings = settingsQuery.data;
  return {
    isLoyaltyEnabled: !!companyId && isThirdPartyLoyalty(settings),
    itemGroup: settings?.item_groups?.[0] ?? null,
    isLoading: settingsQuery.isLoading,
  };
}

/** A customer's Lucira points (Nector coins) at the store: { points, isLoading, isAvailable }. */
export function useLuciraPoints({ companyId, partyId, mobile }, { enabled = true } = {}) {
  const { isLoyaltyEnabled, itemGroup, isLoading: isSettingsLoading } = useLoyaltySettings(companyId, { enabled });
  const ready = enabled && !!partyId && !!mobile && isLoyaltyEnabled;

  const balanceQuery = useQuery({
    ...pointsBalanceQuery({ companyId, partyId, mobile, itemGroup }),
    enabled: ready,
  });

  return {
    points: pointsFromPreview(balanceQuery.data),
    isLoading: (enabled && isSettingsLoading) || (ready && balanceQuery.isLoading),
    isAvailable: ready && !balanceQuery.isError,
  };
}
