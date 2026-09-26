// src/store/analyticsMiddleware.js
// Tracks cart/customer actions at the Redux level rather than inside
// individual hooks — attachCustomer/detachCustomer are dispatched from more
// than one call site (useCustomerSession.js and useCart.js), so catching
// them here guarantees every dispatch is tracked exactly once.

import tracker from '@/lib/analytics/tracker';
import EVENTS from '@/lib/analytics/events';
import { getPromotionDiscountType } from '@/lib/normalizers/promotion';

// Looks up the full cart line (with its `attributes`) from the pre-dispatch cart,
// since the reducer has already applied add/remove/qty changes by the time this
// middleware runs. Lets CART_ITEM_REMOVED/CART_ITEM_QTY_CHANGED carry full product
// detail, not just the bare itemId/sizeId/styleId identifiers on the action payload.
function findCartItem(preCart, { itemId, sizeId, styleId }) {
  return preCart?.items?.find(
    (i) => i.itemId === itemId && i.sizeId === sizeId && i.styleId === styleId
  ) ?? null;
}

export const analyticsMiddleware = (store) => (next) => (action) => {
  // Captured before next(action) — detachCustomer's reducer resets cart to
  // initialState synchronously, so this is the only place the outgoing
  // customer's identity (and any about-to-be-removed cart line) is still readable.
  const preCart = store.getState().cart;

  const result = next(action);

  switch (action.type) {
    case 'cart/attachCustomer': {
      const state = store.getState();
      const { customerId, customerName, customerMobile } = action.payload;
      tracker.startSession({
        customerId,
        customerName,
        customerMobile,
        agentUsername: state.auth?.user?.username ?? null,
        storeId:        state.store?.activeStoreId   ?? null,
        storeName:      state.store?.activeStoreName ?? null,
        storeCode:      state.store?.activeStoreCode ?? null,
      });
      break;
    }

    case 'cart/detachCustomer': {
      tracker.endSession('manual');
      // endSession() above already clears the tracker's own session, so track()'s
      // usual session-derived customer_id is gone by now — read it from preCart instead.
      tracker.track(EVENTS.CUSTOMER_DETACHED, {
        customer_id: preCart?.customerId ?? undefined,
      });
      break;
    }

    case 'cart/removeItem': {
      const item = findCartItem(preCart, action.payload);
      tracker.track(EVENTS.CART_ITEM_REMOVED, {
        ...action.payload,
        item_name:  item?.itemName ?? null,
        unit_price: item?.unitPrice ?? null,
        quantity:   item?.quantity ?? null,
        image:      item?.image ?? null,
        ...item?.attributes,
      });
      break;
    }

    case 'cart/updateQuantity': {
      const item = findCartItem(preCart, action.payload);
      // action.payload already carries the new quantity.
      tracker.track(EVENTS.CART_ITEM_QTY_CHANGED, {
        ...action.payload,
        item_name:  item?.itemName ?? null,
        unit_price: item?.unitPrice ?? null,
        ...item?.attributes,
      });
      break;
    }

    case 'ui/openCart': {
      const state = store.getState();
      tracker.track(EVENTS.CART_OPENED, {
        item_count: state.cart?.items?.length ?? 0,
        value:      state.cart?.total ?? null,
        store_id:   state.store?.activeStoreId ?? null,
      });
      break;
    }

    case 'cart/clearCart': {
      // reason distinguishes a completed sale / explicit clear / logout's
      // 'session_reset' (see abandonedCartMiddleware's matching case) so a
      // GA4/WebEngage funnel can tell those apart instead of one undifferentiated event.
      tracker.track(EVENTS.CART_CLEARED, {
        reason: action.payload?.reason ?? 'manual',
        item_count: preCart?.items?.length ?? undefined,
      });
      break;
    }

    case 'cart/applyPromo': {
      // Only the identifying fields — promoDetails is the full promotion
      // entity and too large/noisy to send as an event property.
      const { promoCode, discountAmount, promoDetails } = action.payload;
      tracker.track(EVENTS.PROMO_APPLIED, {
        promoCode,
        discountAmount,
        // %-off vs flat-₹-off — same helper usePromoValidation groups "similar promo" by.
        discountType: promoDetails ? getPromotionDiscountType(promoDetails) : undefined,
      });
      break;
    }

    default:
      break;
  }

  return result;
};
