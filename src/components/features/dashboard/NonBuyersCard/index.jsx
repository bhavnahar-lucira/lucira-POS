'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSelector } from 'react-redux';
import { ChevronRight, Footprints, Loader2 } from 'lucide-react';

import { Skeleton } from '@/components/ui/skeleton';
import NonBuyerDetailSheet from '@/components/features/nonBuyers/NonBuyerDetailSheet';
import { daysAgoLabel } from '@/components/features/nonBuyers/NonBuyerListItem';
import { useNonBuyers } from '@/hooks/customer/useNonBuyers';
import { selectActiveStoreId } from '@/store/slices/storeSlice';
import PhoneLink from '@/components/shared/PhoneLink';

// Same defaults as the Non-Buyers page (every non-buyer), so both share one cached result.
const FILTERS = {
  from: '', to: '', minVisits: '1', recency: 'all', frequency: 'all', sort: 'visits', search: '',
};

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/** Every walk-in at the active store who has never purchased, most visits first. */
export default function NonBuyersCard() {
  const activeStoreId = useSelector(selectActiveStoreId);
  const [selected, setSelected] = useState(null);
  const {
    nonBuyers, total, isLoading, isError, hasMore, loadMore, isLoadingMore,
  } = useNonBuyers({ companyId: activeStoreId, ...FILTERS });

  // Load the next page as the end of the card's own scroll list comes into view.
  const listRef = useRef(null);
  const sentinelRef = useRef(null);
  useEffect(() => {
    if (!hasMore || !sentinelRef.current) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !isLoadingMore) loadMore();
    }, { root: listRef.current, rootMargin: '200px' });
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, loadMore]);

  if (!activeStoreId) return null;

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm p-5">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="font-heading text-base text-foreground">Non-Buyers</h2>
        {!isLoading && !isError && (
          <span className="text-xs text-muted-foreground">
            <span className="hidden">{total} who have </span> Never purchased
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
          <p className="text-sm">Every walk-in has made a purchase.</p>
        </div>
      ) : (
        <div ref={listRef} className="max-h-80 overflow-y-auto divide-y divide-border">
          {nonBuyers.map((nb) => (
            <div
              key={nb.key ?? `${nb.mobile}-${nb.lastVisitAt}`}
              role="button"
              tabIndex={0}
              onClick={() => setSelected(nb)}
              onKeyDown={(e) => {
                if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  setSelected(nb);
                }
              }}
              className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-2 -mx-2 py-2.5 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-bold text-primary">
                {getInitials(nb.name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="wrap-break-word text-sm font-medium text-foreground">{nb.name || 'Unknown visitor'}</p>
                <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
                  {nb.mobile && (
                    <>
                      <PhoneLink phone={nb.mobile} />
                      <span aria-hidden="true">·</span>
                    </>
                  )}
                  <span className="whitespace-nowrap">Last visit {daysAgoLabel(nb.daysSinceLastVisit) ?? '—'}</span>
                </p>
              </div>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                {nb.visitCount} visit{nb.visitCount !== 1 ? 's' : ''}
              </span>
            </div>
          ))}
          {hasMore && (
            <div ref={sentinelRef} className="flex justify-center py-3 text-xs text-muted-foreground">
              {isLoadingMore && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
            </div>
          )}
        </div>
      )}

      <Link href="/non-buyers" className="mt-3 inline-flex items-center gap-0.5 text-sm font-medium text-primary hover:underline">
        View all non-buyers <ChevronRight size={14} aria-hidden="true" />
      </Link>

      <NonBuyerDetailSheet nonBuyer={selected} isOpen={!!selected} onClose={() => setSelected(null)} />
    </div>
  );
}
