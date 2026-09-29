'use client';

// Side sheet listing every currently-active, non-code_required promotion
// (see useActivePromotions — approved, not disabled, in date, discoverable
// without typing a code). Matches OrnaVerse's own picker exactly, including
// its interaction model (2026-09-28, reported directly, real OrnaVerse
// screen captured for reference): OrnaVerse does NOT pre-filter by whether
// the current cart is actually eligible for a given offer — "Free Silver
// Bracelet" showed there even though tapping it against a cart with no free
// item genuinely 400s server-side ("Free gift items not found in the
// transaction") — ineligibility only ever surfaces at APPLY time, never as
// a pre-filter on the list. So this sheet shows the same "configured
// active" set OrnaVerse does, and leaves a real mismatch to usePromoValidation's
// existing "ineligible" toast when someone actually taps Apply.
//
// Multi-select, not tap-and-close: OrnaVerse lets an operator check several
// offers, then commit them all with one "Apply Selected" — this mirrors
// that instead of applying (and closing the sheet) on the first tap.

import { useState } from 'react';
import { Percent, Tag, ChevronDown } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import EmptyState from '@/components/shared/EmptyState';
import InlineLoader from '@/components/shared/InlineLoader';
import { useActivePromotions } from '@/hooks/checkout/useActivePromotions';
import { cn } from '@/lib/utils';
import { formatDateCompact as formatDate } from '@/lib/dateUtils';

// promotion_type — confirmed live against OrnaVerse's own picker (2026-09-28):
// type 6 + a free_item_id is how "Free Silver Bracelet"/"Free Bracelet -
// 30k+" etc. are marked, distinct from a plain discount (type 1). Only
// these two values have been confirmed against real data; anything else
// falls back to a generic label rather than guessing.
const PROMOTION_TYPE_LABEL = {
  1: 'Discount',
  6: 'Free Gift',
};

// Badge — percent, then flat amount, then "Free gift" (promotion_type 6 +
// free_item_id), then the promotion's own code as a last resort (matches
// OrnaVerse exactly: a rule-based promotion with no top-level discount_
// percentage/amount, e.g. "Making Charges off - diamond products", shows
// its CODE as the badge there too — its real discount only exists per-rule,
// nothing meaningful to show as a flat number here).
function getBadge(promo) {
  const pct = Number(promo?.discount_percentage) || 0;
  const amt = Number(promo?.discount_amount) || 0;
  if (pct > 0) return `${pct}%`;
  if (amt > 0) return `₹${amt.toLocaleString('en-IN')}`;
  if (promo?.promotion_type === 6 && promo?.free_item_id) return 'Free gift';
  return promo?.promotion_code ?? null;
}

