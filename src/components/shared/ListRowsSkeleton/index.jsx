'use client';

import { Skeleton } from '@/components/ui/skeleton';

export default function ListRowsSkeleton({ rows = 3, lines = 2 }) {
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center justify-between px-4 py-3.5 border-b border-border last:border-0">
          <div className="flex flex-col gap-1.5 flex-1">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-24" />
            {lines > 2 && <Skeleton className="h-3 w-20" />}
          </div>
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}
