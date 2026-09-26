'use client';

// One "other store" lane, rendered below the primary catalog grid once the
// selected store's own products run out (see catalog/page.jsx's OTHER
// STORES section). Add to Cart on these stays a normal add — no
// store-switch prompt — same as the Cross-Store Stock panel elsewhere.
//
// Runs its own useCatalogProducts/useLiveCatalogPrices pair scoped to
// exactly one store: pagination, live pricing, and the stock badge must
// all reflect THIS store, never the operator's active store. Renders
// nothing while loading or once loaded with no matches, so an empty store
// doesn't leave a bare heading on the page.

import { useMemo, useState } from 'react';
import { Store } from 'lucide-react';
import ProductGrid from '@/components/features/catalog/ProductGrid';
import { useCatalogProducts } from '@/hooks/catalog/useCatalogProducts';
import { useLiveCatalogPrices } from '@/hooks/catalog/useLiveCatalogPrices';
import { useCrossStoreStockCodes } from '@/hooks/catalog/useCrossStoreStockCodes';
import { stableSortProducts } from '@/lib/catalogSort';

// Same fix, same reasoning as catalog/page.jsx's own STOCK_CHECK_WINDOW —
// has_stock here is just as stale a snapshot as the main grid's was.
const STOCK_CHECK_WINDOW = 300;

/**
 * @param {{
 *   store: { company_id: number, mailing_name: string, company_code?: string },
 *   showOutOfStock: boolean,
 *   categoryId: number|null,
 *   sortBy: string,
 * }} props
 */
export default function OtherStoreSection({ store, showOutOfStock, categoryId, sortBy }) {
  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useCatalogProducts({
    storeId:           store.company_id,
    show_out_of_stock: showOutOfStock,
    ...(categoryId && { type_ids: [categoryId] }),
  });

  const rawProducts = data?.products ?? [];

  // Same store this whole section is scoped to, never the operator's active store.
  const { priceById, settledIds } = useLiveCatalogPrices(rawProducts, { storeIdOverride: store.company_id });

  // Live has_stock re-check — same bug/fix as catalog/page.jsx: this
  // section's own rawProducts come from the exact same 24h-cached
  // useCatalogProducts snapshot, so it's just as capable of showing a
  // sold-out item as "in stock" until the cache naturally expires.
  const stockCheckItemIds = useMemo(
    () => rawProducts.slice(0, STOCK_CHECK_WINDOW).map((p) => p.item_id).filter((id) => id != null),
    [rawProducts]
  );
  const { stockByItemId: liveStockByItemId } = useCrossStoreStockCodes(stockCheckItemIds);

  // stableSortProducts keeps already-rendered rows frozen in place and only
  // sorts/appends genuinely new ones, so a fetchNextPage()/price-settle
  // tick doesn't reshuffle cards the operator is already scrolling past
  // (see catalog/page.jsx's sortedDisplayProducts for the same idiom).
  const pricedProducts = rawProducts.map((p) => {
    const price = p.price ?? priceById.get(p.item_id) ?? null;
    // Scoped to THIS section's own store (store.company_code), not an OR
    // across every store the operator can access — see catalog/page.jsx's
    // own comment on why liveStock.hasStock alone would be wrong here.
    const liveStock = liveStockByItemId.get(p.item_id);
    const has_stock = liveStock ? liveStock.storeCodes.includes(store.company_code) : p.has_stock;
    return { ...p, price, is_pricing: price == null && !settledIds.has(p.item_id), has_stock };
  });

  // Same fix as catalog/page.jsx's own visibleDisplayProducts: OrnaVerse's
  // has_stock (what show_out_of_stock filters on) appears to mark a
  // zero-piece-but-orderable ("Made to Order") item as true regardless, so
  // enforce the toggle again here against the live, pieces-based has_stock
  // once it resolves.
  const visibleProducts = showOutOfStock
    ? pricedProducts
    : pricedProducts.filter((p) => p.has_stock === true);

  const sortResetKey = `${sortBy}|${store.company_id}|${categoryId ?? ''}|${showOutOfStock}`;
  const pricedSignature = visibleProducts.map((p) => `${p.item_id}:${p.price ?? ''}:${p.has_stock}`).join('|');

  const [stableSort, setStableSort] = useState({ key: sortResetKey, signature: null, order: [] });

  let products = stableSort.order;
  if (stableSort.signature !== pricedSignature || stableSort.key !== sortResetKey) {
    const baseOrder = stableSort.key !== sortResetKey ? [] : stableSort.order;
    products = stableSortProducts(baseOrder, visibleProducts, sortBy);
    setStableSort({ key: sortResetKey, signature: pricedSignature, order: products });
  }

  // Loading its first page: render nothing rather than a second skeleton
  // stacked under the primary grid's own — the section only earns a heading
  // once it actually has something to show.
  if (isLoading) return null;
  if (products.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2 border-t border-border pt-4 text-sm font-bold text-foreground">
        <Store size={15} className="text-muted-foreground shrink-0" aria-hidden="true" />
        {store.mailing_name}
        {store.company_code && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
            {store.company_code}
          </span>
        )}
      </div>

      <ProductGrid
        products={products}
        isLoading={false}
        isFetchingMore={isFetchingNextPage}
        hasMore={!!hasNextPage}
        hasFilters={false}
        showStockBadge
        storeCode={store.company_code}
        onLoadMore={fetchNextPage}
        prioritizeFirstRow={false}
      />
    </section>
  );
}
