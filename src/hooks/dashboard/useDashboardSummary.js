// Aggregates real, already-fetched data for the redesigned dashboard:
//   - Today's Revenue / Orders Today KPI cards (+ vs-yesterday trend)
//   - A 7-day revenue sparkline (derived from the same order list — no
//     extra network call)
//   - Recent Orders (top 4, most recent first) — plus the same top-4 split
//     by real document type into 4 tabs (MTO/Invoice/Return/URD), reusing
//     this hook's own already-fetched allOrders/returns/urdPurchases rather
//     than firing dedicated per-tab requests.
//   - Pending Returns count
//   - Today's Activity counts (Returns / Exchange / Buyback)
//
// NOTE: Scheme Collections and a "Schemes" activity count are intentionally
// NOT included here — there is no SchemeReceipt/List endpoint wired up yet
// (Phase 23, still queued). Do not fabricate that data; add it here once
// Phase 23 lands.
//
// PHASE 22.5 UPDATE: migrated off the deleted hooks/returns, hooks/exchange,
// hooks/buyback (per-module) hooks onto the consolidated
// hooks/transactions/useTransactionLists.js hooks, which back the single
// /transactions page. Two shape differences from the old hooks, handled below:
//   1. New hooks take { skip, enabled } (fixed page size from APP_CONFIG),
//      not { page, pageSize } — page size here is the default (50 rows),
//      not the old SUMMARY_PAGE_SIZE of 300. Fine for a "today" widget in a
//      single store; revisit if a store does >50 returns/exchanges/buybacks
//      in one day.
//   2. New hooks return raw normalizeTransaction rows (no precomputed
//      `.status`) — pending-return detection is derived here from
//      raw.balance_amount / raw.receipt_amount, matching the same logic the
//      old normalizeReturn used to do inline.

import { useMemo } from 'react';
import { useAllOrders } from '@/hooks/orders/useAllOrders';
import { useReturns, useExchanges, useBuybacks, useURDPurchases } from '@/hooks/transactions/useTransactionLists';
import APP_CONFIG from '@/constants/appConfig';

// ── Date helpers ──────────────────────────────────────────────
// Mirrors the LOCAL-date comparison approach in useOrdersSummary so
// "today" and "yesterday" are computed consistently across the app.

