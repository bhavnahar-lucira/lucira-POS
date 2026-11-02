'use client';

import { useQuery } from '@tanstack/react-query';
import { flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
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
import { formatPrice, formatAmountOrNull } from '@/lib/priceUtils';

// Every row deriveSpecFields can produce, in display order — the price
// breakup fields are the extra ones (per physical piece, from its own
// priced row, not part of deriveSpecFields since that's shared with the
// single-item PDP view, which shows price separately via PriceBreakdown —
// same field names/grouping as that component, so the two stay consistent).
// A row only renders if at least one piece actually has a value for it (see
// visibleRows below) — most items won't have gemstone fields, for one.
//
// TRANSPOSED layout (rows = attributes, columns = pieces) — reported
// directly (2026-10-12): the original piece-per-row/spec-per-column table
// needed heavy horizontal scrolling to read a single piece's full spec
// (34+ possible columns). Flipping the axes means each attribute reads
// top-to-bottom in one place, and horizontal scroll only ever applies
// across PIECES (typically a handful), not across every possible spec.
const ROW_DEFS = [
  // 'sku' deliberately not a row — it's already each piece's own column
  // header below.
  { key: 'metalAmount',     label: 'Metal Amount' },
  { key: 'diamondAmount',   label: 'Diamond Amount' },
  { key: 'stoneAmount',     label: 'Stone Amount' },
  { key: 'colorStoneAmount', label: 'Colour Stone Amount' },
  { key: 'otherAmount',     label: 'Other Amount' },
  { key: 'makingCharges',   label: 'Making Charges' },
  { key: 'subtotal',        label: 'Subtotal' },
  { key: 'taxableAmount',   label: 'Taxable Amount' },
  { key: 'taxAmount',       label: 'Tax (GST)' },
  { key: 'price',           label: 'Total Price' },
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
        // Material segments: only shown when actually present on this piece
        // (most pieces won't have every component) — same >0 gating
        // PriceBreakdown itself uses for these same fields.
        metalAmount:      piece.metal_amount > 0       ? formatAmountOrNull(piece.metal_amount)       : null,
        diamondAmount:    piece.diamond_amount > 0      ? formatAmountOrNull(piece.diamond_amount)      : null,
        stoneAmount:       piece.stone_amount > 0        ? formatAmountOrNull(piece.stone_amount)        : null,
        colorStoneAmount: piece.color_stone_amount > 0  ? formatAmountOrNull(piece.color_stone_amount)  : null,
        otherAmount:       piece.other_amount > 0        ? formatAmountOrNull(piece.other_amount)        : null,
        makingCharges:     piece.item_labour > 0         ? formatAmountOrNull(piece.item_labour)         : null,
        // Running totals: always shown once a piece is priced at all, same
        // as PriceBreakdown's own Subtotal/Taxable/Tax segments.
        subtotal:      formatAmountOrNull(piece.sub_total),
        taxableAmount: formatAmountOrNull(piece.taxable_amount),
        taxAmount:     formatAmountOrNull(piece.tax_amount),
        price: piece.net_amount > 0 ? formatPrice(piece.net_amount) : null,
      }))
    : [];
  const visibleRows = ROW_DEFS.filter((def) => rows.some((r) => r[def.key] != null));

  const columns = [
    { id: 'spec', header: 'Spec', accessorFn: (def) => def.label },
    ...rows.map((row, i) => ({
      id: `piece-${i}`,
      header: row.sku ?? `Piece ${i + 1}`,
      accessorFn: (def) => row[def.key] ?? '—',
    })),
  ];
  const table = useReactTable({
    data: visibleRows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (def) => def.key,
  });

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
                {table.getHeaderGroups().map((group) => (
                  <TableRow key={group.id}>
                    {group.headers.map((header) => (
                      <TableHead key={header.id} className={header.column.id === 'spec' ? 'sticky left-0 z-10 bg-background' : undefined}>
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className={cell.column.id === 'spec' ? 'sticky left-0 z-10 bg-background font-semibold text-muted-foreground' : undefined}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
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
