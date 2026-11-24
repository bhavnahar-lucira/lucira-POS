import { Badge } from '@/components/ui/badge';
import { WORKFLOW_STATUS_CONFIG } from '@/lib/workflow/workflowConstants';
import { cn } from '@/lib/utils';

export default function WorkflowStatusBadge({ status, size = 'sm', className }) {
  const key = String(status || 'pending').toLowerCase();
  const { label, classes } = WORKFLOW_STATUS_CONFIG[key] ?? {
    label: key.replace(/_/g, ' '),
    classes: WORKFLOW_STATUS_CONFIG.pending.classes,
  };
  return (
    <Badge
      className={cn(
        'h-auto rounded-full font-medium capitalize',
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1 text-xs',
        classes,
        className,
      )}
    >
      {label}
    </Badge>
  );
}
