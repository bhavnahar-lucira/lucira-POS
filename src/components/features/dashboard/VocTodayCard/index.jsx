'use client';

import Link from 'next/link';
import { useSelector } from 'react-redux';
import { ChevronRight, MessageSquareHeart } from 'lucide-react';

import { Skeleton } from '@/components/ui/skeleton';
import { useVocResponses } from '@/hooks/voc/useVoc';
import { answerLabel, NPS_LABEL, NPS_HELP } from '@/lib/voc/questions';
import { todayDateString } from '@/lib/dateUtils';
import { selectActiveStoreId } from '@/store/slices/storeSlice';
import { selectIsSuperAdmin } from '@/store/slices/authSlice';
import { cn } from '@/lib/utils';

const npsTone = (score) => (score == null ? 'text-foreground' : score >= 50 ? 'text-status-in-stock' : score >= 0 ? 'text-status-made-order' : 'text-status-error');

/** Today's Voice of Lucira responses at the active store: count, Net Promoter Score (NPS) and the latest few. */
export default function VocTodayCard({ jcId = null }) {
  const activeStoreId = useSelector(selectActiveStoreId);
  const isSuperAdmin = useSelector(selectIsSuperAdmin);
  const today = todayDateString();
  const { responses, total, summary, isLoading } = useVocResponses(
    { from: today, to: today, storeId: isSuperAdmin && activeStoreId ? activeStoreId : undefined, jcId: jcId ?? undefined },
    { enabled: isSuperAdmin || !!activeStoreId },
  );

  if (!activeStoreId && !isSuperAdmin) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-heading text-base text-foreground">
          <MessageSquareHeart size={18} className="text-primary" aria-hidden="true" />
          Voice of Lucira · Today
        </h2>
        <Link href="/voc" className="flex items-center gap-0.5 text-sm text-primary hover:underline">
          View all <ChevronRight size={14} aria-hidden="true" />
        </Link>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-16 rounded-lg" />
          <Skeleton className="h-16 rounded-lg" />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-muted/50 px-3 py-2.5">
              <p className="text-xs text-muted-foreground">Responses</p>
              <p className="text-2xl font-bold tabular-nums text-foreground">{total}</p>
            </div>
            <div className="rounded-lg bg-muted/50 px-3 py-2.5">
              <p className="text-xs text-muted-foreground" title={NPS_HELP}>{NPS_LABEL}</p>
              <p className={cn('text-2xl font-bold tabular-nums', npsTone(summary?.nps.score))}>{summary?.nps.score ?? '—'}</p>
            </div>
          </div>
          <p className="-mt-2 text-[11px] leading-snug text-muted-foreground">{NPS_HELP}</p>
          {responses.length === 0 ? (
            <p className="text-sm text-muted-foreground">No feedback yet today. It&rsquo;s offered when a customer&rsquo;s visit ends.</p>
          ) : (
            <ul className="divide-y divide-border">
              {responses.slice(0, 3).map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{r.customer.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{r.jc.name} · {answerLabel('q7', r.answers.q7)}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-foreground">
                    {r.answers.q9}/10
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
