'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import { deriveSpecFields } from './ProductSpecifications';
import { useProductDetail } from '@/hooks/products/useProductDetail';
import { getStockPieces } from '@/services/inventoryService';
import { priceStockPiecesForSale } from '@/services/pricingService';
import { QUERY_KEYS } from '@/constants/queryKeys';
import APP_CONFIG from '@/constants/appConfig';
import { formatPrice } from '@/lib/priceUtils';

// Every column deriveSpecFields can produce, in display order — "price" is
// the one extra field (per physical piece, from its own priced row, not
// part of deriveSpecFields since that's shared with the single-item PDP
// view which shows price separately via PriceBreakdown). A column only
// renders if at least one row actually has a value for it (see
// visibleColumns below) — most items won't have gemstone fields, for one.
const COLUMN_DEFS = [
  { key: 'sku',            label: 'SKU' },
  { key: 'price',          label: 'Price' },
  { key: 'metalPurity',    label: 'Purity' },
  { key: 'metalColor',     label: 'Metal Color' },
  { key: 'metalType',      label: 'Metal Type' },
  { key: 'netWeight',      label: 'Net Wt' },
  { key: 'grossWeight',    label: 'Gross Wt' },
  { key: 'height',         label: 'Height' },
  { key: 'width',          label: 'Width' },
  { key: 'length',         label: 'Length' },
  { key: 'depth',          label: 'Depth' },
  { key: 'stoneWeight',    label: 'Stone Wt' },
  { key: 'diamondWeight',  label: 'Diamond Wt' },
  { key: 'pointerCt',      label: 'Diamond (ct)' },
  { key: 'diamondPieces',  label: 'Diamond Qty' },
  { key: 'diamondCarats',  label: 'Diamond Carat' },
  { key: 'diamondShape',   label: 'Diamond Shape' },
  { key: 'diamondQuality', label: 'Diamond Quality' },
  { key: 'stonePieces',    label: 'Stone Pieces' },
  { key: 'otherPieces',    label: 'Other Pieces' },
  { key: 'otherWeight',    label: 'Other Weight' },
  { key: 'gemstoneType',   label: 'Gemstone Type' },
  { key: 'gemstoneName',   label: 'Gemstone' },
  { key: 'gemstoneShape',  label: 'Gemstone Shape' },
  { key: 'gemstoneColor',  label: 'Gemstone Colour' },
  { key: 'gemstoneSize',   label: 'Gemstone Size' },
  { key: 'gemstonePieces', label: 'Gemstone Qty' },
  { key: 'gemstoneWeight', label: 'Gemstone Wt' },
  { key: 'itemGroup',      label: 'Item Group' },
  { key: 'category',       label: 'Category' },
  { key: 'subCategory',    label: 'Sub-Category' },
  { key: 'collection',     label: 'Collection' },
  { key: 'brand',          label: 'Brand' },
  { key: 'hsn',            label: 'HSN Code' },
  { key: 'itemCode',       label: 'Item Code' },
];

/**
 * One row per PHYSICAL piece this store actually has, every spec column
 * that applies — only ever mounted once an operator taps a specific store
 * row (see CrossStoreStockPanel), so nothing here fetches before that tap.
 *
 * Reuses the existing stock+pricing pipeline unmodified: getStockPieces for
 * the real rows, priceStockPiecesForSale (already batch-capable — the same
 * call cart/checkout use for N units) to price all of them in ONE round
 * trip, and ProductSpecifications' own deriveSpecFields so every column's
 * value is derived identically to the single-item PDP view, not
 * reimplemented here.
 *
 * @param {{ isOpen: boolean, onClose: () => void, itemId: number,
 *   companyId: number, companyName: string }} props
 */
export default function StoreProductDetailSheet({ isOpen, onClose, itemId, companyId, companyName }) {
  const { data: product, isLoading: productLoading } = useProductDetail(itemId);

  const { data: pieces, isLoading: piecesLoading, isError } = useQuery({
    queryKey: QUERY_KEYS.ITEMS.STORE_PIECES(itemId, companyId),
    queryFn: async () => {
      const response = await getStockPieces({ itemId, companyId, take: 50 });
      const rows = (response?.data?.Entities ?? []).filter((r) => !r.is_allocated);
      if (!rows.length) return [];
      return priceStockPiecesForSale(rows, APP_CONFIG.DOCUMENT_TYPES.POS_INVOICE);
    },
    enabled:   !!itemId && !!companyId,
    staleTime: APP_CONFIG.STALE_TIME.STOCK,
  });

  const isLoading = productLoading || piecesLoading;

  const rows = (product && pieces)
    ? pieces.map((piece) => ({
        ...deriveSpecFields({ product, pricedItem: piece }),
        price: piece.net_amount > 0 ? formatPrice(piece.net_amount) : null,
      }))
    : [];
  const visibleColumns = COLUMN_DEFS.filter((col) => rows.some((r) => r[col.key] != null));

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>{companyName}</SheetTitle>
          <SheetDescription>
            {!isLoading && !isError && `${rows.length} piece${rows.length === 1 ? '' : 's'} available`}
          </SheetDescription>
        </SheetHeader>

        {isLoading && (
          <div className="flex flex-col gap-3 px-4 pb-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        )}

        {!isLoading && isError && (
          <p className="px-4 pb-4 text-sm text-status-made-order">
            Couldn&apos;t load pieces for this store.
          </p>
        )}

        {!isLoading && !isError && rows.length === 0 && (
          <p className="px-4 pb-4 text-sm text-muted-foreground">
            No pieces currently available at this store.
          </p>
        )}

        {!isLoading && !isError && rows.length > 0 && (
          <div className="px-4 pb-4">
            <Table>
              <TableHeader>
                <TableRow>
                  {visibleColumns.map((col) => (
                    <TableHead key={col.key}>{col.label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, i) => (
                  <TableRow key={row.sku ?? i}>
                    {visibleColumns.map((col) => (
                      <TableCell key={col.key}>{row[col.key] ?? '—'}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
