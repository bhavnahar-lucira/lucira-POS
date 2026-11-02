'use client';

import { cn } from '@/lib/utils';
import { NPS_LABEL, NPS_HELP } from '@/lib/voc/questions';

const SATISFACTION_LABELS = {
  q3: 'Overall experience',
  q4: 'Jewelry Consultant',
  q5: 'Collection & designs',
  q6: 'Pricing & value',
};

const pct = (n, total) => (total ? Math.round((n / total) * 100) : 0);

function Tile({ label, value, sub, className }) {
  return (
    <div className={cn('flex flex-col gap-1 rounded-2xl border border-border bg-card p-4', className)}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold tabular-nums text-foreground">{value}</p>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function BarRow({ label, value, percent, tone = 'bg-primary' }) {
  return (
    <li className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 truncate text-foreground">{label}</span>
        <span className="shrink-0 tabular-nums text-muted-foreground">{value}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div className={cn('h-full rounded-full', tone)} style={{ width: `${percent}%` }} />
      </div>
    </li>
  );
}

function RankedCard({ title, items, emptyText = 'No answers yet.' }) {
  const total = items.reduce((n, i) => n + i.count, 0);
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {items.length ? (
        <ul className="flex flex-col gap-2.5">
          {items.slice(0, 5).map((i) => (
            <BarRow key={i.value} label={i.label} value={`${i.count} · ${pct(i.count, total)}%`} percent={pct(i.count, total)} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      )}
    </div>
  );
}

export default function VocSummary({ summary }) {
  if (!summary) return null;
  const { total, nps, satisfaction, purchased } = summary;
  const bought = purchased.find((p) => p.value === 'yes')?.count ?? 0;
  const npsTone = nps.score == null ? 'text-foreground' : nps.score >= 50 ? 'text-status-in-stock' : nps.score >= 0 ? 'text-status-made-order' : 'text-status-error';

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Responses" value={total} />
        <Tile
          label={NPS_LABEL}
          value={<span className={npsTone}>{nps.score ?? '—'}</span>}
          sub={(
            <>
              <p>{nps.responses ? `${nps.promoters} promoters · ${nps.passives} passive · ${nps.detractors} detractors` : 'No scores yet'}</p>
              <p className="mt-1 text-[11px] leading-snug">{NPS_HELP}</p>
            </>
          )}
        />
        <Tile label="Purchased" value={total ? `${pct(bought, total)}%` : '—'} sub={total ? `${bought} of ${total} customers` : null} />
        <Tile
          label="Avg. satisfaction"
          value={(() => {
            const scored = satisfaction.filter((s) => s.percent != null);
            return scored.length ? `${Math.round(scored.reduce((n, s) => n + s.percent, 0) / scored.length)}%` : '—';
          })()}
          sub="Rated the top two options"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
          <p className="text-sm font-semibold text-foreground">Satisfaction</p>
          <ul className="flex flex-col gap-2.5">
            {satisfaction.map((s) => (
              <BarRow
                key={s.id}
                label={SATISFACTION_LABELS[s.id] ?? s.question}
                value={s.percent == null ? '—' : `${s.percent}%`}
                percent={s.percent ?? 0}
                tone={s.percent == null ? 'bg-muted' : s.percent >= 80 ? 'bg-status-in-stock' : s.percent >= 60 ? 'bg-status-made-order' : 'bg-status-error'}
              />
            ))}
          </ul>
        </div>
        <RankedCard title="Why customers didn't buy" items={summary.notBuying} />
        <RankedCard title="Brand last purchased from" items={summary.brands} />
        <RankedCard title="How they heard about Lucira" items={summary.awareness} />
        <RankedCard title="What would win them from other brands" items={summary.whyOthers} />
        <RankedCard title="Why buyers chose Lucira" items={summary.whyBought} />
      </div>
    </div>
  );
}
