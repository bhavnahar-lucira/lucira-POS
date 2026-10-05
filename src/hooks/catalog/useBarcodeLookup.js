'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { getStockPieceBySku, createItemEnquiry } from '@/services/inventoryService';
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
