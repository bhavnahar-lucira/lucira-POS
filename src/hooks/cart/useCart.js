import { useDispatch, useSelector } from 'react-redux';
import { toast } from 'sonner';
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
  const handleRemoveItem = (item, removeQuantity) => {
    dispatch(removeItem({
      itemId:   item.itemId,
      sizeId:   item.sizeId,
      styleId:  item.styleId,
      quantity: removeQuantity,
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
    toast.success(TOAST.CART.PROMO_APPLIED(promo.promoDetails?.promotion_name ?? promo.promoCode));
  };

  const handleRemovePromo = (promoCode) => {
    dispatch(removePromo(promoCode));
    toast.success(TOAST.CART.PROMO_REMOVED);
  };

  const handleClearCart = () => {
    dispatch(clearCart());
    toast.success(TOAST.CART.CART_CLEARED);
  };

  const handleClearCartKeepCustomer = () => {
    dispatch(clearCartKeepCustomer());
  };

  // @param {{ order: { partyId, partyName, mobile, transactionId, documentNo },
  const handleLoadFromOrder = ({ order, lines }) => {
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