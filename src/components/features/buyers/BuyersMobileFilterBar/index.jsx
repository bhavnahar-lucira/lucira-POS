'use client';

import { SlidersHorizontal, RefreshCw } from 'lucide-react';

// Floating bottom pill, mobile only — same space-saving pattern catalog's
// own MobileSortFilterBar uses (src/components/features/catalog/
// MobileSortFilterBar). Sync sits beside Filter here (rather than Sort,
// which Buyers has no equivalent of) since it's the other action this page
// needs reachable while scrolled, without eating header space.
export default function BuyersMobileFilterBar({
  hasActiveFilters,
  onOpenFilters,
  showSync,
  isSyncing,
  onSync,
}) {
  return (
    <div className="md:hidden fixed inset-x-0 bottom-4 z-30 flex justify-center pointer-events-none">
      <div className="pointer-events-auto flex items-stretch overflow-hidden rounded-full bg-primary text-background shadow-xl">
        {showSync && (
          <>
            <button
              type="button"
              onClick={onSync}
              disabled={isSyncing}
              aria-label="Refresh from OrnaVerse"
              className="flex items-center gap-2 px-6 py-3 text-sm font-medium active:bg-white/10 disabled:opacity-60"
            >
              <RefreshCw size={16} className={isSyncing ? 'animate-spin' : ''} aria-hidden="true" />
              Sync
            </button>
            <div className="w-px my-2 bg-background/25" aria-hidden="true" />
          </>
        )}

        <button
          type="button"
          onClick={onOpenFilters}
          className="flex items-center gap-2 px-6 py-3 text-sm font-medium active:bg-white/10"
        >
          <SlidersHorizontal size={16} aria-hidden="true" />
          Filter
          {hasActiveFilters && <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}
