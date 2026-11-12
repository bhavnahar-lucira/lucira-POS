'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSelector } from 'react-redux';
import { ChevronRight, Footprints } from 'lucide-react';

import { Skeleton } from '@/components/ui/skeleton';
import NonBuyerDetailSheet from '@/components/features/nonBuyers/NonBuyerDetailSheet';
import { daysAgoLabel } from '@/components/features/nonBuyers/NonBuyerListItem';
import { useNonBuyers } from '@/hooks/customer/useNonBuyers';
import { selectActiveStoreId } from '@/store/slices/storeSlice';
import { formatMobileWithCountryCode } from '@/lib/phoneFormat';

// Same defaults as the Non-Buyers page, so both share one cached result.
const LOOKBACK_DAYS = 90;
const MIN_VISITS = '2';

function lookbackFrom() {
  const d = new Date();
  d.setDate(d.getDate() - LOOKBACK_DAYS);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/** Walk-ins at the active store who visited repeatedly in the last 90 days without buying. */
export default function NonBuyersCard() {
  const activeStoreId = useSelector(selectActiveStoreId);
  const [fromDate] = useState(lookbackFrom);
  const [selected, setSelected] = useState(null);
  const { nonBuyers, total, isLoading, isError } = useNonBuyers({
    companyId: activeStoreId, from: fromDate, to: '', minVisits: MIN_VISITS, sort: 'visits', search: '',
  });

  if (!activeStoreId) return null;

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm p-5">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="font-heading text-base text-foreground">Non-Buyers</h2>
        {!isLoading && !isError && (
          <span className="text-xs text-muted-foreground">
            {total} visited {MIN_VISITS}+ times in {LOOKBACK_DAYS} days
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="divide-y divide-border">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 py-3">
              <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          ))}
        </div>
      ) : isError ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Non-buyers couldn&rsquo;t be loaded right now.</p>
      ) : nonBuyers.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
          <Footprints size={22} aria-hidden="true" />
          <p className="text-sm">No repeat walk-ins without a purchase in the last {LOOKBACK_DAYS} days.</p>
        </div>
      ) : (
        <div className="max-h-80 overflow-y-auto divide-y divide-border">
            {nonBuyers.map((nb) => (
              <button
                key={nb.key ?? `${nb.mobile}-${nb.lastVisitAt}`}
                type="button"
                onClick={() => setSelected(nb)}
                className="flex w-full items-center gap-3 rounded-lg px-2 -mx-2 py-2.5 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-bold text-primary">
                  {getInitials(nb.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{nb.name || 'Unknown visitor'}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {nb.mobile ? `${formatMobileWithCountryCode(nb.mobile)} · ` : ''}
                    Last visit {daysAgoLabel(nb.daysSinceLastVisit) ?? '—'}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                  {nb.visitCount} visit{nb.visitCount !== 1 ? 's' : ''}
                </span>
              </button>
            ))}
        </div>
      )}

      <Link href="/non-buyers" className="mt-3 inline-flex items-center gap-0.5 text-sm font-medium text-primary hover:underline">
        View all non-buyers <ChevronRight size={14} aria-hidden="true" />
      </Link>

      <NonBuyerDetailSheet nonBuyer={selected} isOpen={!!selected} onClose={() => setSelected(null)} />
    </div>
  );
}