function OfferTicket({ promo, isApplied, isSelected, isExpanded, onToggleSelect, onToggleExpand }) {
  const badge = getBadge(promo);
  const expiryLabel = promo.to_date ? `Valid until: ${formatDate(promo.to_date)}` : null;
  const typeLabel = PROMOTION_TYPE_LABEL[promo.promotion_type] ?? 'Offer';
  const minPurchase = Number(promo.minimum_sales_amount) || 0;

  return (
    <div
      className={cn(
        'rounded-2xl border shadow-sm transition-colors',
        isApplied
          ? 'border-status-in-stock/30 bg-status-in-stock/10'
          : isSelected
            ? 'border-primary bg-primary/5'
            : 'border-border bg-card',
      )}
    >
      <button
        type="button"
        disabled={isApplied}
        onClick={() => onToggleSelect(promo.promotion_code)}
        className="flex w-full items-center gap-3 p-4 text-left disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Percent className="size-4" aria-hidden="true" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-foreground">
            {promo.promotion_name}
          </span>
          {expiryLabel && (
            <span className="block text-xs text-muted-foreground">{expiryLabel}</span>
          )}
        </span>

        {badge && (
          <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
            {badge}
          </span>
        )}

        {isApplied ? (
          <span className="shrink-0 text-[10px] font-bold tracking-wide text-status-in-stock">
            APPLIED
          </span>
        ) : (
          <span
            className={cn(
              'flex size-5 shrink-0 items-center justify-center rounded-full border-2',
              isSelected ? 'border-primary bg-primary' : 'border-border',
            )}
          >
            {isSelected && <span className="size-2 rounded-full bg-primary-foreground" />}
          </span>
        )}

        <span
          role="button"
          tabIndex={0}
          aria-label="Show details"
          aria-expanded={isExpanded}
          onClick={(e) => { e.stopPropagation(); onToggleExpand(promo.promotion_id); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); onToggleExpand(promo.promotion_id); }
          }}
          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted"
        >
          <ChevronDown className={cn('size-4 transition-transform', isExpanded && 'rotate-180')} aria-hidden="true" />
        </span>
      </button>

      {isExpanded && (
        <div className="flex flex-col gap-1 border-t border-border px-4 py-3 text-xs text-muted-foreground">
          <div className="flex justify-between gap-3">
            <span>Code</span>
            <span className="font-mono font-semibold text-foreground/80">{promo.promotion_code}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span>Type</span>
            <span className="font-medium text-foreground/80">{typeLabel}</span>
          </div>
          {minPurchase > 0 && (
            <div className="flex justify-between gap-3">
              <span>Min purchase</span>
              <span className="font-medium text-foreground/80">₹{minPurchase.toLocaleString('en-IN')}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * @param {{
 *   onApply: (code: string) => void,
 *   isApplying?: boolean,
 *   appliedPromos?: { promoCode: string }[],
 * }} props
 */
export default function PromoCodeSheet({ onApply, isApplying, appliedPromos = [] }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const { data: promotions = [], isLoading } = useActivePromotions();
  const appliedCodes = new Set(appliedPromos.map((p) => p.promoCode));

  const toggleSelect = (code) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  };

  const toggleExpand = (id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const reset = () => {
    setSelected(new Set());
    setExpandedIds(new Set());
  };

  const handleOpenChange = (next) => {
    if (!next) reset();
    setOpen(next);
  };

  const handleApplySelected = () => {
    selected.forEach((code) => onApply(code));
    setOpen(false);
    reset();
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      {/* A real standalone button, not a text link nested in a "Discount"
          card (that box design is retired, reported directly) — this is
          meant to read as its own independent action. */}
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        className="w-full justify-center gap-2 text-sm font-semibold"
      >
        <Tag className="size-4" aria-hidden="true" />
        View available offers
      </Button>

      <SheetContent side="right" className="p-0">
        <SheetHeader>
          <SheetTitle>Available Offers</SheetTitle>
          <SheetDescription>
            Select one or more offers, then apply.
          </SheetDescription>
        </SheetHeader>

        {/* min-h-0 is required: without it this flex child's default
            min-height (its own content size) stops it from shrinking to
            the space left under SheetHeader, so the list grows instead of
            scrolling internally. */}
        <div className="flex flex-1 min-h-0 flex-col gap-3 overflow-y-auto px-4 pb-4">
          {isLoading && <InlineLoader label="Loading offers…" />}

          {!isLoading && promotions.length === 0 && (
            <EmptyState
              icon={Percent}
              title="No offers are running right now"
              description="Check back later for new promotions on this order."
            />
          )}

          {!isLoading && promotions.map((promo) => (
            <OfferTicket
              key={promo.promotion_id}
              promo={promo}
              isApplied={appliedCodes.has(promo.promotion_code)}
              isSelected={selected.has(promo.promotion_code)}
              isExpanded={expandedIds.has(promo.promotion_id)}
              onToggleSelect={toggleSelect}
              onToggleExpand={toggleExpand}
            />
          ))}
        </div>

        <SheetFooter className="flex-row items-center justify-between border-t border-border">
          <span className="text-xs text-muted-foreground">
            {selected.size} promotion{selected.size === 1 ? '' : 's'} selected
          </span>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={selected.size === 0 || isApplying}
              onClick={handleApplySelected}
            >
              Apply Selected
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
