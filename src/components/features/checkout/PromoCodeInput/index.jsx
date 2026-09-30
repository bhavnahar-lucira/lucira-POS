'use client';

// "Enter Promo" trigger — opens a sheet (same pattern as PromoCodeSheet's
// "View available offers") to type a code + optional Override Amount,
// instead of always showing the code/amount inputs inline on the checkout
// page — reported directly: wanted it collapsed behind a button, matching
// the Available Offers sheet's own look.

import { useState } from 'react';
import { Loader2, Tag } from 'lucide-react';
import BottomSheet from '@/components/shared/BottomSheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

/**
 * @param {{
 *   onApply: (code: string, overrideAmount: number|null) => void,
 *   isValidating?: boolean,
 *   disabled?: boolean,
 *   disabledHint?: string,
 *   triggerClassName?: string,
 * }} props
 *   disabled/disabledHint — kept disabled (rather than left to fail after
 *   the click) while the basket hasn't finished pricing yet, since a
 *   code's real eligibility can't be checked until then (usePromoValidation).
 *
 *   Override Amount — matches OrnaVerse's own "Enter Promo" dialog field
 *   (confirmed live 2026-09-30, same placeholder/helper copy): replaces this
 *   promotion's own Net/Gross-calculated discount with a final-bill
 *   reduction the operator types directly. Only sent alongside a real code.
 *   No local cap — the server enforces the promotion's own tiered
 *   promotion_rules[] bracket caps and clamps silently if exceeded (verified
 *   live), so this app doesn't second-guess that with its own limit.
 *
 *   triggerClassName - wraps the trigger button + disabled hint (kept
 *   together in their own container, not a bare fragment) so DiscountSection
 *   can sit this as one flex item next to PromoCodeSheet's own trigger.
 */
export default function PromoCodeInput({
  onApply, isValidating, disabled = false, disabledHint, triggerClassName = 'w-full',
}) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [overrideAmount, setOverrideAmount] = useState('');

  const isDisabled = disabled || isValidating;

  const reset = () => {
    setCode('');
    setOverrideAmount('');
  };

  const handleOpenChange = (next) => {
    if (!next) reset();
    setOpen(next);
  };

  // Closes immediately on click, same fire-and-forget pattern as
  // PromoCodeSheet's "Apply Selected" — usePromoValidation reports the
  // outcome (success/failure) via toast once the check comes back.
  const handleApply = () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed || isDisabled) return;
    const override = overrideAmount.trim() === '' ? null : Number(overrideAmount);
    onApply(trimmed, override);
    setOpen(false);
    reset();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleApply();
    }
  };

  return (
    <div className={triggerClassName}>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        disabled={isDisabled}
        className="h-auto min-h-9 w-full justify-center gap-2 whitespace-normal py-2 text-center text-xs font-semibold leading-tight bg-secondary sm:text-sm"
      >
        <Tag className="size-4 shrink-0" aria-hidden="true" />
        Enter Promo
      </Button>
      {disabled && disabledHint && (
        <p className="px-1 text-xs text-muted-foreground">{disabledHint}</p>
      )}

      <BottomSheet
        isOpen={open}
        onClose={() => handleOpenChange(false)}
        title="Enter Promo Code"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="outline" className="h-11" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              className="h-11"
              disabled={!code.trim() || isDisabled}
              onClick={handleApply}
            >
              {isValidating ? (
                <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              ) : (
                'Apply'
              )}
            </Button>
          </div>
        }
      >
        <p className="mb-3 text-sm text-muted-foreground">
          Enter a promo code, optionally with an override amount.
        </p>

        <div className="flex flex-col gap-3">
          <Input
            type="text"
            inputMode="text"
            autoCapitalize="characters"
            placeholder="Enter promo code"
            aria-label="Promo code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isDisabled}
            className="h-11 uppercase"
            autoFocus
          />

          <div className="flex flex-col gap-1.5">
            <Input
              type="number"
              inputMode="decimal"
              placeholder="Override Amount (optional)"
              aria-label="Override amount"
              value={overrideAmount}
              onChange={(e) => setOverrideAmount(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isDisabled}
              className="h-11"
            />
            <p className="px-1 text-xs text-muted-foreground">
              For invoice Net/Gross promos, enter the amount off the final payable (e.g. 653 to go 48653 → 48000). Tax is recalculated.
            </p>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}
