'use client';

import Image from 'next/image';
import { RotateCcw, ArrowLeftRight, Gem, Coins } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

function ActivityStat({ icon: Icon, count, label }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm ring-1 ring-white/25">
        <Icon size={18} aria-hidden="true" />
      </span>
      <div className="flex flex-col items-center justify-center">
        <span className="font-heading text-xl text-white tabular-nums leading-none drop-shadow-sm">{count}</span>
        <span className="text-xs text-white/75 mt-0.5">{label}</span>
      </div>
    </div>
  );
}

/**
 * @param {{ returns: number, exchanges: number, buybacks: number, urdPurchases: number, isLoading?: boolean }} props
 */
export default function TodaysActivityStrip({
  returns = 0, exchanges = 0, buybacks = 0, urdPurchases = 0, isLoading,
}) {
  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card shadow-sm p-5">
        <Skeleton className="h-3 w-28 mb-3" />
        <div className="flex gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-16" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-border shadow-sm">
      <Image
        src="/images/today-activity-banner.png"
        alt=""
        fill
        sizes="(max-width: 768px) 100vw, 1024px"
        className="object-cover"
        priority
        fetchPriority="high"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/40 to-black/10" aria-hidden="true" />
      <div className="absolute inset-0 bg-gradient-to-br from-primary/30 via-transparent to-transparent" aria-hidden="true" />

      <div className={cn('relative flex flex-col gap-4 px-5 py-6 sm:px-6 sm:py-7')}>
        <h2 className="font-heading text-base text-white drop-shadow-sm">Today&rsquo;s Activity</h2>
        <div className="flex flex-wrap justify-around gap-x-6 gap-y-5 sm:justify-start sm:gap-x-10">
          <ActivityStat icon={RotateCcw}       count={returns}      label={returns === 1 ? 'Return' : 'Returns'} />
          <ActivityStat icon={ArrowLeftRight}  count={exchanges}    label={exchanges === 1 ? 'Exchange' : 'Exchanges'} />
          <ActivityStat icon={Gem}             count={buybacks}     label={buybacks === 1 ? 'Buyback' : 'Buybacks'} />
          <ActivityStat icon={Coins}           count={urdPurchases} label="URD Purchases" />
        </div>
      </div>
    </div>
  );
}
