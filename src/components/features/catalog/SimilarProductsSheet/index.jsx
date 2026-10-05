'use client';

import ProductCard from '@/components/features/catalog/ProductCard';
import BottomSheet from '@/components/shared/BottomSheet';
import EmptyState from '@/components/shared/EmptyState';
import { PackageSearch } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useLiveCatalogPrices } from '@/hooks/catalog/useLiveCatalogPrices';
import { useCrossStoreStockCodes } from '@/hooks/catalog/useCrossStoreStockCodes';

function SimilarProductsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="aspect-square w-full rounded-2xl" />
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

/**
 * @param {{
 *   isOpen: boolean,
 *   onClose: () => void,
 *   items: object[],
 *   isLoading?: boolean,
 * }} props
 */
export default function SimilarProductsSheet({ isOpen, onClose, items, isLoading = false }) {
  const effectiveItems = isOpen ? items : [];

  const { priceById, settledIds } = useLiveCatalogPrices(effectiveItems);
  const itemIds = effectiveItems.map((i) => i.item_id);
  const { stockByItemId, isLoading: stockLoading } = useCrossStoreStockCodes(itemIds);

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Similar Products" alwaysBottom>
      {isLoading && items.length === 0 ? (
        <SimilarProductsSkeleton />
      ) : items.length === 0 ? (
        <EmptyState
          icon={PackageSearch}
          title="No similar products found"
          description="This item doesn't have a close match in the current catalog."
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {items.map((item) => {
            const price = priceById.get(item.item_id) ?? null;
            const isPricing = price == null && !settledIds.has(item.item_id);
            return (
              <ProductCard
                key={item.item_id}
                product={{ ...item, price, is_pricing: isPricing }}
                showStockBadge={!stockLoading}
                realStock={stockByItemId.get(item.item_id) ?? null}
                showSimilarIcon={false}
                similarProductsSurface="sheet"
              />
            );
          })}
        </div>
      )}
    </BottomSheet>
  );
}
