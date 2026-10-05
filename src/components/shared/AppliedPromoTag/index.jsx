'use client';

// Applied-promo-code pill with a remove action, shown on cart and
// checkout screens.

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
 *   promoName — the promotion's real name (e.g. "20% Off Diamond"), shown
 *   instead of the raw code once applied — reported directly: a code like
 *   "57R53ZHE" means nothing to an operator/customer at a glance. Falls back
 *   to promoCode when a promotion's name isn't available for some reason.
 *   hasEffect (default true) — pass false when the code is applied but
 *   yields no actual discount, to show neutral/muted styling instead of
 *   the success tone (still shown as applied/removable either way).
 */
export default function AppliedPromoTag({ promoCode, promoName, discountAmount, hasEffect = true, onRemove, className }) {
  if (!promoCode) return null;

  const tone = hasEffect
    ? { bg: 'bg-status-in-stock/10', text: 'text-status-in-stock', border: 'border-status-in-stock/20' }
    : { bg: 'bg-muted', text: 'text-muted-foreground', border: 'border-border' };
  const Icon = hasEffect ? CheckCircle2 : Tag;

  return (
    <div className={cn('flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5 shadow-xs', tone.bg, tone.border, className)}>
      <div className="flex items-center gap-2 min-w-0">
        <Icon size={16} className={cn(tone.text, 'shrink-0')} aria-hidden="true" />
        <div className="min-w-0">
          <p className={cn('text-sm font-semibold truncate', tone.text)}>
            {promoName || promoCode} applied
          </p>
          {discountAmount > 0 && (
            <p className={cn('text-xs', tone.text)}>
              You saved ₹{discountAmount.toLocaleString('en-IN')}
            </p>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove promo code ${promoCode}`}
        className="shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
