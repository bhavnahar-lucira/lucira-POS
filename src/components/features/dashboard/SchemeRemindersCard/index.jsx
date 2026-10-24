'use client';

import { useRouter } from 'next/navigation';
import { Wallet, CalendarClock, Gem } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import PillTabs from '@/components/shared/PillTabs';
import { useState } from 'react';

// Short labels, matching RecentOrdersList's own tab convention — "Due This
// Month" / "Maturing This Month" clipped at mobile widths with no visible
// affordance that the tab row scrolls (confirmed live at 375px, 2026-10-24).
// CalendarClock for Maturing (not PiggyBank) — matches the icon this
// codebase already uses elsewhere for a scheme reaching a time-based
// milestone (EnrollmentDetailSheet).
const TABS = [
  { key: 'due',      label: 'Due',      icon: Wallet,       emptyLabel: 'No instalments due this month.' },
  { key: 'maturing', label: 'Maturing', icon: CalendarClock, emptyLabel: 'No schemes maturing this month.' },
];

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last  = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

function SchemeRow({ enrollment, detail, onSelect }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center gap-3 py-3 text-left transition-colors hover:bg-accent/50 rounded-lg px-2 -mx-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-bold text-primary">
        {getInitials(enrollment.customerName)}
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground truncate">{enrollment.customerName || 'Customer'}</p>
        <p className="flex items-center gap-1 text-xs text-muted-foreground truncate">
          <Gem size={12} aria-hidden="true" />
          {enrollment.schemeName || 'Scheme'}
        </p>
      </div>

      {detail && (
        <p className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
          &#8377;{Number(detail).toLocaleString('en-IN')}
        </p>
      )}
    </button>
  );
}

/**
 * SchemeRemindersCard — scheme instalments due / maturities landing this
 * month, scoped to the active store (see useSchemeReminders).
 * @param {{ due?: Array, maturing?: Array, isLoading?: boolean }} props
 */
export default function SchemeRemindersCard({ due = [], maturing = [], isLoading }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('due');

  const itemsByTab = { due, maturing };
  const activeItems = itemsByTab[activeTab];
  const activeTabConfig = TABS.find((t) => t.key === activeTab);

  const goToSchemes = (customerId) => router.push(`/customers/${customerId}?tab=schemes`);

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm p-5 h-full">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-heading text-base text-foreground">Scheme Reminders</h2>
      </div>

      <PillTabs
        tabs={TABS}
        value={activeTab}
        onChange={setActiveTab}
        getKey={(t) => t.key}
        getLabel={(t) => t.label}
        getIcon={(t) => t.icon}
        variant="pill"
        scrollable
        className="mb-2"
      />

      {isLoading ? (
        <div className="divide-y divide-border">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 py-3">
              <Skeleton className="h-11 w-11 shrink-0 rounded-xl" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          ))}
        </div>
      ) : activeItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
          <activeTabConfig.icon size={22} aria-hidden="true" />
          <p className="text-sm">{activeTabConfig.emptyLabel}</p>
        </div>
      ) : (
        <div className="max-h-80 overflow-y-auto divide-y divide-border">
          {activeItems.map((enrollment) => (
            <SchemeRow
              key={enrollment.enrollmentId}
              enrollment={enrollment}
              detail={activeTab === 'due' ? enrollment.dueAmount : null}
              onSelect={() => goToSchemes(enrollment.customerId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
