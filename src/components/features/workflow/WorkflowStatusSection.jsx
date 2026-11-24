'use client';

import InlineLoader from '@/components/shared/InlineLoader';
import WorkflowStageBadge from './WorkflowStageBadge';
import WorkflowStatusBadge from './WorkflowStatusBadge';
import WorkflowLifecycleStepper from './WorkflowLifecycleStepper';
import { useWorkflowOrderByDocument } from '@/hooks/workflow/useOrderWorkflowStatus';
import { formatDateTime } from '@/lib/dateUtils';

/** Full workflow-panel status of one OrnaVerse order: current stage, every stage with its details, and the activity log. */
export default function WorkflowStatusSection({ documentNo }) {
  const { workflowOrder: order, isLoading, error } = useWorkflowOrderByDocument(documentNo);

  if (isLoading) return <InlineLoader label="Loading order status…" />;
  if (error || !order) return null;

  const logs = order.timeline_logs ?? [];

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Order status</span>
        {order.updated_at && <span className="text-xs text-muted-foreground">Updated {formatDateTime(order.updated_at)}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <WorkflowStageBadge stageKey={order.current_step} className="text-xs" />
        <WorkflowStatusBadge status={order.status} />
        {order.order_number && <span className="text-xs text-muted-foreground">{order.order_number}</span>}
      </div>

      <WorkflowLifecycleStepper key={order.id} order={order} />

      {logs.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Activity</span>
          <ol className="flex flex-col gap-2.5">
            {logs.map((log, i) => (
              <li key={i} className="flex flex-col gap-0.5">
                <span className="text-foreground">{log.action}</span>
                <span className="text-xs text-muted-foreground">
                  {[formatDateTime(log.timestamp), log.user, log.role].filter(Boolean).join(' · ')}
                </span>
                {log.notes && <span className="text-xs text-muted-foreground">{log.notes}</span>}
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
