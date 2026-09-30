'use client';

// Customize sheet — shown when user taps "Customize" on product detail.
// Uses shared BottomSheet (bottom on mobile, side sheet on tablet).

import { useState, useCallback, useMemo } from 'react';
import { Store, Loader2 } from 'lucide-react';
import BottomSheet from '@/components/shared/BottomSheet';
import { Skeleton } from '@/components/ui/skeleton';
import { useVariantPricing } from '@/hooks/products/useVariantPricing';
import { formatPrice } from '@/lib/priceUtils';
import tracker from '@/lib/analytics/tracker';
import EVENTS from '@/lib/analytics/events';
import { buildProductAttributes } from '@/lib/analytics/productAttributes';

const COLOR_GRADIENTS = {
  yellow: 'linear-gradient(147.45deg, #c59922 17.98%, #ead59e 48.14%, #c59922 83.84%)',
  rose:   'linear-gradient(154.36deg, #f2b5b5 10.36%, #f8dbdb 68.09%)',
  white:  'linear-gradient(143.06deg, #dfdfdf 29.61%, #f3f3f3 48.83%, #dfdfdf 66.43%)',
};

function resolveGradient(name) {
  if (!name) return COLOR_GRADIENTS.white;
  const lc = name.toLowerCase();
  if (lc.includes('yellow')) return COLOR_GRADIENTS.yellow;
  if (lc.includes('rose'))   return COLOR_GRADIENTS.rose;
  if (lc.includes('white'))  return COLOR_GRADIENTS.white;
  return COLOR_GRADIENTS.yellow;
}

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-7">
      <Skeleton className="h-3 w-40" />
      <div className="grid grid-cols-3 gap-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-3 w-28 mt-2" />
      <div className="flex gap-2">
        {[1, 2].map((i) => (
          <Skeleton key={i} className="h-10 w-16 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-3 w-28 mt-2" />
      <div className="grid grid-cols-5 gap-2">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-12 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

// ── Stock status dot ──────────────────────────────────────────────────────────
// Green dot = in stock, no dot at all otherwise (2026-08-23) — matches
// lucirajewelry.com's own customize UI, confirmed against a real screenshot:
// the site never marks a Made to Order option with any dot, it just leaves
// it plain and lets the absence speak for itself. This used to also render
// an amber dot for made_to_order, which read as a second, competing signal
// next to the green one instead of matching the brand's plainer treatment.

function StockDot({ status }) {
  if (status !== 'in_stock') return null;
  return (
    <span
      aria-label="In stock"
      className="absolute top-1.5 left-1.5 w-2 h-2 rounded-full bg-status-in-stock"
    />
  );
}

function MetalColorCard({ color, karat, isSelected, stockStatus, onClick }) {
  const gradient = resolveGradient(color.name);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isSelected}
      className={[
        'relative flex flex-col items-center justify-center gap-2',
        'rounded-2xl border py-4 px-2',
        'transition-all duration-150 min-h-[88px]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isSelected
          ? 'border-foreground bg-card shadow-sm'
          : 'border-border bg-card hover:border-accent/60',
      ].join(' ')}
    >
      <StockDot status={stockStatus} />

      <span
        aria-hidden="true"
        className="w-6 h-6 rounded-full shrink-0"
        style={{ background: gradient }}
      />

      <span className="flex flex-col items-center leading-tight text-center">
        {karat && (
          <span className="text-[11px] font-semibold text-foreground">
            {karat.name}
          </span>
        )}
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
          {color.name}
        </span>
      </span>
    </button>
  );
}

function KaratPill({ karat, isSelected, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isSelected}
      className={[
        'min-h-[40px] px-5 py-2 rounded-xl text-sm font-semibold',
        'border transition-all duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isSelected
          ? 'bg-primary border-primary text-primary-foreground shadow-sm'
          : 'bg-card border-border text-foreground hover:border-accent/60',
      ].join(' ')}
    >
      {karat.name}
    </button>
  );
}

function SizeChip({ size, isSelected, stockStatus, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isSelected}
      className={[
        'relative min-h-[48px] px-2 rounded-xl',
        'border text-sm font-medium',
        'flex items-center justify-center',
        'transition-all duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isSelected
          ? 'bg-primary border-primary text-primary-foreground shadow-sm'
          : 'bg-card border-border text-foreground hover:border-accent/60',
      ].join(' ')}
    >
      <StockDot status={stockStatus} />
      {size.name}
    </button>
  );
}

function SectionLabel({ label, value }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      {value && (
        <p className="text-[11px] font-semibold text-accent">
          {value}
        </p>
      )}
    </div>
  );
}

