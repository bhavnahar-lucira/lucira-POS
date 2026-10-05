import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function InlineLoader({ label, className }) {
  return (
    <div className={cn('flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground', className)}>
      <Loader2 size={16} className="animate-spin" aria-hidden="true" />
      {label}
    </div>
  );
}
