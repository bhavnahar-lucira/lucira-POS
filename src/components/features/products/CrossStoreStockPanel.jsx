'use client';

// Collapsible panel showing stock availability across all stores, with the
// active store's row highlighted. Rendered above Add to Cart so the user
// sees availability before purchasing. Data: useStockByStores, one
// { company_id, companyname, pieces } entry per store.

import { Store } from 'lucide-react';
import { useSelector } from 'react-redux';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Accordion, AccordionItem, AccordionTrigger, AccordionContent,
} from '@/components/ui/accordion';
import { deriveStockStatus } from '@/components/shared/StockStatusBadge';

const selectActiveStoreId = (state) => state.store.activeStoreId;

// Reuses StockStatusBadge's shared in-stock/out-of-stock derivation (binary
// only, no "low stock" tier) instead of re-implementing it locally.

const STATUS_TEXT_CLASSES = {
  out_stock: 'text-status-error',
  in_stock:  'text-status-in-stock',
};

function StockQty({ qty }) {
  const n = parseFloat(qty ?? 0);
  const status = deriveStockStatus({ stock_qty: qty }) ?? 'out_stock';
  const label = status === 'out_stock' ? 'Out of Stock' : `${n} in stock`;

  return (
    <span className={`flex shrink-0 items-center gap-1.5 text-xs font-semibold text-nowrap ${STATUS_TEXT_CLASSES[status]}`}>
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
          status === 'out_stock' ? 'bg-status-error' : 'bg-status-in-stock'
        }`}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}

/**
 * @param {{
 *   storeStocks: { company_id: number, companyname: string, pieces: number }[],
 *   isLoading:   boolean,
 *   isError:     boolean,
 *   onRetry:     () => void,
 *   collapsible?: boolean,
 * }} props
 *   collapsible (default true) - the product detail page's own standalone
 *   panel, with its own header + expand/collapse. false renders just the
 *   list content with no header/accordion of its own — for reuse inside
 *   CartItemRow's cart/checkout line items, which already have their OWN
 *   "View/Hide Stock Across Stores" toggle (same pattern as the price
 *   breakdown toggle there); nesting this panel's own accordion inside that
 *   would mean two clicks to see one thing.
 */
export default function CrossStoreStockPanel({
  storeStocks = [], isLoading, isError = false, onRetry, collapsible = true,
}) {
  const activeStoreId = useSelector(selectActiveStoreId);

  const storesInStock = storeStocks.filter((s) => parseFloat(s.pieces) > 0).length;
  const totalStores   = storeStocks.length;

  const content = (
    <>
      {isLoading && (
        <div className="flex flex-col divide-y divide-border">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center justify-between px-4 py-3 gap-2">
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
      )}

      {/* storeStocks is [] for both a failed fetch and genuinely no
          data — isError must be checked explicitly. */}
      {!isLoading && isError && (
        <div className="flex flex-col items-center gap-2 px-4 py-4 text-center">
          <p className="text-sm text-status-made-order">
            Couldn&apos;t check stock across stores.
          </p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="text-xs font-semibold text-status-made-order underline underline-offset-2 hover:text-status-made-order/80"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {!isLoading && !isError && storeStocks.length === 0 && (
        <p className="px-4 py-4 text-sm text-muted-foreground text-center">
          No stock information available.
        </p>
      )}

      {!isLoading && !isError && storeStocks.length > 0 && (
        <div className="flex flex-col divide-y divide-border">
          {storeStocks.map((store) => {
            const isActive = store.company_id === activeStoreId;
            return (
              <div
                key={store.company_id}
                className={`
                  flex items-center justify-between gap-3 px-4 py-3
                  ${isActive ? 'bg-accent/5' : 'bg-card'}
                `}
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                      isActive ? 'bg-accent/15 text-accent' : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    <Store size={13} aria-hidden="true" />
                  </span>
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-medium text-foreground">
                      {store.companyname}
                    </span>
                    {isActive && (
                      <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                        Current
                      </span>
                    )}
                  </div>
                </div>
                <StockQty qty={store.pieces} />
              </div>
            );
          })}
        </div>
      )}
    </>
  );

  if (!collapsible) {
    return (
      <div className="rounded-xl border border-border overflow-hidden shadow-sm">
        {!isLoading && totalStores > 0 && (
          <div className="flex items-center justify-between px-4 py-2.5 bg-muted/40 border-b border-border">
            <span className="text-xs font-semibold text-foreground">Stock Across Stores</span>
            <span className="rounded-full bg-status-in-stock/10 px-2 py-0.5 text-[11px] font-semibold text-status-in-stock">
              {storesInStock} of {totalStores} in stock
            </span>
          </div>
        )}
        {content}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border overflow-hidden shadow-sm">
      <Accordion type="single" collapsible defaultValue="">
        <AccordionItem value="stock" className="border-0">
          <AccordionTrigger
            className="rounded-none px-4 py-3.5 bg-card hover:bg-muted/60 hover:no-underline focus-visible:ring-inset focus-visible:ring-ring"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
                <Store size={16} aria-hidden="true" />
              </span>
              <div className="flex flex-col items-start gap-0.5">
                <span className="text-sm font-semibold text-foreground">
                  Stock Across Stores
                </span>
                {!isLoading && totalStores > 0 && (
                  <span className="rounded-full bg-status-in-stock/10 px-2 py-0.5 text-[11px] font-semibold text-status-in-stock">
                    {storesInStock} of {totalStores} in stock
                  </span>
                )}
              </div>
            </div>
          </AccordionTrigger>

          <AccordionContent className="border-t border-border p-0">
            {content}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
