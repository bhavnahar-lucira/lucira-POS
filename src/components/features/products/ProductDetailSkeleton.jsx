'use client';

import { Skeleton } from '@/components/ui/skeleton';

function Bone({ className = '' }) {
  return <Skeleton className={`rounded-lg ${className}`} />;
}

export default function ProductDetailSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-4 md:p-6" aria-busy="true" aria-label="Loading product">

      <div className="flex items-center gap-2">
        <Bone className="w-9 h-9 rounded-lg" />
        <Bone className="w-48 h-4" />
      </div>

      <div className="flex flex-col md:flex-row gap-6">

        <div className="w-full md:w-1/2 shrink-0">
          <Bone className="w-full rounded-2xl" style={{ aspectRatio: '1/1' }} />
          <div className="flex justify-center gap-1.5 mt-3">
            {[0, 1, 2].map((i) => (
              <Bone key={i} className="w-2 h-2 rounded-full" />
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-4 flex-1">

          <div className="flex flex-col gap-2">
            <Bone className="w-24 h-3" />
            <Bone className="w-3/4 h-7" />
            <Bone className="w-1/2 h-5" />
          </div>

          <Bone className="w-24 h-7 rounded-full" />

          <Bone className="w-32 h-8" />

          <div className="flex flex-col gap-2">
            <Bone className="w-16 h-3" />
            <div className="flex gap-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <Bone key={i} className="w-12 h-10 rounded-xl" />
              ))}
            </div>
          </div>

          <div className="flex gap-3 mt-2">
            <Bone className="w-32 h-12 rounded-xl" />
            <Bone className="flex-1 h-12 rounded-xl" />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <Bone className="w-28 h-3" />
        <div className="rounded-xl border border-border p-4 flex flex-col gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex justify-between">
              <Bone className="w-24 h-3" />
              <Bone className="w-32 h-3" />
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <Bone className="w-28 h-3" />
        <div className="rounded-xl border border-border p-4 flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex justify-between">
              <Bone className="w-24 h-3" />
              <Bone className="w-32 h-3" />
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
