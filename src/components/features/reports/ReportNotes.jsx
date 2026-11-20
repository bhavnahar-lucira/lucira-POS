import { LIVE_REPORT_REFRESH_MS } from '@/hooks/reports/liveReportOptions';

/** "How these numbers are calculated" panel: notes is [term, explanation][]. */
export function ReportNotes({ notes, title = 'How these numbers are calculated' }) {
  if (!notes?.length) return null;
  return (
    <div className="rounded-xl border border-border p-4">
      <p className="text-sm font-semibold text-foreground mb-2">{title}</p>
      <dl className="flex flex-col gap-2 text-xs md:gap-1.5">
        {notes.map(([term, text]) => (
          <div key={term} className="flex flex-col gap-0.5 md:flex-row md:gap-2">
            <dt className="font-medium text-foreground md:w-32 md:shrink-0">{term}</dt>
            <dd className="text-muted-foreground">{text}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function LiveStatus({ updatedAt, isRefreshing, isLive }) {
  if (!updatedAt) return null;
  const time = new Date(updatedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  return (
    <p className="text-xs text-muted-foreground" aria-live="polite">
      {isRefreshing ? 'Refreshing…' : `Updated ${time}`}
      {isLive && ` · refreshes every ${LIVE_REPORT_REFRESH_MS / 60000} minutes while open`}
    </p>
  );
}
