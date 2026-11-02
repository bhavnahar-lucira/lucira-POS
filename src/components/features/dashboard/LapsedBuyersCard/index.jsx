'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSelector } from 'react-redux';
import { UserRoundSearch } from 'lucide-react';

import { Skeleton } from '@/components/ui/skeleton';
import { useBuyerPurchases } from '@/hooks/buyers/useBuyerPurchases';
import { groupPurchasesByBuyer } from '@/lib/buyers/groupPurchasesByBuyer';
import { selectActiveStoreId } from '@/store/slices/storeSlice';
import { selectIsSuperAdmin } from '@/store/slices/authSlice';
import { formatAmountOrDash } from '@/lib/priceUtils';
import { formatMobileWithCountryCode } from '@/lib/phoneFormat';

const LAPSED_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/** Buyers of the active store whose last purchase was 90 or more days ago, most valuable first. */
export default function LapsedBuyersCard() {
  const router = useRouter();
  const activeStoreId = useSelector(selectActiveStoreId);
  const isSuperAdmin = useSelector(selectIsSuperAdmin);
  const { purchases, isLoading } = useBuyerPurchases({ companyId: activeStoreId ?? undefined });
  const [now] = useState(() => Date.now());

  if (!activeStoreId && !isSuperAdmin) return null;

  const buyers = groupPurchasesByBuyer(purchases)
    .map((b) => ({ ...b, daysSince: b.lastPurchaseDate ? Math.floor((now - new Date(b.lastPurchaseDate).getTime()) / DAY_MS) : null }))
    .filter((b) => b.daysSince != null && b.daysSince >= LAPSED_DAYS)
    .sort((a, b) => b.totalSpend - a.totalSpend);

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm p-5">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="font-heading text-base text-foreground">Buyers</h2>
        {!isLoading && (
          <span className="text-xs text-muted-foreground">
            {buyers.length} with no purchase in {LAPSED_DAYS}+ days
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
          <p className="text-sm">No buyers have gone {LAPSED_DAYS}+ days without a purchase.</p>
        </div>
      ) : (
        <div className="max-h-80 overflow-y-auto divide-y divide-border">
          {buyers.map((buyer) => (
            <button
              key={buyer._id}
              type="button"
              onClick={() => router.push(`/buyers/${buyer._id}`)}
              className="flex w-full items-center gap-3 rounded-lg px-2 -mx-2 py-2.5 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-bold text-primary">
                {getInitials(buyer.customerName)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{buyer.customerName || 'Customer'}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {buyer.customerMobile ? `${formatMobileWithCountryCode(buyer.customerMobile)} · ` : ''}
                  Last purchase {buyer.daysSince} days ago
                </p>
              </div>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">{formatAmountOrDash(buyer.totalSpend)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
