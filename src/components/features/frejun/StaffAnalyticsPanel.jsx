'use client';

import { useMemo } from 'react';
import { Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import EmptyState from '@/components/shared/EmptyState';
import InlineLoader from '@/components/shared/InlineLoader';
import ListItemCard from '@/components/shared/ListItemCard';
import { StaggerList } from '@/components/shared/StaggerList';

const rateTone = (rate) => (rate >= 40 ? 'text-status-in-stock' : rate >= 20 ? 'text-status-made-order' : 'text-status-error');

function Stat({ label, value, className = '' }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`text-sm font-semibold tabular-nums text-foreground ${className}`}>{value}</dd>
    </div>
  );
}

/** Per-staff call totals for the selected dates; search narrows by email. */
export default function StaffAnalyticsPanel({ analytics = [], isLoading = false, search = '', onSelectStaff }) {
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return analytics
      .filter((r) => !q || r.user?.toLowerCase().includes(q))
      .map((r) => {
        const total = Number(r.total_calls) || 0;
        const answered = Number(r.answered_calls) || 0;
        return {
          user: r.user,
          total,
          answered,
          missed: Math.max(0, total - answered),
          rate: total > 0 ? (answered / total) * 100 : 0,
          minutes: parseFloat(r.total_minutes) || 0,
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [analytics, search]);

  const totals = useMemo(() => rows.reduce(
    (t, r) => ({ total: t.total + r.total, answered: t.answered + r.answered, minutes: t.minutes + r.minutes }),
    { total: 0, answered: 0, minutes: 0 },
  ), [rows]);

  if (isLoading) return <InlineLoader label="Loading staff analytics…" />;
  if (rows.length === 0) {
    return <EmptyState icon={Users} title="No staff calls for the selected dates." />;
  }

  const overallRate = totals.total > 0 ? (totals.answered / totals.total) * 100 : 0;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        {rows.length} staff · {totals.total.toLocaleString('en-IN')} calls · {overallRate.toFixed(1)}% answered · {Math.round(totals.minutes).toLocaleString('en-IN')} min talk time
      </p>

      <StaggerList className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-1.5">
        {rows.map((r) => (
          <ListItemCard
            key={r.user}
            onSelect={() => onSelectStaff?.(r.user)}
            header={<span className="block break-all">{r.user}</span>}
            footer={(
              <>
                <span className={`text-[18px] font-bold tabular-nums ${rateTone(r.rate)}`}>{r.rate.toFixed(1)}%</span>
                <Button type="button" variant="outline" size="sm" className="h-8" onClick={(e) => { e.stopPropagation(); onSelectStaff?.(r.user); }}>
                  View calls
                </Button>
              </>
            )}
          >
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
              <Stat label="Total calls" value={r.total.toLocaleString('en-IN')} />
              <Stat label="Talk time" value={`${r.minutes.toFixed(1)} min`} />
              <Stat label="Answered" value={r.answered.toLocaleString('en-IN')} className="text-status-in-stock" />
              <Stat label="Unanswered" value={r.missed.toLocaleString('en-IN')} className="text-status-error" />
            </dl>
          </ListItemCard>
        ))}
      </StaggerList>
    </div>
  );
}
