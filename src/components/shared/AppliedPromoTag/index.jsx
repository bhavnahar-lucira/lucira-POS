'use client';

import { CheckCircle2, Tag, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * @param {{
 *   promoCode: string | null,
 *   promoName?: string | null,
 *   discountAmount?: number,
 *   hasEffect?: boolean,
 *   onRemove: () => void,
 *   className?: string,
 * }} props
 */
export default function AppliedPromoTag({ promoCode, promoName, discountAmount, hasEffect = true, onRemove, className }) {
  if (!promoCode) return null;

  const tone = hasEffect
    ? { bg: 'bg-status-in-stock/10', text: 'text-status-in-stock', border: 'border-status-in-stock/20' }
    : { bg: 'bg-muted', text: 'text-muted-foreground', border: 'border-border' };
  const Icon = hasEffect ? CheckCircle2 : Tag;

  return (
    <div className={cn('flex items-center gap-1.5 rounded-sm border pl-2.5 pr-1 py-1 shadow-xs', tone.bg, tone.border, className)}>
      <Icon size={13} className={cn(tone.text, 'shrink-0')} aria-hidden="true" />
      <p className={cn('text-xs font-semibold truncate min-w-0', tone.text)}>
        {promoName || promoCode}
        {discountAmount > 0 && (
          <span className="font-normal opacity-80"> · Saved ₹{discountAmount.toLocaleString('en-IN')}</span>
        )}
      </p>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove promo code ${promoCode}`}
        className={cn('shrink-0 ml-auto flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:text-destructive hover:bg-destructive/10', tone.text)}
      >
        <X size={13} aria-hidden="true" />
      </button>
    </div>
  );
}
