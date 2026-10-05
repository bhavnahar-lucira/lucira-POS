'use client';

import { useState } from 'react';
import { Slider } from 'radix-ui';
import { cn } from '@/lib/utils';

/**
 * @param {{
 *   min: number, max: number, value: [number, number],
 *   onChange: (lo: number, hi: number) => void,
 *   formatValue?: (n: number) => string,
 * }} props
 */
export default function RangeSlider({ min, max, value, onChange, formatValue = (n) => n }) {
  const [lo, hi] = value;
  const [local, setLocal] = useState([lo, hi]);
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