export default function CustomizeSheet({
  isOpen,
  onClose,
  product,
  selectedVariant = null,
  variants        = [],
  metalColors     = [],
  karats          = [],
  sizes           = [],
  storesByItemId  = new Map(),
  findVariant,
  onConfirm,
  isLoading,
  activeStoreId   = null,
  activeStoreName = null,
}) {
  const [selectedMetalColorId, setSelectedMetalColorId] = useState(null);
  const [selectedKaratId,      setSelectedKaratId]      = useState(null);
  const [selectedSizeId,       setSelectedSizeId]       = useState(null);

  // Seed from product defaults every time the sheet opens.
  // FIX: previously did this in a useEffect keyed on [isOpen], which React
  // Compiler flags (setState-synchronously-in-effect risks a cascading
  // render). This sheet stays mounted across open/close for its slide
  // transition, so remounting via `key` (the fix used on the product
  // detail page for the same class of problem) isn't an option here — it
  // would break the close animation. Instead this uses React's documented
  // "adjust state during render" pattern: track the previous isOpen in a
  // plain useState and compare during render, calling setState only when
  // the tracked value actually changes. This runs synchronously during
  // render (not in an effect), so there's no extra render pass.
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      const source = selectedVariant ?? product;
      setSelectedMetalColorId(source?.metal_color_id ?? null);
      setSelectedKaratId(source?.karat_id             ?? null);
      setSelectedSizeId(source?.item_size_id          ?? null);

      // ADDED 2026-09-08 — CUSTOMIZE_OPENED existed in events.js but had
      // zero call sites anywhere (confirmed by audit) — opening this sheet
      // went entirely untracked. Fired here, in the same render-time state
      // adjustment already guarded against re-firing on every render (see
      // this block's own comment above for why a useEffect isn't used).
      // Base product only — no variant has been selected yet at this point.
      tracker.track(EVENTS.CUSTOMIZE_OPENED, buildProductAttributes({ product }));
    }
  }

  const exactVariant = findVariant
    ? findVariant(selectedMetalColorId, selectedKaratId, selectedSizeId)
    : null;

  const hasSizes       = sizes.length > 0;
  const hasMetalColors = metalColors.length > 0;
  const hasKarats      = karats.length > 0;

  const metalOk    = !hasMetalColors || selectedMetalColorId != null;
  const karatOk    = !hasKarats      || selectedKaratId      != null;
  const sizeOk     = !hasSizes       || selectedSizeId       != null;
  const allSelected = metalOk && karatOk && sizeOk;

  // When no exact variant exists but user has selected all options,
  // build a pseudo-variant from base product + selections.
  // This enables Made-to-Order for any valid combination.
  const mtoFallback = useMemo(() => {
    if (exactVariant || !allSelected || !product) return null;
    const karatName      = karats.find((k) => k.id === selectedKaratId)?.name      ?? '';
    const metalColorName = metalColors.find((c) => c.id === selectedMetalColorId)?.name ?? '';
    const sizeName       = sizes.find((s) => s.id === selectedSizeId)?.name        ?? '';
    return {
      ...product,
      item_id:          product.item_id,
      item_code:        product.item_code,
      item_name:        product.item_name,
      karat_id:         selectedKaratId,
      karat_name:       karatName,
      metal_color_id:   selectedMetalColorId,
      metal_color_name: metalColorName,
      item_size_id:     selectedSizeId ?? null,
      item_size_name:   sizeName || null,
      pieces:           0,
      _isMTO:           true,
    };
  }, [exactVariant, allSelected, product, selectedKaratId, selectedMetalColorId, selectedSizeId, karats, metalColors, sizes]);

  // Use exact variant when available, MTO fallback otherwise
  const matchedVariant = exactVariant ?? mtoFallback;
  const canConfirm     = allSelected && !!matchedVariant;

  // Single source of truth for "does the ACTIVE store itself have this
  // matched variant" — matchedVariant.pieces is already patched by
  // useDesignVariants to the active store's own stock count, never a
  // network-wide total, so this is the one condition the badge, the card
  // background, and the store-list copy below all key off — no more each
  // repeating `matchedVariant._isMTO || (matchedVariant.pieces ?? 0) === 0`
  // (or its inverse) slightly differently in three places.
  const matchedVariantInStockHere = !matchedVariant?._isMTO && (matchedVariant?.pieces ?? 0) > 0;

  // ── Live price for the matched variant ────────────────────────────────────
  // Only for a real exact-variant match — the MTO fallback is a pseudo-item
  // with no real item_components[] BOM, so there's nothing for
  // SetSalesItems to price.
  //
  // Priced live REGARDLESS of item_rate. This used to fall back to the
  // stored item_rate whenever it was non-zero; that rate understates the
  // piece by 2-3x because it omits stone value (measured on UAT
  // 2026-08-05), and this price flows into the cart. See
  // catalogService.attachStaticPrice.
  const needsLivePricing = !!exactVariant;
  const {
    data:      livePricing,
    isLoading: pricingLoading,
    isError:   pricingError,
    refetch:   refetchPricing,
  } = useVariantPricing(needsLivePricing ? exactVariant : null);
  // No item_rate fallback: an unpriceable variant shows no price rather than
  // a wrong one. Tax-inclusive (net_amount) — this is a pure preview label,
  // not a cart-facing value (the parent page re-derives its own pricing off
  // `sub_total` once this variant becomes active — see page.jsx), so it can
  // freely match the customer-facing convention used everywhere else on the
  // PDP (2026-09-29).
  const matchedVariantPrice = formatPrice(livePricing?.net_amount);

  // ── Other-store stock list for the currently matched variant ──────────────
  // MTO (no real exact-variant match, or zero stock everywhere) always hides
  // this — there's no store to point to. Recomputes on every selection
  // change, so switching to a different variant updates/hides it live.
  //
  // ALWAYS excludes the active store itself (2026-08-22 fix). storesByItemId
  // is built from the unfiltered stock rows (every company, not just the
  // active one — see useDesignVariants.js), so before this filter, whenever
  // the active store ALSO had stock it would appear in this same list right
  // next to a GREEN "In Stock" badge that already said as much — redundant
  // at best. Worse, when the active store had NONE (the badge reads amber
  // "Made to Order"), the list still rendered as a bare "In stock at X" with
  // nothing to say X wasn't the store the badge was talking about — read as
  // a flat contradiction between the dot/badge and this line, even though
  // both facts were individually correct. Excluding the active store here
  // makes this list mean exactly one thing everywhere it's used: "elsewhere
  // in the network," never "here too" — see the render below for the
  // matching copy.
  const matchedVariantStores = useMemo(() => {
    if (!matchedVariant || matchedVariant._isMTO || matchedVariant.item_id == null) return [];
    const stores = storesByItemId.get(matchedVariant.item_id) ?? [];
    return stores.filter((s) => (s.pieces ?? 0) > 0 && s.company_id !== activeStoreId);
  }, [matchedVariant, storesByItemId, activeStoreId]);

  const getComboStockStatus = useCallback((metalColorId, karatId) => {
    const matching = variants.filter((v) => {
      const matchMetal = metalColorId == null || v.metal_color_id === metalColorId;
      const matchKarat = karatId      == null || v.karat_id       === karatId;
      return matchMetal && matchKarat;
    });
    if (!matching.length) return null; // combo doesn't exist — no dot
    const hasStock = matching.some((v) => (v.pieces ?? 0) > 0);
    return hasStock ? 'in_stock' : 'made_to_order';
  }, [variants]);

  const getSizeStockStatus = useCallback((sizeId) => {
    const matching = variants.filter((v) => {
      const matchMetal = selectedMetalColorId == null || v.metal_color_id === selectedMetalColorId;
      const matchKarat = selectedKaratId      == null || v.karat_id       === selectedKaratId;
      const matchSize  = v.item_size_id === sizeId;
      return matchMetal && matchKarat && matchSize;
    });
    if (!matching.length) return null; // combo doesn't exist — no dot
    const hasStock = matching.some((v) => (v.pieces ?? 0) > 0);
    return hasStock ? 'in_stock' : 'made_to_order';
  }, [variants, selectedMetalColorId, selectedKaratId]);

  const metalKaratValue = (() => {
    const k = karats.find((k) => k.id === selectedKaratId)?.name;
    const c = metalColors.find((c) => c.id === selectedMetalColorId)?.name;
    const parts = [k, c].filter(Boolean);
    return parts.length ? parts.join(' ') : null;
  })();

  const sizeValue = sizes.find((s) => s.id === selectedSizeId)?.name ?? null;

  const handleConfirm = () => {
    // ADDED 2026-09-08 — CUSTOMIZE_CONFIRMED existed in events.js but had
    // zero call sites anywhere (confirmed by audit). needsLivePricing/
    // livePricing here is the SAME gating this sheet's own price display
    // above uses (a real exact-variant match only — the MTO fallback has
    // no real item_components BOM for SetSalesItems to price), so this
    // event's price breakup is only ever populated when it's genuinely
    // available, same as everywhere else on this sheet.
    tracker.track(EVENTS.CUSTOMIZE_CONFIRMED, buildProductAttributes({
      product,
      activeItem: matchedVariant,
      pricedItem: needsLivePricing ? livePricing : null,
      selectedSizeId,
      selectedSizeName: sizeValue,
      hasStock: matchedVariant ? matchedVariantInStockHere : null,
    }));

    onConfirm(matchedVariant);
    onClose();
  };

  const footer = (
    <button
      type="button"
      onClick={handleConfirm}
      disabled={!canConfirm}
      className={[
        'w-full min-h-[52px] rounded-xl font-semibold text-sm',
        'transition-all duration-150 tracking-wide uppercase',
        canConfirm
          ? 'bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98]'
          : 'bg-muted text-muted-foreground cursor-not-allowed opacity-60',
      ].join(' ')}
    >
      {canConfirm
        // Plain "Confirm" (2026-08-23) — used to append the full selection
        // as "Confirm — 14KT · Yellow Gold · Size 6.5 Inch", which is
        // already shown just above in the matched-variant summary card and
        // in the section labels next to each selector; repeating it here
        // was the reason this button overflowed/wrapped in tablet width.
        ? 'Confirm'
        : !metalOk || !karatOk
          ? 'Select a colour and karat to continue'
          : !sizeOk
            ? 'Select a size to continue'
            : 'Select options to continue'
      }
    </button>
  );

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title="Customize"
      footer={footer}
      maxWidth="max-w-lg"
    >
      {isLoading ? (
        <LoadingSkeleton />
      ) : (
        <div className="flex flex-col gap-6">

          {hasMetalColors && hasKarats ? (
            // No "🟢 In Stock" legend below the grid (removed 2026-08-23,
            // along with the "Made to Order" line it originally paired
            // with) — the brand site's own customize UI doesn't caption its
            // dot either, and once there's only one dot meaning left it
            // doesn't need a legend to be self-explanatory.
            <div className="flex flex-col gap-3">
              <SectionLabel
                label="Select Gold Colour & Karat"
                value={metalKaratValue}
              />
              <div className="grid grid-cols-3 gap-3">
                {/* Karat-first ordering: all 14KT options (any colour)
                    together, then all 18KT — not grouped by colour. */}
                {karats.flatMap((karat) =>
                  metalColors.map((color) => {
                    const isSelected =
                      selectedMetalColorId === color.id &&
                      selectedKaratId      === karat.id;
                    const stockStatus = getComboStockStatus(color.id, karat.id);

                    return (
                      <MetalColorCard
                        key={`${karat.id}-${color.id}`}
                        color={color}
                        karat={karat}
                        isSelected={isSelected}
                        stockStatus={stockStatus}
                        onClick={() => {
                          setSelectedMetalColorId(color.id);
                          setSelectedKaratId(karat.id);
                        }}
                      />
                    );
                  })
                )}
              </div>

            </div>
          ) : (
            <>
              {hasMetalColors && (
                <div className="flex flex-col gap-3">
                  <SectionLabel label="Metal Colour" value={metalColors.find((c) => c.id === selectedMetalColorId)?.name} />
                  <div className="flex flex-wrap gap-2">
                    {metalColors.map((color) => (
                      <MetalColorCard
                        key={color.id}
                        color={color}
                        karat={null}
                        isSelected={selectedMetalColorId === color.id}
                        stockStatus={getComboStockStatus(color.id, null)}
                        onClick={() => setSelectedMetalColorId(
                          selectedMetalColorId === color.id ? null : color.id
                        )}
                      />
                    ))}
                  </div>
                </div>
              )}

              {hasKarats && (
                <div className="flex flex-col gap-3">
                  <SectionLabel label="Purity / Karat" value={karats.find((k) => k.id === selectedKaratId)?.name} />
                  <div className="flex flex-wrap gap-2">
                    {karats.map((k) => (
                      <KaratPill
                        key={k.id}
                        karat={k}
                        isSelected={selectedKaratId === k.id}
                        onClick={() => setSelectedKaratId(
                          selectedKaratId === k.id ? null : k.id
                        )}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {(hasMetalColors || hasKarats) && hasSizes && (
            <hr className="border-border" />
          )}

          {hasSizes && (
            <div className="flex flex-col gap-3">
              <SectionLabel
                label={`Select ${product?.type_name ? `${product.type_name} ` : ''}Size`}
                value={sizeValue ? `${sizeValue}` : null}
              />
              <div className="grid grid-cols-5 gap-2">
                {sizes.map((size) => (
                  <SizeChip
                    key={size.id}
                    size={size}
                    isSelected={selectedSizeId === size.id}
                    stockStatus={getSizeStockStatus(size.id)}
                    onClick={() => setSelectedSizeId(
                      selectedSizeId === size.id ? null : size.id
                    )}
                  />
                ))}
              </div>
            </div>
          )}

          {!hasMetalColors && !hasKarats && !hasSizes && (
            <p className="text-sm text-muted-foreground text-center py-8">
              No customization options available for this product.
            </p>
          )}

          {matchedVariant && (
            <div className={[
              'rounded-xl border px-4 py-3',
              matchedVariantInStockHere
                ? 'bg-status-in-stock/10 border-status-in-stock/30'
                : 'bg-status-made-order/10 border-status-made-order/30',
            ].join(' ')}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground leading-snug">
                  {matchedVariant.item_name}
                </p>
                <span className={[
                  'text-[11px] font-semibold px-2 py-0.5 rounded-full text-nowrap',
                  matchedVariantInStockHere
                    ? 'bg-status-in-stock/15 text-status-in-stock'
                    : 'bg-status-made-order/15 text-status-made-order',
                ].join(' ')}>
                  {matchedVariantInStockHere ? 'In Stock' : 'Made to Order'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {matchedVariant._isMTO
                  ? `${matchedVariant.karat_name} · ${matchedVariant.metal_color_name}${matchedVariant.item_size_name ? ` · Size ${matchedVariant.item_size_name}` : ''}`
                  : <>
                      Item Code: {matchedVariant.item_code}
                      {/* The real, scannable per-piece sku — only resolves
                          once useVariantPricing above has actually priced a
                          physical piece for this variant (never for MTO,
                          which has none). item_code alone is what this line
                          used to mislabel "SKU:". */}
                      {livePricing?.sku && <> · SKU: {livePricing.sku}</>}
                      {(matchedVariant.pieces ?? 0) > 0 && ` · ${matchedVariant.pieces} pc${matchedVariant.pieces !== 1 ? 's' : ''}`}
                    </>
                }
              </p>

              {/* Price for this exact variant — MTO has no real SKU to
                  price, so this only ever shows for a real matched variant. */}
              {!matchedVariant._isMTO && (
                needsLivePricing && pricingLoading ? (
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground mt-1.5">
                    <Loader2 size={13} className="animate-spin text-muted-foreground" aria-hidden="true" />
                    Calculating price…
                  </p>
                ) : matchedVariantPrice ? (
                  <p className="text-sm font-semibold text-foreground mt-1.5">{matchedVariantPrice}</p>
                ) : needsLivePricing && pricingError ? (
                  <p className="flex items-center gap-2 text-xs font-medium text-status-made-order mt-1.5">
                    Could not calculate price — try again
                    <button
                      type="button"
                      onClick={() => refetchPricing()}
                      className="font-semibold underline underline-offset-2 hover:text-status-made-order/80"
                    >
                      Retry
                    </button>
                  </p>
                ) : (
                  <p className="text-xs font-medium text-status-made-order mt-1.5">
                    Price not available for this option
                  </p>
                )
              )}

              {/* Other-store availability. matchedVariantStores never
                  includes the active store (filtered in the useMemo above),
                  so it always means "elsewhere in the network" — worded
                  differently depending on whether the badge above already
                  says "In Stock" (this is bonus info: also available
                  elsewhere) or "Made to Order" (this is the contrast: not
                  here, but there — see the useMemo comment for why this
                  distinction matters). */}
              {matchedVariantStores.length > 0 && (
                matchedVariantInStockHere ? (
                  <div className="flex items-start gap-1.5 mt-2 pt-2 border-t border-status-in-stock/30">
                    <Store size={13} className="shrink-0 text-status-in-stock mt-0.5" aria-hidden="true" />
                    <p className="text-xs text-status-in-stock">
                      Also in stock at{' '}
                      <span className="font-medium">
                        {matchedVariantStores.map((s) => s.companyname).join(', ')}
                      </span>
                    </p>
                  </div>
                ) : (
                  <div className="flex items-start gap-1.5 mt-2 pt-2 border-t border-status-made-order/30">
                    <Store size={13} className="shrink-0 text-status-made-order mt-0.5" aria-hidden="true" />
                    <p className="text-xs text-status-made-order">
                      Made to order at {activeStoreName ?? 'this store'} — in stock at{' '}
                      <span className="font-medium">
                        {matchedVariantStores.map((s) => s.companyname).join(', ')}
                      </span>
                    </p>
                  </div>
                )
              )}
            </div>
          )}

        </div>
      )}
    </BottomSheet>
  );
}