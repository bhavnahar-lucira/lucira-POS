'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-toastify';
import { getStockPieceBySku, createItemEnquiry } from '@/services/inventoryService';
import tracker from '@/lib/analytics/tracker';
import EVENTS from '@/lib/analytics/events';

/**
 * @param {{ storeId: number|null }} params
 * @returns {{ handleBarcodeDetected: (code: string) => Promise<void> }}
 */
export function useBarcodeLookup({ storeId }) {
  const router = useRouter();

  const handleBarcodeDetected = useCallback(async (code) => {
    const trimmed = code.trim();
    if (!trimmed) return;

    try {
      const skuResponse = await getStockPieceBySku({ sku: trimmed, companyId: storeId });
      const skuMatch = skuResponse.data?.Entities?.[0];

      // Navigates on whatever skuMatch this call returns, with no further
      // client-side gate — this used to ALSO require
      // skuMatch.company_id === storeId before navigating, a redundant
      // check that could only ever fail spuriously (getStockPieceBySku is
      // already scoped to `storeId` server-side; a match it returns can't
      // carry a different company_id). NOT a cross-store lookup — confirmed
      // live 2026-09-30 side-by-side with OrnaVerse's own POS counter's own
      // "SKU / Barcode" field: scanning a real, confirmed-existing sku
      // while a DIFFERENT store than the one holding it was active returned
      // zero rows on OrnaVerse's own client too (identical request shape,
      // no company_id sent — their server scopes by session state instead).
      // A scan only ever finds a piece at the CURRENTLY ACTIVE store, same
      // as real OrnaVerse — "not found" for a piece elsewhere is correct,
      // not a bug.
      if (skuMatch?.item_id) {
        tracker.track(EVENTS.BARCODE_SCANNED, { code: trimmed, itemId: skuMatch.item_id });

        // Best-effort, fire-and-forget logging (mirrors OrnaVerse's own POS) —
        // must never block or fail the actual navigation below.
        createItemEnquiry({
          itemId:          skuMatch.item_id,
          itemAttributeId: skuMatch.item_attribute_id,
          companyId:       skuMatch.company_id ?? storeId,
          itemLineNo:      skuMatch.item_line_no,
          sku:             skuMatch.sku,
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
  }, [storeId, router]);

  return { handleBarcodeDetected };
}
