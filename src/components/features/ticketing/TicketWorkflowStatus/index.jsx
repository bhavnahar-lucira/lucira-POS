'use client';

import WorkflowStageBadge from '@/components/features/workflow/WorkflowStageBadge';
import WorkflowStatusBadge from '@/components/features/workflow/WorkflowStatusBadge';
import { StageProgress } from '@/components/features/workflow/WorkflowOrderListItem';
import { formatDateTime } from '@/lib/dateUtils';

/** Where the ticket's order currently is in the workflow panel (stage, status, last update). */
export default function TicketWorkflowStatus({ workflow }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Order status</span>
        {workflow?.updated_at && (
          <span className="text-xs text-muted-foreground">Updated {formatDateTime(workflow.updated_at)}</span>
        )}
      </div>
      {workflow ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <WorkflowStageBadge stageKey={workflow.current_step} className="text-xs" />
            <WorkflowStatusBadge status={workflow.status} />
          </div>
          <StageProgress stageKey={workflow.current_step} />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Not in the workflow yet.</p>
      )}
    </div>
  );
}
