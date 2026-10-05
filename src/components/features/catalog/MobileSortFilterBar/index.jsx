'use client';

import { useState } from 'react';
import { ArrowUpDown, SlidersHorizontal, Check } from 'lucide-react';
import BottomSheet from '@/components/shared/BottomSheet';
import { SORT_OPTIONS, DEFAULT_SORT } from '@/hooks/catalog/useCatalogFilters';

export default function MobileSortFilterBar({
  sortBy,
  onSortChange,
  hasActiveFilters,
  onOpenFilters,
}) {
  const [isSortOpen, setIsSortOpen] = useState(false);

  return (
    <>
      <div className="md:hidden fixed inset-x-0 bottom-4 z-30 flex justify-center pointer-events-none">
        <div className="pointer-events-auto flex items-stretch overflow-hidden rounded-full bg-primary text-background shadow-xl">
          <button
            type="button"
            onClick={() => setIsSortOpen(true)}
            className="flex items-center gap-2 px-5 py-3 text-sm font-medium active:bg-white/10"
          >
            <ArrowUpDown size={16} /> Sort
          </button>
          <div className="w-px my-2 bg-background/25" aria-hidden="true" />
          <button
            type="button"
            onClick={onOpenFilters}
            className="flex items-center gap-2 px-5 py-3 text-sm font-medium active:bg-white/10"
          >
            <SlidersHorizontal size={16} /> Filter
            {hasActiveFilters && (
              <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      <BottomSheet
        isOpen={isSortOpen}
        onClose={() => setIsSortOpen(false)}
        title="Sort by"
        alwaysBottom
      >
        <div className="flex flex-col gap-1">
          {SORT_OPTIONS.map((opt) => {
            const isActive = (sortBy || DEFAULT_SORT) === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onSortChange(opt.value); setIsSortOpen(false); }}
                className={`flex items-center justify-between rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
                  isActive ? 'bg-accent/10 text-accent' : 'text-foreground hover:bg-secondary'
                }`}
              >
                {opt.label}
                {isActive && <Check size={16} />}
              </button>
            );
          })}
        </div>
      </BottomSheet>
    </>
  );
}
