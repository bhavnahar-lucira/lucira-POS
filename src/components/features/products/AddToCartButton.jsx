'use client';

import { useDispatch } from 'react-redux';
import { toast } from 'react-toastify';
import { ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { addItem } from '@/store/slices/cartSlice';
import { openCart } from '@/store/slices/uiSlice';
import { resolveImageSrc } from '@/lib/resolveImageSrc';
import { cn } from '@/lib/utils';
import TOAST from '@/constants/toastMessages';
import tracker from '@/lib/analytics/tracker';
import EVENTS, { GA_ECOMMERCE_EVENTS } from '@/lib/analytics/events';
import { buildProductAttributes } from '@/lib/analytics/productAttributes';

/**
 * @param {{
 *   product:          object,
 *   quantity:         number,
 *   unitPrice:        number | null,
 *   selectedSizeId:   number | null,
 *   selectedSizeName: string | null,
 *   primaryImage:     { src: string, alt: string|null } | null,
 *   stockStatus?:     'in_stock' | 'out_stock' | 'error' | null,
 *   pricedItem?:      object|null, — live-priced SetSalesItems row: the
 *     real price breakup, per-piece sku, and component weights, none of
 *     which live on `product`.
 *   disabled?:        boolean,
 * }} props
 *   stockStatus — passed down from ProductStickyActionBar rather than read
 *   from product.has_stock (which Items/Retrieve doesn't reliably carry).
 *   Carried onto the cart line as hasStock so Cart/Checkout can show an
 *   In Stock/Made to Order badge per line — see CartItemRow.
 */
export default function AddToCartButton({
  product,
  quantity,
  unitPrice = null,
  selectedSizeId,
  selectedSizeName,
  primaryImage = null,
  stockStatus = null,
  pricedItem = null,
  disabled = false,
  className,
}) {
  const dispatch = useDispatch();

  const isDisabled = !product || disabled || unitPrice == null;
  const resolvedImage =
    primaryImage?.src ??
    resolveImageSrc(product?.image_url ?? product?.image) ??
    null;    
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const productUrl = product?.item_id != null ? `${origin}/products/${product.item_id}` : null;
  const hasStockBool = stockStatus === 'in_stock' ? true : stockStatus === 'out_stock' ? false : null;
  const fullAttributes = buildProductAttributes({
    product,
    pricedItem: pricedItem,
    image: resolvedImage,
    productUrl,
    selectedSizeId,
    selectedSizeName,
    hasStock: hasStockBool,
  });

  const handleAddToCart = () => {
    if (isDisabled) return;

    dispatch(addItem({
      itemId:     product.item_id,
      itemCode:   product.item_code        ?? '',
      itemName:   product.item_name        ?? 'Unknown Product',
      sku:        product.item_code        ?? '',
      quantity,
      unitPrice,
      totalPrice: unitPrice * quantity,
      sizeId:     selectedSizeId           ?? product.item_size_id   ?? null,
      sizeName:   selectedSizeName         ?? product.item_size_name ?? null,
      image:      resolvedImage,
      hasStock:   hasStockBool,
      styleId:    product.style_id         ?? null,
      productUrl,
      attributes: fullAttributes,
    }));
    tracker.trackEcommerce(GA_ECOMMERCE_EVENTS.ADD_TO_CART, EVENTS.CART_ITEM_ADDED, {
      currency: 'INR',
      value:    unitPrice * quantity,
      items: [{
        item_id:       String(product.item_id),
        item_name:     product.item_name ?? 'Unknown Product',
        item_sku:      product.item_code ?? '',
        item_category: product.type_name ?? product.item_group_name ?? undefined,
        item_brand:    product.brand_name ?? undefined,
        item_variant:  [product.karat_name, product.metal_color_name].filter(Boolean).join(' ') || undefined,
        price:         unitPrice,
        quantity,
      }],
    }, {
      ...fullAttributes,
      price_unit:  unitPrice,
      price_total: unitPrice * quantity,
      quantity,
    });

    toast.success(TOAST.CART.ITEM_ADDED(product.item_name ?? 'Item'));
    dispatch(openCart());
  };

  return (
    <Button
      type="button"
      variant="premium"
      onClick={handleAddToCart}
      disabled={isDisabled}
      aria-label="Add to Cart"
      className={cn('flex-1 min-h-10 px-4 text-sm font-semibold sm:min-h-12 sm:px-6 sm:text-base', className)}
    >
      <ShoppingCart size={20} aria-hidden="true" className="shrink-0" />
      <span className="sm:hidden">Add</span>
      <span className="hidden sm:inline">Add to Cart</span>
    </Button>
  );
}