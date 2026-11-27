'use client';

import { useMemo } from 'react';
import { Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import EmptyState from '@/components/shared/EmptyState';
import ErrorState from '@/components/shared/ErrorState';
import InlineLoader from '@/components/shared/InlineLoader';
import ListItemCard from '@/components/shared/ListItemCard';
import { StaggerList } from '@/components/shared/StaggerList';
import { formatDateTime } from '@/lib/dateUtils';

export const formatTalkTime = (minutes) => {
  const total = Math.round(Number(minutes) || 0);
  if (total < 60) return `${total} min`;
  return `${Math.floor(total / 60)}h ${String(total % 60).padStart(2, '0')}m`;
};

const rateTone = (rate) => (rate >= 40 ? 'text-status-in-stock' : rate >= 20 ? 'text-status-made-order' : 'text-status-error');

function Stat({ label, value, className = '' }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`text-sm font-semibold tabular-nums text-foreground ${className}`}>{value}</dd>
    </div>
  );
}

/** One card per calling agent of a store: calls, talk time, answered / unanswered, direction and last call. */
export default function AgentOverviewPanel({ overview, isLoading, error, search = '', onRetry, onSelectAgent }) {
  const agents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (overview?.agents ?? []).filter((a) => !q || a.name.toLowerCase().includes(q));
  }, [overview, search]);

  if (isLoading) return <InlineLoader label="Adding up every call for each agent…" />;
  if (error) return <ErrorState title="Couldn't build the agent overview." description={error.message} onRetry={onRetry} />;
  if (!agents.length) return <EmptyState icon={Users} title="No agent calls for the selected dates." />;

  const totals = (!search.trim() && overview?.totals) || agents.reduce(
    (t, a) => ({ total: t.total + a.total, answered: t.answered + a.answered, unanswered: t.unanswered + a.unanswered, minutes: t.minutes + a.minutes }),
    { total: 0, answered: 0, unanswered: 0, minutes: 0 },
  );

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        {agents.filter((a) => !a.untagged).length} agents · {totals.total.toLocaleString('en-IN')} calls · {totals.answered.toLocaleString('en-IN')} connected · {totals.unanswered.toLocaleString('en-IN')} not connected
        {totals.uniqueCustomers != null && ` · ${totals.uniqueCustomers.toLocaleString('en-IN')} unique customers`} · {formatTalkTime(totals.minutes)} talk time
        {overview?.truncated && ` · counted the latest ${overview.callsCounted.toLocaleString('en-IN')} of ${overview.totalCalls.toLocaleString('en-IN')} calls — pick a shorter date range for exact totals`}
      </p>

      <StaggerList className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-1.5">
        {agents.map((a) => {
          const rate = a.total ? (a.answered / a.total) * 100 : 0;
          return (
            <ListItemCard
              key={a.key}
              onSelect={a.untagged ? undefined : () => onSelectAgent?.(a.key)}
              header={<span className="block break-words">{a.name}</span>}
              footer={(
                <>
                  <span className="flex flex-col">
                    <span className={`text-[18px] font-bold tabular-nums ${rateTone(rate)}`}>{rate.toFixed(1)}%</span>
                    <span className="text-xs text-muted-foreground">connected</span>
                  </span>
                  {!a.untagged && (
                    <Button type="button" variant="outline" size="sm" className="h-8" onClick={(e) => { e.stopPropagation(); onSelectAgent?.(a.key); }}>
                      View calls
                    </Button>
                  )}
                </>
              )}
            >
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                <Stat label="Calls" value={a.total.toLocaleString('en-IN')} />
                <Stat label="Connected" value={a.answered.toLocaleString('en-IN')} className="text-status-in-stock" />
                <Stat label="Not connected" value={a.unanswered.toLocaleString('en-IN')} className="text-status-error" />
                <Stat label="Unique customers" value={(a.uniqueCustomers ?? 0).toLocaleString('en-IN')} />
                <Stat label="Incoming" value={a.incoming.toLocaleString('en-IN')} />
                <Stat label="Outgoing" value={a.outgoing.toLocaleString('en-IN')} />
                <Stat label="Talk time" value={formatTalkTime(a.minutes)} />
              </dl>
              {a.lastCallAt && <p className="text-xs text-muted-foreground">Last call {formatDateTime(a.lastCallAt)}</p>}
            </ListItemCard>
          );
        })}
      </StaggerList>
    </div>
  );
}
