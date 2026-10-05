'use client';

import { Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

const SIZES = {
  default: {
    button:   'min-w-9 min-h-9 sm:min-w-[44px] sm:min-h-[44px]',
    quantity: 'min-w-[28px] px-1 text-sm sm:min-w-[44px] sm:px-2 sm:text-base',
    icon:     16,
    iconClassName: 'size-3.5 sm:size-4',
  },
  compact: {
    button:   'min-w-[36px] min-h-[36px]',
    quantity: 'min-w-[28px] px-1 text-sm',
    icon:     14,
    iconClassName: undefined,
  },
};

const STEP_BUTTON = 'flex items-center justify-center text-stone-600 hover:bg-stone-50 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors';

/**
 * @param {{
 *   quantity: number,
 *   onDecrement: () => void,
 *   onIncrement: () => void,
 *   decrementDisabled?: boolean,
 *   incrementDisabled?: boolean,
 *   disabled?: boolean,
 *   trailing?: React.ReactNode,
 *   className?: string,
 *   size?: 'default' | 'compact',
 * }} props
 */
export default function QuantityStepper({
  quantity,
  onDecrement,
  onIncrement,
  decrementDisabled = false,
  incrementDisabled = false,
  disabled = false,
  trailing,
  className,
  size = 'default',
}) {
  const s = SIZES[size] ?? SIZES.default;

  return (
    <div
      className={cn('inline-flex items-center gap-1 rounded-lg border border-border bg-card', className)}
      aria-label="Quantity selector"
    >
      <button
        type="button"
        onClick={onDecrement}
        disabled={disabled || decrementDisabled}
        aria-label="Decrease quantity"
        className={cn(STEP_BUTTON, s.button, 'rounded-l-lg')}
      >
        <Minus size={s.icon} className={s.iconClassName} aria-hidden="true" />
      </button>

      <span
        aria-live="polite"
        aria-atomic="true"
        className={cn('flex items-center justify-center font-semibold text-stone-800 tabular-nums select-none', s.quantity)}
      >
        {quantity}
      </span>

      <button
        type="button"
        onClick={onIncrement}
        disabled={disabled || incrementDisabled}
        aria-label="Increase quantity"
        className={cn(STEP_BUTTON, s.button, 'rounded-r-lg')}
      >
        <Plus size={s.icon} className={s.iconClassName} aria-hidden="true" />
      </button>

      {trailing}
    </div>
  );
}
