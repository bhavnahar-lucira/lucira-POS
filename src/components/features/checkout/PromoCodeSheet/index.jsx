'use client';

import { useState } from 'react';
import { Percent, Tag, ChevronDown } from 'lucide-react';
import BottomSheet from '@/components/shared/BottomSheet';
import { Button } from '@/components/ui/button';
import EmptyState from '@/components/shared/EmptyState';
import InlineLoader from '@/components/shared/InlineLoader';
import { useActivePromotions } from '@/hooks/checkout/useActivePromotions';
import tracker from '@/lib/analytics/tracker';
import EVENTS from '@/lib/analytics/events';
import { cn } from '@/lib/utils';
import { formatDateCompact as formatDate } from '@/lib/dateUtils';
import {
  getPromotionTypeLabel,
  getPromotionScopeLabel,
  getApplicableOnLabel,
  getDiscountCalcOnLabel,
  hasScopedEligibility,
  hasConditionalRules,
} from '@/lib/normalizers/promotion';

function getBadge(promo) {
  const pct = Number(promo?.discount_percentage) || 0;
  const amt = Number(promo?.discount_amount) || 0;
  if (pct > 0) return `${pct}%`;
  if (amt > 0) return `₹${amt.toLocaleString('en-IN')}`;
  return getPromotionTypeLabel(promo);
}

function OfferTicket({ promo, isApplied, isSelected, isExpanded, onToggleSelect, onToggleExpand }) {
  const badge = getBadge(promo);
  const expiryLabel = promo.to_date ? `Valid until: ${formatDate(promo.to_date)}` : null;
  const typeLabel = getPromotionTypeLabel(promo);
  const scopeLabel = getPromotionScopeLabel(promo);
  const applicableOnLabel = getApplicableOnLabel(promo);
  const calcOnLabel = getDiscountCalcOnLabel(promo);
  const minPurchase = Number(promo.minimum_sales_amount) || 0;
  const isScoped = hasScopedEligibility(promo);
  const isConditional = hasConditionalRules(promo);

  return (
    <div
      className={cn(
        'rounded-2xl border shadow-xs transition-colors',
        isApplied
          ? 'border-status-in-stock/30 bg-status-in-stock/10'
          : isSelected
            ? 'border-accent bg-accent/5 shadow-sm'
            : 'border-border bg-card hover:border-accent/40',
      )}
    >
      <button
        type="button"
        disabled={isApplied}
        data-analytics-skip="true"
        onClick={() => {
          tracker.track(EVENTS.OFFER_SELECTED, {
            offer_name: promo.promotion_name,
            offer_code: promo.promotion_code,
          });
          onToggleSelect(promo.promotion_code);
        }}
        className="flex w-full items-center gap-3 p-4 text-left disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
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
          <span className="shrink-0 rounded-full bg-accent/10 px-2.5 py-1 text-xs font-bold text-accent">
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
              'flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
              isSelected ? 'border-accent bg-accent' : 'border-border',
            )}
          >
            {isSelected && <span className="size-2 rounded-full bg-accent-foreground" />}
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
          {scopeLabel && (
            <div className="flex justify-between gap-3">
              <span>Scope</span>
              <span className="font-medium text-foreground/80">{scopeLabel}</span>
            </div>
          )}
          {applicableOnLabel && (
            <div className="flex justify-between gap-3">
              <span>Applies to</span>
              <span className="font-medium text-foreground/80">
                {applicableOnLabel}
                {isScoped && ` (+${promo.promotion_details.length} eligibility rule${promo.promotion_details.length === 1 ? '' : 's'})`}
              </span>
            </div>
          )}
          {calcOnLabel && (Number(promo.discount_percentage) > 0) && (
            <div className="flex justify-between gap-3">
              <span>Calculated on</span>
              <span className="font-medium text-foreground/80">{calcOnLabel}</span>
            </div>
          )}
          {minPurchase > 0 && (
            <div className="flex justify-between gap-3">
              <span>Min purchase</span>
              <span className="font-medium text-foreground/80">₹{minPurchase.toLocaleString('en-IN')}</span>
            </div>
          )}
          {isConditional && (
            <p className="pt-1 text-[11px] italic text-muted-foreground/80">
              Has extra conditions (e.g. a bill-value bracket) — the real discount is confirmed when applied.
            </p>
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
 *   triggerClassName?: string,
 * }} props
 */
export default function PromoCodeSheet({ onApply, isApplying, appliedPromos = [], triggerClassName = 'w-full' }) {
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
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        className={cn(
          'h-auto min-h-9 justify-center gap-2 whitespace-normal text-center text-xs font-semibold leading-tight py-2 sm:text-sm',
          'border-accent/40 bg-accent/5 hover:border-accent hover:bg-accent/10',
          triggerClassName,
        )}
      >
        <Tag className="size-4 shrink-0 text-accent" aria-hidden="true" />
        View available offers
      </Button>

      <BottomSheet
        isOpen={open}
        onClose={() => handleOpenChange(false)}
        title="Available Offers"
        footer={
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {selected.size} promotion{selected.size === 1 ? '' : 's'} selected
            </span>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="h-11" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                className="h-11"
                disabled={selected.size === 0 || isApplying}
                onClick={handleApplySelected}
              >
                Apply Selected
              </Button>
            </div>
          </div>
        }
      >
        <p className="mb-3 text-sm text-muted-foreground">
          Select one or more offers, then apply.
        </p>

        <div className="flex flex-col gap-3">
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
      </BottomSheet>
    </>
  );
}
