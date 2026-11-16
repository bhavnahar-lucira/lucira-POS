'use client';

import { formatAmountOrDash as formatCurrency } from '@/lib/priceUtils';
import { Target, TrendingUp, CheckCircle2, XCircle, Compass } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function DealsSummaryCards({ summary, isLoading }) {
  const total = summary?.total ?? 0;
  const totalValue = summary?.totalValue ?? 0;
  const wonCount = summary?.wonCount ?? 0;
  const lostCount = summary?.lostCount ?? 0;

  const topUtm = summary?.utmSources?.[0]?.name || 'Direct / None';
  const topUtmCount = summary?.utmSources?.[0]?.count || 0;

  const cards = [
    {
      title: 'Total Deals',
      value: total.toLocaleString('en-IN'),
      subtitle: `${summary?.stores?.length || 0} stores active`,
      icon: Target,
      color: 'text-primary',
      bg: 'bg-primary/10',
    },
    {
      title: 'Pipeline Value',
      value: formatCurrency(totalValue),
      subtitle: 'Combined deal values',
      icon: TrendingUp,
      color: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-500/10',
    },
    {
      title: 'Won Deals',
      value: wonCount.toLocaleString('en-IN'),
      subtitle: total > 0 ? `${Math.round((wonCount / total) * 100)}% conversion` : '0%',
      icon: CheckCircle2,
      color: 'text-status-in-stock',
      bg: 'bg-status-in-stock/10',
    },
    {
      title: 'Lost Deals',
      value: lostCount.toLocaleString('en-IN'),
      subtitle: total > 0 ? `${Math.round((lostCount / total) * 100)}% lost` : '0%',
      icon: XCircle,
      color: 'text-destructive',
      bg: 'bg-destructive/10',
    },
    {
      title: 'Top Campaign / UTM',
      value: topUtm,
      subtitle: topUtmCount ? `${topUtmCount} attributed leads` : 'Organic / Direct',
      icon: Compass,
      color: 'text-amber-600 dark:text-amber-400',
      bg: 'bg-amber-500/10',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <div
            key={c.title}
            className="flex flex-col justify-between rounded-xl border border-border bg-card p-3.5 shadow-sm"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground truncate">{c.title}</span>
              <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', c.bg, c.color)}>
                <Icon size={14} aria-hidden="true" />
              </span>
            </div>
            <div className="mt-2">
              <p className="text-lg font-bold text-foreground truncate tabular-nums">
                {isLoading ? '…' : c.value}
              </p>
              <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                {c.subtitle}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
