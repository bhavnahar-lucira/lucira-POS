'use client';

import { useMemo, useState } from 'react';
import { Store } from 'lucide-react';
import ProductGrid from '@/components/features/catalog/ProductGrid';
import { useCatalogProducts } from '@/hooks/catalog/useCatalogProducts';
import { useLiveCatalogPrices } from '@/hooks/catalog/useLiveCatalogPrices';
import { useCrossStoreStockCodes } from '@/hooks/catalog/useCrossStoreStockCodes';
import { stableSortProducts } from '@/lib/catalogSort';

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
  
  const { priceById, settledIds } = useLiveCatalogPrices(rawProducts, { storeIdOverride: store.company_id });
  
  const stockCheckItemIds = useMemo(
    () => rawProducts.slice(0, STOCK_CHECK_WINDOW).map((p) => p.item_id).filter((id) => id != null),
    [rawProducts]
  );
  const { stockByItemId: liveStockByItemId } = useCrossStoreStockCodes(stockCheckItemIds);
  
  const pricedProducts = rawProducts.map((p) => {
    const price = p.price ?? priceById.get(p.item_id) ?? null;
    const liveStock = liveStockByItemId.get(p.item_id);
    const has_stock = liveStock ? liveStock.storeCodes.includes(store.company_code) : p.has_stock;
    return { ...p, price, is_pricing: price == null && !settledIds.has(p.item_id), has_stock };
  });
  
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
