'use client';

import { Calendar, Package, User } from 'lucide-react';
import ListItemCard from '@/components/shared/ListItemCard';
import WorkflowStageBadge from '@/components/features/workflow/WorkflowStageBadge';
import WorkflowStatusBadge from '@/components/features/workflow/WorkflowStatusBadge';
import { WORKFLOW_STAGES, getStageMeta, workflowSourceLabel } from '@/lib/workflow/workflowConstants';
import { formatAmountOrDash } from '@/lib/priceUtils';
import { formatDateSlashed } from '@/lib/dateUtils';

export function StageProgress({ stageKey }) {
  const step = getStageMeta(stageKey)?.stepNumber ?? 0;
  return (
    <div className="flex items-center gap-0.5" aria-label={`Stage ${step} of ${WORKFLOW_STAGES.length}`}>
      {WORKFLOW_STAGES.map((s) => (
        <span
          key={s.key}
          className={`h-1 flex-1 rounded-full ${s.stepNumber < step ? 'bg-status-in-stock' : s.stepNumber === step ? 'bg-primary' : 'bg-muted'}`}
        />
      ))}
    </div>
  );
}

export default function WorkflowOrderListItem({ order, onSelect }) {
  const items = [...(order.items ?? [])].sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0));

  return (
    <ListItemCard
      onSelect={onSelect}
      header={(
        <span className="flex min-w-0 flex-col">
          <span className="break-words">{order.erp_document_no || workflowSourceLabel(order)}</span>
          <span className="break-words text-xs font-normal text-muted-foreground">
            {order.erp_document_no ? workflowSourceLabel(order) : 'Not in OrnaVerse yet'}
          </span>
        </span>
      )}
      footer={(
        <>
          <p className="text-[18px] font-bold text-foreground">{formatAmountOrDash(order.financials?.total ?? order.total_amount)}</p>
          <WorkflowStatusBadge status={order.status} />
        </>
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="flex items-start gap-2 text-[13px] text-muted-foreground min-w-0">
          <User size={13} className="mt-0.5 shrink-0 text-muted-foreground/70" aria-hidden="true" />
          <span className="min-w-0 break-words">{order.customer?.name || '—'}</span>
        </span>
        {order.created_at && (
          <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground shrink-0">
            <Calendar size={13} className="text-muted-foreground/70" aria-hidden="true" />
            {formatDateSlashed(order.created_at)}
          </span>
        )}
      </div>

      {items.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {items.map((item, i) => (
            <li key={`${item.sku}-${i}`} className="flex items-start gap-2 text-[13px] min-w-0">
              <Package size={13} className="mt-0.5 shrink-0 text-muted-foreground/70" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block break-words text-foreground/80">{item.title || item.sku}</span>
                <span className="block break-all text-xs text-muted-foreground">
                  {[item.sku, `Qty ${item.quantity ?? 1}`].filter(Boolean).join(' · ')}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-1.5 pt-1">
        <WorkflowStageBadge stageKey={order.current_step} className="max-w-full" />
        <StageProgress stageKey={order.current_step} />
      </div>
    </ListItemCard>
  );
}
