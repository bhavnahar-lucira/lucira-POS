'use client';

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
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      const source = selectedVariant ?? product;
      setSelectedMetalColorId(source?.metal_color_id ?? null);
      setSelectedKaratId(source?.karat_id             ?? null);
      setSelectedSizeId(source?.item_size_id          ?? null);
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
  const matchedVariantInStockHere = !matchedVariant?._isMTO && (matchedVariant?.pieces ?? 0) > 0;

  // ── Live price for the matched variant ────────────────────────────────────
  const needsLivePricing = !!exactVariant;
  const {
    data:      livePricing,
    isLoading: pricingLoading,
    isError:   pricingError,
    refetch:   refetchPricing,
  } = useVariantPricing(needsLivePricing ? exactVariant : null);
  const matchedVariantPrice = formatPrice(livePricing?.net_amount);

  // ── Other-store stock list for the currently matched variant ──────────────
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
            <div className="flex flex-col gap-3">
              <SectionLabel
                label="Select Gold Colour & Karat"
                value={metalKaratValue}
              />
              <div className="grid grid-cols-3 gap-3">
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
                      {livePricing?.sku && <> · SKU: {livePricing.sku}</>}
                      {(matchedVariant.pieces ?? 0) > 0 && ` · ${matchedVariant.pieces} pc${matchedVariant.pieces !== 1 ? 's' : ''}`}
                    </>
                }
              </p>

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