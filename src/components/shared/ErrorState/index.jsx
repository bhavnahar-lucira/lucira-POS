import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// @param {{ icon?: React.ElementType, title: string, description?: string, onRetry?: () => void, className?: string }} props
export default function ErrorState({
  icon: Icon = AlertCircle,
  title,
  description,
  onRetry,
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
      role="alert"
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 ring-1 ring-destructive/20">
        <Icon
          size={28}
          className="text-destructive/80"
          aria-hidden="true"
          strokeWidth={1.5}
        />
      </div>

      <div className="space-y-1">
        <p className="text-sm font-medium text-destructive">{title}</p>
        {description && (
          <p className="text-xs text-muted-foreground max-w-xs">
            {description}
          </p>
        )}
      </div>

      {onRetry && (
        <div className="mt-2">
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            Retry
          </Button>
        </div>
      )}
    </div>
  );
}
