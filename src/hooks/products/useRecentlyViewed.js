import { useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { addRecentlyViewedItem, selectRecentlyViewedItems } from '@/store/slices/recentlyViewedSlice';
import { useCustomerSession } from '@/hooks/customer/useCustomerSession';
import { deriveKaratCode } from '@/lib/karat';

/**
 * @param {object|null} product - the Items/Retrieve entity from useProductDetail
 * @param {'in_stock'|'out_stock'|'error'|null} stockStatus - the product
 *   page's raw three-state stock verdict (not product.pieces, which is
 *   unscoped to any store — see useDesignVariants.js). Must stay a raw
 *   verdict rather than a boolean computed at the call site: 'error' and
 *   the loading `null` state both need to defer recording rather than be
 *   treated as a confirmed "out of stock".
 */
export function useRecordProductView(product, stockStatus) {
  const dispatch = useDispatch();
  const { isAttached } = useCustomerSession();
  const recordedItemIdRef = useRef(null);

  useEffect(() => {
    if (!isAttached || !product?.item_id) return;
    if (recordedItemIdRef.current === product.item_id) return;
    if (stockStatus !== 'in_stock' && stockStatus !== 'out_stock') return; // still loading or errored — wait for a real verdict
    recordedItemIdRef.current = product.item_id;

    dispatch(addRecentlyViewedItem({
      item_id:    product.item_id,
      item_code:  product.item_code ?? null,
      item_name:  product.item_name ?? null,
      image:      product.image     ?? null,
      image_url:  product.image_url ?? null,
      image_1:    product.image_1   ?? null,
      metal_id:   product.metal_id  ?? null,
      karat_code: deriveKaratCode(product.karat_name),
      karat_id:       product.karat_id       ?? null,
      type_id:        product.type_id        ?? null,
      sub_type_id:    product.sub_type_id    ?? null,
      item_group_id:  product.item_group_id  ?? null,
      // Items/Retrieve only has the full metal-color name, not a short code.
      metal_color_code: product.metal_color_code ?? null,
      metal_color_name: product.metal_color_name ?? null,
      has_stock:  stockStatus === 'in_stock',
      net_weight: product.net_weight ?? null,
      weight:     product.weight     ?? null,
      style_id:   product.style_id   ?? null,
    }));
  }, [isAttached, product, stockStatus, dispatch]);
}

export function useRecentlyViewedItems(excludeItemId = null) {
  const items = useSelector(selectRecentlyViewedItems);
  return excludeItemId != null
    ? items.filter((i) => i.item_id !== excludeItemId)
    : items;
}
