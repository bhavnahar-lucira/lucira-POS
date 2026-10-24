'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Cake, Heart, PartyPopper } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import PillTabs from '@/components/shared/PillTabs';

const TABS = [
  { key: 'birthday',    label: 'Birthdays',     icon: Cake,  emptyLabel: 'No birthdays in the next 15 days.' },
  { key: 'anniversary', label: 'Anniversaries', icon: Heart, emptyLabel: 'No anniversaries in the next 15 days.' },
];

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last  = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

function ordinal(day) {
  if (day > 3 && day < 21) return `${day}th`;
  switch (day % 10) {
    case 1: return `${day}st`;
    case 2: return `${day}nd`;
    case 3: return `${day}rd`;
    default: return `${day}th`;
  }
}

function EventRow({ event, onSelect }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center gap-3 py-3 text-left transition-colors hover:bg-accent/50 rounded-lg px-2 -mx-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-bold text-primary">
        {getInitials(event.name)}
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground truncate">{event.name || 'Customer'}</p>
        <p className="text-xs text-muted-foreground">{ordinal(event.day)} {event.monthLabel}</p>
      </div>

      {event.isToday ? (
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-status-in-stock/10 px-2 py-1 text-xs font-medium text-status-in-stock">
          Today
        </span>
      ) : (
        <span className="shrink-0 text-xs text-muted-foreground">
          In {event.daysUntil} {event.daysUntil === 1 ? 'day' : 'days'}
        </span>
      )}
    </button>
  );
}

/**
 * UpcomingEventsCard — customer birthdays & anniversaries falling in a
 * rolling 15-day window from today, global across every store (see
 * useUpcomingEvents). Kept as two separate tabs rather than one merged
 * list — a birthday and an anniversary aren't the same kind of reminder.
 * @param {{ birthdays?: Array, anniversaries?: Array, isLoading?: boolean }} props
 */
export default function UpcomingEventsCard({ birthdays = [], anniversaries = [], isLoading }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('birthday');

  const itemsByTab = { birthday: birthdays, anniversary: anniversaries };
  const activeItems = itemsByTab[activeTab];
  const activeTabConfig = TABS.find((t) => t.key === activeTab);

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm p-5 h-full">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-heading text-base text-foreground">Upcoming Birthdays & Anniversaries</h2>
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
          <PartyPopper size={22} aria-hidden="true" />
          <p className="text-sm">{activeTabConfig.emptyLabel}</p>
        </div>
      ) : (
        <div className="max-h-80 overflow-y-auto divide-y divide-border">
          {activeItems.map((event) => (
            <EventRow
              key={event.partyId}
              event={event}
              onSelect={() => router.push(`/customers/${event.partyId}?name=${encodeURIComponent(event.name ?? '')}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
