'use client';

import { Suspense, useState } from 'react';
import { useSelector } from 'react-redux';
import { BellRing } from 'lucide-react';
import { RevenueIcon, OrdersIcon } from '@/components/features/dashboard/KPICard/icons';

import KPICard              from '@/components/features/dashboard/KPICard';
import RecentOrdersList     from '@/components/features/dashboard/RecentOrdersList';
import QuickActionGrid      from '@/components/features/dashboard/QuickActions';
import TodaysActivityStrip  from '@/components/features/dashboard/TodaysActivityStrip';
import MetalRatesTicker     from '@/components/features/dashboard/MetalRatesTicker';
import UpcomingEventsCard   from '@/components/features/dashboard/UpcomingEventsCard';
import SchemeRemindersCard  from '@/components/features/dashboard/SchemeRemindersCard';
import LapsedBuyersCard     from '@/components/features/dashboard/LapsedBuyersCard';
import VocTodayCard         from '@/components/features/dashboard/VocTodayCard';
import InlineLoader         from '@/components/shared/InlineLoader';
import ErrorState           from '@/components/shared/ErrorState';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { selectActiveStoreId } from '@/store/slices/storeSlice';
import { useSalesPersonOptions } from '@/hooks/schemes/useSalesPersonOptions';

import { useDashboardSummary } from '@/hooks/dashboard/useDashboardSummary';
import { useUpcomingEvents }   from '@/hooks/dashboard/useUpcomingEvents';
import { useSchemeReminders }  from '@/hooks/dashboard/useSchemeReminders';

const ALL_JC = 'all';

function JcFilter({ storeId, value, onChange, documentJcs }) {
  const { salesPersons, isLoading } = useSalesPersonOptions(storeId);
  const options = new Map(documentJcs);
  for (const p of salesPersons) options.set(p.employee_id, p.employee_name);
  const sorted = [...options].sort((a, b) => String(a[1]).localeCompare(String(b[1])));
  return (
    <Select value={value == null ? ALL_JC : String(value)} onValueChange={(v) => onChange(v === ALL_JC ? null : Number(v))}>
      <SelectTrigger className="h-11 w-full bg-card sm:w-64" aria-label="Filter by jewelry consultant">
        <SelectValue placeholder={isLoading ? 'Loading…' : 'All jewelry consultants'} />
      </SelectTrigger>
      <SelectContent className="max-h-64 overflow-y-auto">
        <SelectItem value={ALL_JC}>All jewelry consultants</SelectItem>
        {sorted.map(([id, name]) => (
          <SelectItem key={id} value={String(id)}>{name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function DashboardScreen() {
  const activeStoreId = useSelector(selectActiveStoreId);
  const [jcSelection, setJcSelection] = useState({ storeId: null, jcId: null });
  const jcId = jcSelection.storeId === activeStoreId ? jcSelection.jcId : null;
  const setJcId = (id) => setJcSelection({ storeId: activeStoreId, jcId: id });

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
    jcOptions,
  } = useDashboardSummary({ jcId });

  const { birthdays, anniversaries, isLoading: eventsLoading } = useUpcomingEvents();
  const { due: schemesDue, overdue: schemesOverdue, maturing: schemesMaturing, isLoading: schemesLoading, jcOptions: schemeJcs } = useSchemeReminders({ jcId });

  if (isError && !isLoading) {
    return (
      <>
        <MetalRatesTicker />
        <div className="max-w-[1600px] mx-auto w-full px-4 py-4 md:px-6">
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

      <div className="flex flex-col gap-6 max-w-[1600px] mx-auto w-full px-4 py-4 md:px-6">

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          {jcId != null && (
            <p className="text-xs text-muted-foreground sm:mr-auto">
              Showing this jewelry consultant&rsquo;s sales, orders, schemes and feedback. Returns, exchanges and URD aren&rsquo;t tracked per consultant.
            </p>
          )}
          <JcFilter storeId={activeStoreId} value={jcId} onChange={setJcId} documentJcs={[...schemeJcs, ...jcOptions]} />
        </div>

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
              salesOnly={jcId != null}
            />
          </div>
          <div className="lg:col-span-1">
            <QuickActionGrid />
          </div>
        </div>

        {/* ── ROW 3: Reminders ───────────────────────────────────── */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <BellRing size={16} className="text-primary" aria-hidden="true" />
            <h2 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Today&rsquo;s Reminders
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <UpcomingEventsCard birthdays={birthdays} anniversaries={anniversaries} isLoading={eventsLoading} />
            <SchemeRemindersCard due={schemesDue} overdue={schemesOverdue} maturing={schemesMaturing} isLoading={schemesLoading} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <VocTodayCard jcId={jcId} />
          <LapsedBuyersCard />
        </div>

        {/* ── ROW 4: Today's activity ────────────────────────────── */}
        {jcId == null && (
        <TodaysActivityStrip
          returns={activityToday.returns}
          exchanges={activityToday.exchanges}
          buybacks={activityToday.buybacks}
          urdPurchases={activityToday.urdPurchases}
          isLoading={isLoading}
        />
        )}

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
