'use client';

// src/components/shared/QuantityStepper/index.jsx
//
// Shared +/- quantity control. Was independently hand-built in
// QuantitySelector (product detail, 44px touch targets per
// CODING_STANDARDS) and CartItemQuantityControl (cart row, 34px targets,
// no focus-visible ring) — the two had drifted on touch-target size and
// accessibility. Standardizes on the 44px minimum.
//
// ADDED size="compact" (2026-09-09) — requested for the cart row (mini
// cart drawer / Cart page / Checkout's Order Items summary, all via
// CartItemRow → CartItemQuantityControl): several of these rows stack in a
// narrow drawer, and the default's 44px target reads as oversized there.
// Deliberately NOT applied to QuantitySelector (product detail) — that's a
// single, primary control on its own page where the full CODING_STANDARDS
// touch target still applies; only the cart row opts into the smaller one.
// Still a real, tappable button (36px) — not shrunk below a usable size,
// just below the 44px minimum meant for a lone primary control.

import { Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

const SIZES = {
  // 'default' is only ever used by QuantitySelector (the product detail
  // sticky bar's own control) — safe to shrink on mobile here directly
  // rather than adding a third size key. Below sm it reuses 'compact's own
  // dimensions (reported: too large/cramped alongside Total + Add to Cart
  // on a narrow phone); sm+ is untouched, same 44px targets as before.
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
