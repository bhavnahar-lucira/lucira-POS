'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { getStockPieceBySku, createItemEnquiry } from '@/services/inventoryService';
import { getStoreReadyToInvoiceLines } from '@/services/orderFulfillmentService';
import tracker from '@/lib/analytics/tracker';
import EVENTS from '@/lib/analytics/events';

/**
 * @param {{ storeId: number|null, partyId?: number|null }} params
 * @returns {{ handleBarcodeDetected: (code: string) => Promise<void> }}
 */
export function useBarcodeLookup({ storeId, partyId = null }) {
  const router = useRouter();

  const handleBarcodeDetected = useCallback(async (code) => {
    const trimmed = code.trim();
    if (!trimmed) return;

    try {
      const skuResponse = await getStockPieceBySku({ sku: trimmed, companyId: storeId });
      const skuMatch = skuResponse.data?.Entities?.[0];
      if (skuMatch?.item_id) {
        tracker.track(EVENTS.BARCODE_SCANNED, { code: trimmed, itemId: skuMatch.item_id });
        createItemEnquiry({
          itemId:          skuMatch.item_id,
          itemAttributeId: skuMatch.item_attribute_id,
          companyId:       skuMatch.company_id ?? storeId,
          itemLineNo:      skuMatch.item_line_no,
          sku:             skuMatch.sku,
          partyId,
          image:           skuMatch.image,
        }).catch((err) => {
          console.warn('[BarcodeScanner] item enquiry log failed (non-blocking)', { sku: trimmed, err });
        });

        // A reserved piece belongs to a customer's order — point staff at that order instead of a fresh sale.
        if (skuMatch.is_allocated) {
          const ready = await getStoreReadyToInvoiceLines({ companyId: skuMatch.company_id ?? storeId }).catch(() => []);
          const line = ready.find((l) => l.sku && l.sku === skuMatch.sku);
          toast.warning(
            line
              ? `${skuMatch.sku} is reserved for order ${line.document_no} (${line.party_name ?? 'customer'}).`
              : `${skuMatch.sku} is reserved for a customer order and can't be sold separately.`,
            {
              duration: 15000,
              ...(line && { action: { label: 'Bill that order', onClick: () => router.push(`/orders?order=${encodeURIComponent(line.document_no)}`) } }),
              cancel: { label: 'View product', onClick: () => router.push(`/products/${skuMatch.item_id}`) },
            },
          );
          return;
        }

        router.push(`/products/${skuMatch.item_id}`);
        return;
      }

      tracker.track(EVENTS.BARCODE_SCAN_FAILED, { code: trimmed });
      toast.error(`No product found for scanned code "${trimmed}".`);
    } catch (err) {
      console.error('[BarcodeScanner] sku lookup request failed', { sku: trimmed, err });
      tracker.track(EVENTS.BARCODE_SCAN_FAILED, { code: trimmed });
      toast.error('Could not look up the scanned barcode. Please try again.');
    }
  }, [storeId, partyId, router]);

  return { handleBarcodeDetected };
}
