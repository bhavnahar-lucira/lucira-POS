'use client';

// Dual-thumb range slider — REBUILT 2026-09-30 (reported directly: the
// previous "two overlaid native <input type="range">" hack only showed/let
// you drag ONE handle, reading as a single max-only slider, not "a proper
// min max range filter"). Uses radix-ui's own Slider primitive instead —
// already a dependency in this app (see components/ui/sheet.jsx's identical
// import pattern) and built specifically for a robust, independently
// draggable multi-thumb range, so there's no custom overlay/pointer-events
// hack left to get subtly wrong.

import { useState } from 'react';
import { Slider } from 'radix-ui';
import { cn } from '@/lib/utils';

/**
 * @param {{
 *   min: number, max: number, value: [number, number],
 *   onChange: (lo: number, hi: number) => void,
 *   formatValue?: (n: number) => string,
 * }} props
 *   onChange fires once per interaction (drag release, or per discrete
 *   keyboard step) via Radix's own onValueCommit — NOT on every continuous
 *   drag tick. Reported directly (2026-09-30): calling it on every tick
 *   (Radix's onValueChange) made a drag visibly lag several seconds behind
 *   the thumb, since the parent facet callback round-trips through a real
 *   `router.replace()` navigation (see useCatalogFilters.js) — far too
 *   expensive to run dozens of times per second. Local `local` state below
 *   is what the thumb/labels actually render from, so dragging itself stays
 *   instant regardless of how expensive committing the value is upstream.
 */
export default function RangeSlider({ min, max, value, onChange, formatValue = (n) => n }) {
  const [lo, hi] = value;
  const [local, setLocal] = useState([lo, hi]);

  // Re-sync when the PARENT's value changes for a reason other than this
  // component's own drag (e.g. "Clear all", or the bounds growing as more
  // items price in) — same mid-render idiom as ProductFilterPanel's own
  // RangePair (see its lastProps comment for why this can't be a useEffect).
  const [lastProps, setLastProps] = useState([lo, hi]);
  if (lastProps[0] !== lo || lastProps[1] !== hi) {
    const wasInSync = local[0] === lastProps[0] && local[1] === lastProps[1];
    setLastProps([lo, hi]);
    if (wasInSync) setLocal([lo, hi]);
  }

  return (
    <div className="flex flex-col gap-2">
      <Slider.Root
        className="relative flex h-5 w-full touch-none select-none items-center"
        min={min}
        max={max}
        value={local}
        onValueChange={(next) => setLocal(next)}
        onValueCommit={([nextLo, nextHi]) => onChange(nextLo, nextHi)}
      >
        <Slider.Track className="relative h-1 grow rounded-full bg-border">
          <Slider.Range className="absolute h-full rounded-full bg-accent" />
        </Slider.Track>
        {['Minimum price', 'Maximum price'].map((label) => (
          <Slider.Thumb
            key={label}
            aria-label={label}
            className={cn(
              'block size-4 shrink-0 rounded-full border-2 border-white bg-accent shadow',
              'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            )}
          />
        ))}
      </Slider.Root>
      <div className="flex items-center justify-between text-sm text-foreground">
        <span>{formatValue(local[0])}</span>
        <span>{formatValue(local[1])}</span>
      </div>
    </div>
  );
}
