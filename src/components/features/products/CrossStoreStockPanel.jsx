'use client';

import { useState } from 'react';
import { Store, ChevronRight } from 'lucide-react';
import { useSelector } from 'react-redux';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Accordion, AccordionItem, AccordionTrigger, AccordionContent,
} from '@/components/ui/accordion';
import { deriveStockStatus } from '@/components/shared/StockStatusBadge';
import StoreProductDetailSheet from './StoreProductDetailSheet';

const selectActiveStoreId = (state) => state.store.activeStoreId;

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
 *   itemId?:     number, — tapping a store row opens its full spec/price
 *     detail sheet; omit to disable tapping (row stays a plain display row).
 * }} props
 */
export default function CrossStoreStockPanel({
  storeStocks = [], isLoading, isError = false, onRetry, collapsible = true, itemId,
}) {
  const activeStoreId = useSelector(selectActiveStoreId);
  const [selectedStore, setSelectedStore] = useState(null);

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
            const tappable = !!itemId;
            return (
              <button
                key={store.company_id}
                type="button"
                disabled={!tappable}
                onClick={() => setSelectedStore(store)}
                className={`
                  flex items-center justify-between gap-3 px-4 py-3 text-left w-full
                  ${isActive ? 'bg-accent/5' : 'bg-card'}
                  ${tappable ? 'hover:bg-muted/60 cursor-pointer' : 'cursor-default'}
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
                <div className="flex shrink-0 items-center gap-1.5">
                  <StockQty qty={store.pieces} />
                  {tappable && <ChevronRight size={14} className="text-muted-foreground" aria-hidden="true" />}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </>
  );

  // Only mounts (and so only fetches) once a store row is actually tapped —
  // see StoreProductDetailSheet's own header for why nothing hits the API
  // before that.
  const sheet = selectedStore && (
    <StoreProductDetailSheet
      isOpen
      onClose={() => setSelectedStore(null)}
      itemId={itemId}
      companyId={selectedStore.company_id}
      companyName={selectedStore.companyname}
    />
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
        {sheet}
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
      {sheet}
    </div>
  );
}
