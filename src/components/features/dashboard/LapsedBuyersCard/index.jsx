'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSelector } from 'react-redux';
import { ChevronRight, Coins, UserRoundSearch } from 'lucide-react';

import { Skeleton } from '@/components/ui/skeleton';
import { useBuyerPurchases } from '@/hooks/buyers/useBuyerPurchases';
import { groupPurchasesByBuyer } from '@/lib/buyers/groupPurchasesByBuyer';
import { daysSince } from '@/lib/buyers/buyerFilters';
import { selectActiveStoreId } from '@/store/slices/storeSlice';
import { selectIsSuperAdmin } from '@/store/slices/authSlice';
import { formatAmountOrDash } from '@/lib/priceUtils';
import PhoneLink from '@/components/shared/PhoneLink';
import { useLuciraPoints } from '@/hooks/customers/useLuciraPoints';

const LAPSED_DAYS = 90;

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/** The buyer's Lucira points, fetched once the row scrolls into view. */
function BuyerPoints({ companyId, partyId, mobile }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return undefined;
    const observer = new IntersectionObserver(([entry]) => entry.isIntersecting && setVisible(true));
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible]);
  const { points, isLoading, isAvailable } = useLuciraPoints({ companyId, partyId, mobile }, { enabled: visible });

  return (
    <span ref={ref} className="mt-1 inline-flex w-fit items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
      <Coins size={12} className="shrink-0 text-amber-500" aria-hidden="true" />
      {!visible || isLoading ? 'Lucira points …' : isAvailable ? `${points.toLocaleString('en-IN')} Lucira points` : 'Lucira points —'}
    </span>
  );
}

/** Every buyer of the active store with no purchase in the last 90 days, most valuable first. */
export default function LapsedBuyersCard() {
  const router = useRouter();
  const activeStoreId = useSelector(selectActiveStoreId);
  const isSuperAdmin = useSelector(selectIsSuperAdmin);
  const { purchases, isLoading } = useBuyerPurchases({ companyId: activeStoreId ?? undefined });
  const [now] = useState(() => Date.now());

  if (!activeStoreId && !isSuperAdmin) return null;

  const buyers = groupPurchasesByBuyer(purchases)
    .map((b) => ({ ...b, daysSince: daysSince(b.lastPurchaseDate, now) }))
    .filter((b) => b.daysSince != null && b.daysSince > LAPSED_DAYS)
    .sort((a, b) => b.totalSpend - a.totalSpend);

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm p-5">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="font-heading text-base text-foreground">Buyers</h2>
        {!isLoading && (
          <span className="text-xs text-muted-foreground">
            <span className='hidden'>{buyers.length} with </span>No purchase in the last {LAPSED_DAYS} days
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
      ) : buyers.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
          <UserRoundSearch size={22} aria-hidden="true" />
          <p className="text-sm">Every buyer has purchased in the last {LAPSED_DAYS} days.</p>
        </div>
      ) : (
        <div className="max-h-80 overflow-y-auto divide-y divide-border">
          {buyers.map((buyer) => (
            <div
              key={buyer._id}
              role="button"
              tabIndex={0}
              onClick={() => router.push(`/buyers/${buyer._id}`)}
              onKeyDown={(e) => {
                if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  router.push(`/buyers/${buyer._id}`);
                }
              }}
              className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-2 -mx-2 py-2.5 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-bold text-primary">
                {getInitials(buyer.customerName)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="wrap-break-word text-sm font-medium text-foreground">{buyer.customerName || 'Customer'}</p>
                <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
                  {buyer.customerMobile && (
                    <>
                      <PhoneLink phone={buyer.customerMobile} />
                      <span aria-hidden="true">·</span>
                    </>
                  )}
                  <span className="whitespace-nowrap">Last purchase {buyer.daysSince} days ago</span>
                </p>
                {activeStoreId && <BuyerPoints companyId={activeStoreId} partyId={Number(buyer._id)} mobile={buyer.customerMobile} />}
              </div>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">{formatAmountOrDash(buyer.totalSpend)}</span>
            </div>
          ))}
        </div>
      )}

      <Link href="/buyers" className="mt-3 inline-flex items-center gap-0.5 text-sm font-medium text-primary hover:underline">
        View all buyers <ChevronRight size={14} aria-hidden="true" />
      </Link>
    </div>
  );
}
