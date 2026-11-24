import { Badge } from '@/components/ui/badge';
import { getStageMeta, WORKFLOW_STAGES } from '@/lib/workflow/workflowConstants';
import { cn } from '@/lib/utils';

/** "Step 3/11 · Management Approval" — neutral outline badge, the current stage of an order. */
export default function WorkflowStageBadge({ stageKey, compact = false, className }) {
  const meta = getStageMeta(stageKey);
  if (!meta) return null;
  const label = compact ? meta.shortLabel : meta.label;
  return (
    <Badge variant="outline" title={meta.description} className={cn('h-auto max-w-full gap-1.5 whitespace-normal rounded-full px-2 py-0.5 text-left text-[11px] font-medium', className)}>
      {meta.stepNumber > 0 && (
        <span className="tabular-nums text-muted-foreground">{meta.stepNumber}/{WORKFLOW_STAGES.length}</span>
      )}
      <span className="min-w-0 break-words">{label}</span>
    </Badge>
  );
}
