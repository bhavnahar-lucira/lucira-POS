'use client';

import { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { WORKFLOW_STAGES, getStageMeta } from '@/lib/workflow/workflowConstants';
import { formatDateTime } from '@/lib/dateUtils';
import { cn } from '@/lib/utils';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

const humanize = (key) => key
  .replace(/([a-z])([A-Z])/g, '$1 $2')
  .replace(/_/g, ' ')
  .replace(/^\w/, (c) => c.toUpperCase());

function formatValue(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string' && ISO_DATE.test(value)) return formatDateTime(value);
  if (Array.isArray(value)) {
    if (!value.length) return null;
    return value.every((v) => typeof v !== 'object') ? value.join(', ') : `${value.length} record${value.length > 1 ? 's' : ''}`;
  }
  if (typeof value === 'object') return null;
  return String(value);
}

function stageData(stages, stage) {
  if (!stages) return null;
  if (stages[stage.stageKey]) return stages[stage.stageKey];
  if (stages[stage.key]) return stages[stage.key];
  const key = Object.keys(stages).find((k) => k.endsWith(`_${stage.key}`));
  return key ? stages[key] : null;
}

/** The 11 workflow stages as a vertical timeline; stages with recorded data expand to show it. */
export default function WorkflowLifecycleStepper({ order }) {
  const current = getStageMeta(order.current_step)?.stepNumber ?? 0;
  const isStopped = ['cancelled', 'rejected'].includes(String(order.status).toLowerCase());
  const [open, setOpen] = useState(() => new Set([order.current_step]));

  const toggle = (key) => setOpen((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  return (
    <ol className="flex flex-col">
      {WORKFLOW_STAGES.map((stage, idx) => {
        const isPast = stage.stepNumber < current;
        const isCurrent = stage.stepNumber === current;
        const rows = Object.entries(stageData(order.stages, stage) ?? {})
          .map(([k, v]) => [humanize(k), formatValue(v)])
          .filter(([, v]) => v != null);
        const expandable = rows.length > 0 && (isPast || isCurrent);
        const isOpen = expandable && open.has(stage.key);
        const last = idx === WORKFLOW_STAGES.length - 1;

        return (
          <li key={stage.key} className="relative flex gap-3 pb-1">
            {!last && (
              <span
                aria-hidden="true"
                className={cn('absolute left-3 top-7 bottom-0 w-px -translate-x-1/2', isPast ? 'bg-status-in-stock' : 'bg-border')}
              />
            )}
            <span
              className={cn(
                'relative z-10 mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold tabular-nums',
                isPast && 'border-status-in-stock bg-status-in-stock text-white',
                isCurrent && !isStopped && 'border-primary bg-primary text-primary-foreground ring-4 ring-primary/15',
                isCurrent && isStopped && 'border-status-error bg-status-error text-white',
                !isPast && !isCurrent && 'border-border bg-background text-muted-foreground',
              )}
            >
              {isPast ? <Check size={13} strokeWidth={3} aria-hidden="true" /> : stage.stepNumber}
            </span>

            <div className="min-w-0 flex-1 pb-3">
              <button
                type="button"
                onClick={() => expandable && toggle(stage.key)}
                disabled={!expandable}
                aria-expanded={expandable ? isOpen : undefined}
                className="flex w-full min-h-8 items-center justify-between gap-2 text-left disabled:cursor-default"
              >
                <span className="min-w-0">
                  <span className={cn('block text-sm', isCurrent ? 'font-semibold text-foreground' : isPast ? 'font-medium text-foreground' : 'text-muted-foreground')}>
                    {stage.label}
                    {isCurrent && <span className="ml-2 text-xs font-medium text-primary">{isStopped ? 'Stopped' : 'Current'}</span>}
                  </span>
                  <span className="block text-xs text-muted-foreground">{stage.description}</span>
                </span>
                {expandable && (
                  <ChevronDown size={16} aria-hidden="true" className={cn('shrink-0 text-muted-foreground transition-transform', isOpen && 'rotate-180')} />
                )}
              </button>

              {isOpen && (
                <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1.5 rounded-lg bg-muted/40 p-3 text-xs sm:grid-cols-2">
                  {rows.map(([label, value]) => (
                    <div key={label} className="flex min-w-0 justify-between gap-3 sm:flex-col sm:justify-start sm:gap-0">
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="min-w-0 break-words text-right font-medium text-foreground sm:text-left">{value}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
