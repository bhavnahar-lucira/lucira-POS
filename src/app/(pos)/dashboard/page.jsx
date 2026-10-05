'use client';

import { Suspense } from 'react';
import { RevenueIcon, OrdersIcon } from '@/components/features/dashboard/KPICard/icons';

import KPICard              from '@/components/features/dashboard/KPICard';
import RecentOrdersList     from '@/components/features/dashboard/RecentOrdersList';
import QuickActionGrid      from '@/components/features/dashboard/QuickActions';
import TodaysActivityStrip  from '@/components/features/dashboard/TodaysActivityStrip';
import MetalRatesTicker     from '@/components/features/dashboard/MetalRatesTicker';
import InlineLoader         from '@/components/shared/InlineLoader';
import ErrorState           from '@/components/shared/ErrorState';

import { useDashboardSummary } from '@/hooks/dashboard/useDashboardSummary';

function DashboardScreen() {
  const {
    isLoading,
    isError,
    refetch,
    todayRevenue,
    revenueTrendPct,
    todayOrderCount,
    ordersTrendDelta,
    revenueSparkline,
    recentMTO,
    recentInvoices,
    recentReturns,
    recentUrd,
    activityToday,
  } = useDashboardSummary();

  if (isError && !isLoading) {
    return (
      <>
        <MetalRatesTicker />
        <div className="max-w-6xl mx-auto w-full px-4 py-4 md:px-6">
          <ErrorState
            title="Couldn't load today's activity."
            description="Today's revenue, orders, and activity counts couldn't be fetched. Quick actions below still work normally."
            onRetry={refetch}
          />
          <div className="mt-6">
            <QuickActionGrid />
          </div>
        </div>
      </>
    );
  }

  const revenueTrend = revenueTrendPct == null
    ? undefined
    : {
        type: revenueTrendPct >= 0 ? 'up' : 'down',
        text: `${revenueTrendPct >= 0 ? '+' : ''}${revenueTrendPct.toFixed(1)}% vs yesterday`,
      };

  const ordersTrend = {
    type: ordersTrendDelta > 0 ? 'up' : ordersTrendDelta < 0 ? 'down' : 'neutral',
    text: ordersTrendDelta === 0
      ? 'Same as yesterday'
      : `${ordersTrendDelta > 0 ? '+' : ''}${ordersTrendDelta} from yesterday`,
  };

  return (
    <>
      <MetalRatesTicker />

      <div className="flex flex-col gap-6 max-w-6xl mx-auto w-full px-4 py-4 md:px-6">

        {/* ── ROW 1: KPI cards ───────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <KPICard
            label="Today's Revenue"
            value={`₹${todayRevenue.toLocaleString('en-IN')}`}
            trend={revenueTrend}
            sparkline={revenueSparkline}
            icon={RevenueIcon}
            isLoading={isLoading}
            accent
          />
          <KPICard
            label="Orders Today"
            value={String(todayOrderCount)}
            trend={ordersTrend}
            icon={OrdersIcon}
            isLoading={isLoading}
          />
        </div>

        {/* ── ROW 2: Recent orders + Quick actions ──────────────────── */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <RecentOrdersList
              mtoOrders={recentMTO}
              invoices={recentInvoices}
              returns={recentReturns}
              urdPurchases={recentUrd}
              isLoading={isLoading}
            />
          </div>
          <div className="lg:col-span-1">
            <QuickActionGrid />
          </div>
        </div>

        {/* ── ROW 3: Today's activity ────────────────────────────── */}
        <TodaysActivityStrip
          returns={activityToday.returns}
          exchanges={activityToday.exchanges}
          buybacks={activityToday.buybacks}
          urdPurchases={activityToday.urdPurchases}
          isLoading={isLoading}
        />

      </div>
    </>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<InlineLoader className="py-16" label="Loading dashboard…" />}>
      <DashboardScreen />
    </Suspense>
  );
}
