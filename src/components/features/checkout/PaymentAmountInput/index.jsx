'use client';

// Amount entry for a single selected payment mode (split payment support).

import { Input } from '@/components/ui/input';

/**
 * @param {{
 *   modeName: string,
 *   amount: number | string,
 *   onChange: (value: string) => void,
 *   readOnly?: boolean,
 * }} props
 *   readOnly (default false) — for a fixed, non-negotiable figure (Nector
 *   Loyalty's own eligibility answer, see CheckoutPaymentSection) rather
 *   than an operator-entered tender amount.
 */
export default function PaymentAmountInput({ modeName, amount, onChange, readOnly = false }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <label
        htmlFor={`payment-amount-${modeName}`}
        className="text-sm font-medium text-foreground/80 min-w-0 truncate"
      >
        {modeName}
      </label>
      <div className="relative w-36 shrink-0">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
          ₹
        </span>
        <Input
          id={`payment-amount-${modeName}`}
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          value={amount}
          onChange={(e) => onChange(e.target.value)}
          readOnly={readOnly}
          className={`h-11 pl-7 text-right ${readOnly ? 'bg-muted text-muted-foreground' : ''}`}
          aria-label={`Amount for ${modeName}`}
        />
      </div>
    </div>
  );
}