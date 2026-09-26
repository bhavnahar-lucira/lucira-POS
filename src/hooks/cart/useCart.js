// src/hooks/cart/useCart.js
// Full cart state + actions. Single hook for CartDrawer and its children.

import { useDispatch, useSelector } from 'react-redux';
import { toast } from 'react-toastify';
import {
  selectCartItems,
  selectCartCustomerId,
  selectCartCustomerName,
  selectCartCustomerMobile,
  selectAppliedPromos,
  selectIsCartEmpty,
  selectFulfillmentOrderId,
  selectFulfillmentOrderNo,
  removeItem,
  updateQuantity,
  attachCustomer,
  detachCustomer,
  applyPromo,
  removePromo,
  clearCart,
  clearCartKeepCustomer,
  hydrateFromOrder,
} from '@/store/slices/cartSlice';
import { mapFulfillmentLineToCartItem } from '@/services/orderFulfillmentService';
import TOAST from '@/constants/toastMessages';

export function useCart() {
  const dispatch = useDispatch();

  const items               = useSelector(selectCartItems);
  const customerId          = useSelector(selectCartCustomerId);
  const customerName        = useSelector(selectCartCustomerName);
  const customerMobile      = useSelector(selectCartCustomerMobile);
  const appliedPromos       = useSelector(selectAppliedPromos);
  const isEmpty             = useSelector(selectIsCartEmpty);
  const fulfillmentOrderId  = useSelector(selectFulfillmentOrderId);
  const fulfillmentOrderNo  = useSelector(selectFulfillmentOrderNo);

  const handleRemoveItem = (item) => {
    dispatch(removeItem({
      itemId:  item.itemId,
      sizeId:  item.sizeId,
      styleId: item.styleId,
    }));
    toast.success(TOAST.CART.ITEM_REMOVED(item.itemName ?? 'Item'));
  };

  const handleUpdateQuantity = (item, quantity) => {
    if (quantity <= 0) {
      handleRemoveItem(item);
      return;
    }
    dispatch(updateQuantity({
      itemId:  item.itemId,
      sizeId:  item.sizeId,
      styleId: item.styleId,
      quantity,
    }));
  };

  const handleAttachCustomer = (customer) => {
    dispatch(attachCustomer(customer));
    toast.success(TOAST.CUSTOMER.FOUND(customer.customerName ?? 'Customer'));
  };

  const handleDetachCustomer = () => {
    dispatch(detachCustomer());
    toast.success(TOAST.CUSTOMER.DETACHED(customerName ?? 'Customer'));
  };

  const handleApplyPromo = (promo) => {
    dispatch(applyPromo(promo));
    toast.success(TOAST.CART.PROMO_APPLIED(promo.promoCode));
  };

  const handleRemovePromo = (promoCode) => {
    dispatch(removePromo(promoCode));
    toast.success(TOAST.CART.PROMO_REMOVED);
  };

  const handleClearCart = () => {
    dispatch(clearCart());
    toast.success(TOAST.CART.CART_CLEARED);
  };

  // Used only by checkout/page.jsx right after a successful order/invoice.
  // Completing a sale must not silently detach the customer — only a
  // manual "Remove" (detachCustomer) or the agent's own logout should end
  // that session. No toast here (unlike handleClearCart) — this is an
  // internal cleanup step before the redirect to /order-success.
  const handleClearCartKeepCustomer = () => {
    dispatch(clearCartKeepCustomer());
  };

  // "Fulfill from order" — replaces the whole cart with an order's own
  // customer + selected ready-to-invoice line(s). See cartSlice's
  // hydrateFromOrder and orderFulfillmentService.js for the full contract;
  // this closes the source order out server-side via
  // checkoutPricingService.claimStockPieces claiming the exact reserved
  // stock piece (fulfillmentItemLineNo), not a header field.
  //
  // @param {{ order: { partyId, partyName, mobile, transactionId, documentNo },
  //   lines: object[] }} params — lines are raw rows from
  //   getReadyToInvoiceLines/getAllOpenOrderLines
  const handleLoadFromOrder = ({ order, lines }) => {
    // Detach the outgoing customer first, mirroring every other
    // customer-switch path (CustomerSessionSheet.performAttach,
    // customers/page.jsx) — otherwise hydrateFromOrder's wholesale cart
    // replace skips abandonedCartMiddleware's 'cart/detachCustomer' case,
    // the only thing that snapshots an outgoing customer's cart to Mongo.
    if (customerId && customerId !== order.partyId && items.length > 0) {
      dispatch(detachCustomer());
    }

    const mappedItems = lines.map(mapFulfillmentLineToCartItem);
    dispatch(hydrateFromOrder({
      items: mappedItems,
      customerId:         order.partyId,
      customerName:       order.partyName,
      customerMobile:     order.mobile,
      fulfillmentOrderId: order.transactionId,
      fulfillmentOrderNo: order.documentNo,
    }));
    toast.success(TOAST.CART.LOADED_FROM_ORDER(order.documentNo));
  };

  return {
    items,
    customerId,
    customerName,
    customerMobile,
    appliedPromos,
    isEmpty,
    fulfillmentOrderId,
    fulfillmentOrderNo,
    removeItem: handleRemoveItem,
    updateQuantity: handleUpdateQuantity,
    attachCustomer: handleAttachCustomer,
    detachCustomer: handleDetachCustomer,
    applyPromo: handleApplyPromo,
    removePromo: handleRemovePromo,
    clearCart: handleClearCart,
    clearCartKeepCustomer: handleClearCartKeepCustomer,
    loadFromOrder: handleLoadFromOrder,
  };
}