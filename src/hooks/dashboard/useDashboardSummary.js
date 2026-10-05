import { useMemo } from 'react';
import { useAllOrders } from '@/hooks/orders/useAllOrders';
import { useReturns, useExchanges, useBuybacks, useURDPurchases } from '@/hooks/transactions/useTransactionLists';
import APP_CONFIG from '@/constants/appConfig';

// ── Date helpers ──────────────────────────────────────────────

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
    const sortByOrderDate = (list) => [...list]
      .filter((o) => !!o.orderDate)
      .sort((a, b) => new Date(b.orderDate) - new Date(a.orderDate))
      .slice(0, 4);
    const recentMTO      = sortByOrderDate(allOrders.filter((o) => o.documentType === 'order'));
    const recentInvoices = sortByOrderDate(allOrders.filter((o) => o.documentType === 'invoice'));
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
  
  return { ...summary, refetch };
}
