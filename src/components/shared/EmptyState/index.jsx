import { PackageOpen } from 'lucide-react';
import { cn } from '@/lib/utils';

// @param {{ icon?: React.ElementType, title: string, description?: string, action?: React.ReactNode, className?: string }} props
export default function EmptyState({
  icon: Icon = PackageOpen,
  title,
  description,
  action,
  className,
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-4',
        'rounded-xl border border-dashed border-border',
        'px-6 py-12 text-center',
        className
      )}
      role="status"
      aria-label={title}
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted ring-1 ring-border/60">
        <Icon
          size={28}
          className="text-muted-foreground/60"
          aria-hidden="true"
          strokeWidth={1.5}
        />
      </div>

      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description && (
          <p className="text-xs text-muted-foreground max-w-xs">
            {description}
          </p>
        )}
      </div>

      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}