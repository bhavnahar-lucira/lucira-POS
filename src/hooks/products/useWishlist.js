// Two hooks:
//   useIsWishlisted(itemId, itemSizeId?) — O(1) read for a single
//   ProductCard, backed by wishlistSlice's memoized Set selector.
//   useToggleWishlist() — the function ProductCard's heart button calls on
//   tap. Requires a customer to be attached (no party_id otherwise).
//   Dispatches the local add/remove immediately for zero perceived latency;
//   the actual Mongo write happens in store/wishlistMiddleware.js. Also
//   patches the customer profile page's react-query cache
//   (useCustomerWishlist's QUERY_KEYS.CUSTOMERS.WISHLIST(customerId) entry)
//   in the same tick so a removed item doesn't linger in the profile's
//   Wishlist tab until that query's own staleTime elapses. Toasts on
//   add/remove to match the cart add/remove convention.

import { useDispatch, useSelector } from 'react-redux';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  addWishlistItemLocal,
  removeWishlistItemLocal,
  selectWishlistedItemIds,
  wishlistKey,
} from '@/store/slices/wishlistSlice';
import { useCustomerSession } from '@/hooks/customer/useCustomerSession';
import { QUERY_KEYS } from '@/constants/queryKeys';
import TOAST from '@/constants/toastMessages';

// A heart's filled/outline state must match the exact (item_id, size)
// combination on screen, not just item_id — see wishlistSlice's wishlistKey.
export function useIsWishlisted(itemId, itemSizeId = null) {
  const wishlistedIds = useSelector(selectWishlistedItemIds);
  return itemId != null && wishlistedIds.has(wishlistKey(itemId, itemSizeId));
}

export function useToggleWishlist() {
  const dispatch = useDispatch();
  const queryClient = useQueryClient();
  const wishlistedIds = useSelector(selectWishlistedItemIds);
  const { isAttached, customerId } = useCustomerSession();

  /**
   * @param {object} product - whatever ProductCard already has in hand
   *   (item_id, item_code, item_name, image/image_url/image_1, metal_id,
   *   karat_code, has_stock, net_weight, weight, style_id)
   */
  return function toggleWishlist(product) {
    if (!product?.item_id) return;

    if (!isAttached) {
      toast.info('Assign a customer to save items to their wishlist');
      return;
    }

    // useCustomerWishlist keys its query off Number(partyId) — match exactly.
    const wishlistQueryKey = QUERY_KEYS.CUSTOMERS.WISHLIST(Number(customerId));

    const sizeId = product.item_size_id ?? null;

    if (wishlistedIds.has(wishlistKey(product.item_id, sizeId))) {
      dispatch(removeWishlistItemLocal({ item_id: product.item_id, item_size_id: sizeId }));
      queryClient.setQueryData(wishlistQueryKey, (old) => (
        Array.isArray(old)
          ? old.filter((i) => !(i.item_id === product.item_id && (i.item_size_id ?? null) === sizeId))
          : old
      ));
      toast.success(TOAST.WISHLIST.ITEM_REMOVED(product.item_name ?? 'Item'));
    } else {
      const item = {
        item_id:    product.item_id,
        item_code:  product.item_code  ?? null,
        item_name:  product.item_name  ?? null,
        image:      product.image      ?? null,
        image_url:  product.image_url  ?? null,
        image_1:    product.image_1    ?? null,
        metal_id:   product.metal_id   ?? null,
        karat_code: product.karat_code ?? null,
        // karat_id/type_id/sub_type_id/item_group_id — FIXED: without these,
        // useSimilarProducts' tiering (see its own header) always came back
        // empty for a wishlisted card, since it scores/buckets against these
        // exact fields and none of them were ever saved. The icon showed
        // (default showSimilarIcon) but "View Similar" always opened to
        // nothing. Carried through the same way metal_id already was —
        // ProductCard/PDP already have these in hand at wishlist-time.
        karat_id:       product.karat_id       ?? null,
        type_id:        product.type_id        ?? null,
        sub_type_id:    product.sub_type_id    ?? null,
        item_group_id:  product.item_group_id  ?? null,
        // Code from a catalog card, name from PDP — see lib/metalColor.js.
        metal_color_code: product.metal_color_code ?? null,
        metal_color_name: product.metal_color_name ?? null,
        has_stock:  product.has_stock  ?? null,
        net_weight: product.net_weight ?? null,
        weight:     product.weight     ?? null,
        style_id:   product.style_id   ?? null,
        // A confirmed customization, not just the bare design; catalog cards
        // never have a size, so this stays null there.
        item_size_id:   product.item_size_id   ?? null,
        item_size_name: product.item_size_name ?? null,
      };
      dispatch(addWishlistItemLocal(item));
      queryClient.setQueryData(wishlistQueryKey, (old) => (
        Array.isArray(old)
          ? [item, ...old.filter((i) => !(i.item_id === item.item_id && (i.item_size_id ?? null) === sizeId))]
          : old
      ));
      toast.success(TOAST.WISHLIST.ITEM_ADDED(item.item_name ?? 'Item'));
    }
  };
}