function toLocalPrefix(date) {
  const yyyy = date.getFullYear();
  const mm   = String(date.getMonth() + 1).padStart(2, '0');
  const dd   = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getLocalDatePrefix(isoString) {
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return null;
  return toLocalPrefix(d);
}

function daysAgoPrefix(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toLocalPrefix(d);
}

// A return is "pending" when nothing has been refunded back yet.
function isPendingReturn(item) {
  const balance = item.raw?.balance_amount ?? 0;
  const receipt = item.raw?.receipt_amount ?? 0;
  return !(balance <= 0 && receipt > 0) && receipt === 0;
}

/**
 * @returns {{
 *   isLoading: boolean,
 *   isError: boolean,
 *   refetch: () => void,
 *   todayRevenue: number,
 *   revenueTrendPct: number|null,
 *   todayOrderCount: number,
 *   ordersTrendDelta: number,
 *   revenueSparkline: number[],
 *   recentMTO: Array,      — top 4 allOrders rows with documentType 'order', newest first
 *   recentInvoices: Array, — top 4 allOrders rows with documentType 'invoice', newest first
 *   recentReturns: Array,  — top 4 Returns, newest first
 *   recentUrd: Array,      — top 4 URD Purchases, newest first
 *   pendingReturnsCount: number,
 *   activityToday: { returns: number, exchanges: number, buybacks: number },
 * }}
 */
export function useDashboardSummary() {
  // PERF (2026-09-08) — this page is very likely the single most-revisited
  // screen in a shift, and useAllOrders' underlying fetch is this store's
  // ENTIRE order+invoice history (see that hook's own header for why a full
  // pull, not a date-ranged one, is the confirmed-safe choice here — a
  // server-side date filter isn't trusted given the same company_id-filter
  // bugs documented there). With the default 2-min staleTime + the app's
  // global refetchOnWindowFocus, every window refocus past 2 minutes
  // re-downloaded that whole history just to derive a few KPI numbers and 4
  // "recent orders" rows. A KPI widget doesn't need that freshness — longer
  // staleTime, and skip the focus-triggered refetch entirely (the query
  // still refetches on its own once genuinely stale, e.g. navigating back
  // after a while).
  const {
    allOrders, isLoading: ordersLoading, isError: ordersError, refetch: refetchOrders,
  } = useAllOrders({
    staleTime: APP_CONFIG.STALE_TIME.ANALYTICS,
    refetchOnWindowFocus: false,
  });
  const { items: returns,   isLoading: returnsLoading,   isError: returnsError,   refetch: refetchReturns }   = useReturns({ skip: 0 });
  const { items: exchanges, isLoading: exchangesLoading, isError: exchangesError, refetch: refetchExchanges } = useExchanges({ skip: 0 });
  const { items: buybacks,  isLoading: buybacksLoading,  isError: buybacksError,  refetch: refetchBuybacks }  = useBuybacks({ skip: 0 });
  const { items: urdPurchases, isLoading: urdLoading, isError: urdError, refetch: refetchUrd } = useURDPurchases({ skip: 0 });

  const isLoading = ordersLoading || returnsLoading || exchangesLoading || buybacksLoading || urdLoading;
  const isError   = ordersError || returnsError || exchangesError || buybacksError || urdError;

  // One retry button for the whole dashboard — re-fires every underlying
  // query that's actually wired to a network call, not just the first one
  // that happened to fail.
  const refetch = () => {
    refetchOrders?.();
    refetchReturns?.();
    refetchExchanges?.();
    refetchBuybacks?.();
    refetchUrd?.();
  };

  const summary = useMemo(() => {
    const todayPrefix     = toLocalPrefix(new Date());
    const yesterdayPrefix = daysAgoPrefix(1);

    let todayRevenue = 0;
    let todayOrderCount = 0;
    let yesterdayRevenue = 0;
    let yesterdayOrderCount = 0;

    for (const order of allOrders) {
      if (!order.orderDate) continue;
      const prefix = getLocalDatePrefix(order.orderDate);
      const amount = order.totalAmount ?? 0;

      if (prefix === todayPrefix) {
        todayRevenue += amount;
        todayOrderCount += 1;
      } else if (prefix === yesterdayPrefix) {
        yesterdayRevenue += amount;
        yesterdayOrderCount += 1;
      }
    }

    const revenueTrendPct = yesterdayRevenue > 0
      ? ((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100
      : null; // no baseline — avoid a misleading percentage

    const ordersTrendDelta = todayOrderCount - yesterdayOrderCount;

    // ── 7-day revenue sparkline (oldest → newest, includes today) ──
    const dayBuckets = new Map();
    for (let i = 6; i >= 0; i--) {
      dayBuckets.set(daysAgoPrefix(i), 0);
    }
    for (const order of allOrders) {
      if (!order.orderDate) continue;
      const prefix = getLocalDatePrefix(order.orderDate);
      if (dayBuckets.has(prefix)) {
        dayBuckets.set(prefix, dayBuckets.get(prefix) + (order.totalAmount ?? 0));
      }
    }
    const revenueSparkline = Array.from(dayBuckets.values());

    // Dashboard's "Recent Orders" panel splits allOrders by its own real
    // documentType (see useAllOrders.js/normalizeCustomerOrder) — filtered
    // by type BEFORE sorting/slicing to 4, not after (filtering an
    // already-sliced combined top-4 would silently under-fill a tab
    // whenever that top-4 happened to skew toward the other type). An Order
    // row IS a Made to Order booking on this tenant (see
    // checkoutPricingService.buildPricedLineItems's own header), never a
    // stock-backed sale, so 'order' here is exactly the MTO tab's real
    // data, not a guess or a re-label.
    const sortByOrderDate = (list) => [...list]
      .filter((o) => !!o.orderDate)
      .sort((a, b) => new Date(b.orderDate) - new Date(a.orderDate))
      .slice(0, 4);
    const recentMTO      = sortByOrderDate(allOrders.filter((o) => o.documentType === 'order'));
    const recentInvoices = sortByOrderDate(allOrders.filter((o) => o.documentType === 'invoice'));

    // Returns/URD Purchase already fetched (for the activity counts below) —
    // reused here, sorted+capped the same way recentMTO/recentInvoices are
    // above, rather than firing a second request for data already on hand.
    const sortByDocumentDate = (list) => [...list]
      .filter((r) => !!r.documentDate)
      .sort((a, b) => new Date(b.documentDate) - new Date(a.documentDate))
      .slice(0, 4);
    const recentReturns = sortByDocumentDate(returns);
    const recentUrd     = sortByDocumentDate(urdPurchases);

    const pendingReturnsCount = returns.filter(isPendingReturn).length;

    const countToday = (list) =>
      list.filter((item) => item.documentDate && getLocalDatePrefix(item.documentDate) === todayPrefix).length;

    const activityToday = {
      returns:      countToday(returns),
      exchanges:    countToday(exchanges),
      buybacks:     countToday(buybacks),
      urdPurchases: countToday(urdPurchases),
    };

    return {
      isLoading,
      isError,
      todayRevenue,
      revenueTrendPct,
      todayOrderCount,
      ordersTrendDelta,
      revenueSparkline,
      recentMTO,
      recentInvoices,
      recentReturns,
      recentUrd,
      pendingReturnsCount,
      activityToday,
    };
  }, [allOrders, returns, exchanges, buybacks, urdPurchases, isLoading, isError]);

  // refetch deliberately kept out of the memo above — it's a plain
  // function recreated every render (see above), not memo-worthy data.
  return { ...summary, refetch };
}
