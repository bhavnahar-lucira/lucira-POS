'use client';

// "Enter Promo" trigger — opens a sheet (same pattern as PromoCodeSheet's
// "View available offers") to type a code + optional Override Amount,
// instead of always showing the code/amount inputs inline on the checkout
// page — reported directly: wanted it collapsed behind a button, matching
// the Available Offers sheet's own look.

import { useState } from 'react';
import { Loader2, Tag } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

/**
 * @param {{
 *   onApply: (code: string, overrideAmount: number|null) => void,
 *   isValidating?: boolean,
 *   disabled?: boolean,
 *   disabledHint?: string,
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
 */
export default function PromoCodeInput({ onApply, isValidating, disabled = false, disabledHint }) {
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
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        disabled={isDisabled}
        className="w-full justify-center gap-2 text-sm font-semibold bg-secondary"
      >
        <Tag className="size-4" aria-hidden="true" />
        Enter Promo
      </Button>
      {disabled && disabledHint && (
        <p className="px-1 text-xs text-muted-foreground">{disabledHint}</p>
      )}

      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Enter Promo Code</SheetTitle>
          <SheetDescription>
            Enter a promo code, optionally with an override amount.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-3 px-4">
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

        <SheetFooter className="flex-row items-center justify-end border-t border-border">
          <Button type="button" variant="outline" size="sm" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!code.trim() || isDisabled}
            onClick={handleApply}
          >
            {isValidating ? (
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            ) : (
              'Apply'
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
