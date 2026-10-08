// src/store/slices/cartSlice.js
// Manages the shopping cart — items, customer, promos, totals.
// Persisted via Redux Persist (survives page refresh — offline resilience).
// All pricing comes from OrnaVerse API — no independent price computation.

import { createSlice } from '@reduxjs/toolkit';
import { REHYDRATE } from 'redux-persist';
import APP_CONFIG from '@/constants/appConfig';

const initialState = {
  items:               [],    // CartItem[]
  customerId:          null,
  customerName:        null,
  customerMobile:      null,
  customerAddress:     null,  // { address, address1, city, state, country, zip } — used as
                               // shipping_address/billing_address at order creation
  appliedPromos:       [],    // { promoCode, promoDetails, overrideAmount, discountAmount }[] —
                               // multiple promos can stack; discountAmount is derived (see
                               // recalculateTotals). overrideAmount is the operator-typed
                               // "Override Amount" (OrnaVerse's own Enter Promo field) — null
                               // unless set.
  discountAmount:      0,     // derived from appliedPromos against the current subtotal
  subtotal:            0,
  taxAmount:           0,     // GST on the taxable value (subtotal - discount), rate from APP_CONFIG
  total:               0,
  // Set only when loaded via "Fulfill from order" (see useOrderFulfillment.js /
  // hydrateFromOrder) — carried through to Invoice/Create as a reference back to
  // the source order. Whether OrnaVerse's backend actually closes the order out
  // from this is unverified — see API.ORDER_FULFILLMENT.
  fulfillmentOrderId:  null,
  fulfillmentOrderNo:  null,
};

// Recalculates subtotal, tax and total after any cart mutation.
//
// The cart deliberately does not price promotions: a promotion's percentage
// applies to a component of the item chosen by `discount_calc_on` (diamond
// value, making charges, or whole value), which only server-side
// Helper/ApplyPromotions can resolve correctly over priced line items. So
// discountAmount stays 0 here — the promo shows as applied with no rupee
// figure until checkout computes the real number (see useCheckoutPricing).
const recalculateTotals = (state) => {
  state.subtotal = state.items.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0
  );

  state.discountAmount = 0;
  state.appliedPromos = state.appliedPromos.map((promo) => ({
    ...promo,
    discountAmount: 0,
  }));

  state.taxAmount = +(state.subtotal * APP_CONFIG.TAX.GST_RATE).toFixed(2);
  state.total = +(state.subtotal + state.taxAmount).toFixed(2);
};

const cartSlice = createSlice({
  name: 'cart',
  initialState,
  reducers: {

    addItem: (state, action) => {
      const incoming = action.payload;
      const existing = state.items.find(
        (item) =>
          item.itemId  === incoming.itemId &&
          item.sizeId  === incoming.sizeId &&
          item.styleId === incoming.styleId
      );
      if (existing) {
        existing.quantity += incoming.quantity ?? 1;
      } else {
        state.items.push({
          itemId:     incoming.itemId,
          itemCode:   incoming.itemCode,
          itemName:   incoming.itemName,
          sku:        incoming.sku,
          quantity:   incoming.quantity ?? 1,
          unitPrice:  incoming.unitPrice,
          styleId:    incoming.styleId  ?? null,
          sizeId:     incoming.sizeId   ?? null,
          sizeName:   incoming.sizeName ?? null,
          attributes: incoming.attributes ?? {},
          image:      incoming.image    ?? incoming.imageUrl ?? null,
          // Stable link back to this item for analytics (WebEngage retargeting,
          // abandoned-cart reminders). This is the staff-facing POS route, not a
          // public storefront link — no Shopify product handle is resolved
          // anywhere in this codebase, only the numeric external_product_id.
          productUrl: incoming.productUrl ?? (incoming.itemId != null ? `/products/${incoming.itemId}` : null),
          // Shelf-stock vs made-to-order signal (mirrors ProductCard). null for
          // lines added before this field existed or via a path that doesn't
          // pass it — StockStatusBadge renders nothing for null (no badge, never a wrong one).
          hasStock:   incoming.hasStock ?? null,
        });
      }
      recalculateTotals(state);
    },

    // `quantity` (optional) removes only that many units, not the whole
    // line — reported directly (2026-09-30): a cart line split across two
    // documents (buildCartDisplayRows — part in stock, part made-to-order)
    // renders as two rows sharing the same itemId/sizeId/styleId (there is
    // only ONE real entry for that combination in state.items, holding the
    // combined quantity), so deleting either row previously matched and
    // dropped the WHOLE line — the other row's "different" portion was
    // never a separate entry to begin with. Omitting `quantity` (every
    // pre-existing caller) keeps deleting the whole line, unchanged.
    removeItem: (state, action) => {
      const { itemId, sizeId, styleId, quantity } = action.payload;
      const match = state.items.find(
        (item) =>
          item.itemId  === itemId &&
          item.sizeId  === sizeId &&
          item.styleId === styleId
      );
      if (!match) return;

      if (quantity != null && quantity < match.quantity) {
        match.quantity -= quantity;
      } else {
        state.items = state.items.filter((item) => item !== match);
      }
      recalculateTotals(state);
    },

    updateQuantity: (state, action) => {
      const { itemId, sizeId, styleId, quantity } = action.payload;
      // Defensive: redirect a non-positive quantity to a remove, rather than
      // trusting every caller to pre-validate (not all of them do).
      if (quantity <= 0) {
        state.items = state.items.filter(
          (i) => !(i.itemId === itemId && i.sizeId === sizeId && i.styleId === styleId)
        );
        recalculateTotals(state);
        return;
      }

      const item = state.items.find(
        (i) =>
          i.itemId  === itemId &&
          i.sizeId  === sizeId &&
          i.styleId === styleId
      );
      if (item) {
        item.quantity = quantity;
      }
      recalculateTotals(state);
    },

    attachCustomer: (state, action) => {
      const { customerId, customerName, customerMobile, customerAddress } = action.payload;
      // Last-resort guard, not a replacement for detaching first: every call site
      // should dispatch detachCustomer() before attaching a different customer over
      // one with items, since only that path snapshots the outgoing cart to Mongo.
      // This just stops the worse outcome — items silently misattributed to the
      // wrong customer — if a caller forgets (see useCart.js's handleLoadFromOrder).
      if (state.customerId && state.customerId !== customerId && state.items.length > 0) {
        state.items              = [];
        state.appliedPromos      = [];
        state.discountAmount     = 0;
        state.subtotal           = 0;
        state.taxAmount          = 0;
        state.total              = 0;
        state.fulfillmentOrderId = null;
        state.fulfillmentOrderNo = null;
      }
      state.customerId      = customerId;
      state.customerName    = customerName;
      state.customerMobile  = customerMobile;
      state.customerAddress = customerAddress ?? null;
    },

    // Full reset, not just the customer fields — a detach ends this customer's
    // session. abandonedCartMiddleware already snapshotted the pre-detach cart to
    // Mongo, so nothing is lost; re-attaching later restores from that snapshot.
    detachCustomer: () => {
      return initialState;
    },

    // Appends a validated promo. "Similar" (same discount-type) conflicts are
    // checked before dispatch (see usePromoValidation); this only guards the
    // exact same code being added twice. payload.discountAmount is ignored —
    // recalculateTotals derives it from promoDetails; it's kept on the action
    // only because analyticsMiddleware reports it.
    //
    // freeGiftItem (optional) — any promotion carrying a free_item_id (not
    // just promotion_type 6 "Spend X Get Y Free" — type 2 "Free Product"
    // promos use the same field). Confirmed live (2026-10-07): OrnaVerse's
    // ApplyPromotions 400s with "Free gift items not found in the
    // transaction" unless the free item is already its own line — it
    // discounts an existing line to zero, it doesn't inject one. So the free
    // item is added as a real (tagged) cart line here, priced/zeroed through
    // the exact same pipeline as any other line — see usePromoValidation.js
    // for where this gets resolved.
    applyPromo: (state, action) => {
      const { promoCode, promoDetails, overrideAmount, freeGiftItem } = action.payload;
      const alreadyApplied = state.appliedPromos.some((p) => p.promoCode === promoCode);
      if (alreadyApplied) return;

      state.appliedPromos.push({ promoCode, promoDetails, overrideAmount: overrideAmount ?? null, discountAmount: 0 });

      if (freeGiftItem && !state.items.some(
        (i) => i.itemId === freeGiftItem.itemId && i.freeGiftPromoCode === promoCode
      )) {
        state.items.push({
          itemId:     freeGiftItem.itemId,
          itemCode:   freeGiftItem.itemCode,
          itemName:   freeGiftItem.itemName,
          sku:        freeGiftItem.sku,
          quantity:   1,
          unitPrice:  0,
          styleId:    null,
          sizeId:     null,
          sizeName:   null,
          attributes: {},
          image:      null,
          productUrl: freeGiftItem.itemId != null ? `/products/${freeGiftItem.itemId}` : null,
          hasStock:   null,
          // Tag only — lets removePromo clean this line up symmetrically, and
          // lets applyPromo (above) avoid adding it twice.
          freeGiftPromoCode: promoCode,
        });
      }

      recalculateTotals(state);
    },

    removePromo: (state, action) => {
      const promoCode = action.payload;
      state.appliedPromos = state.appliedPromos.filter((p) => p.promoCode !== promoCode);
      // Drop the free-gift line this promo added (see applyPromo above) — it
      // has no reason to stay in the cart as a $0 paid item once its promo
      // is gone, whether removed by hand or auto-cleaned (DiscountSection)
      // after turning out not to qualify.
      state.items = state.items.filter((item) => item.freeGiftPromoCode !== promoCode);
      recalculateTotals(state);
    },

    // Clear the entire cart — called after successful order creation
    clearCart: (state) => {
      return initialState;
    },

    // Used instead of clearCart() once an order/invoice is placed — completing a
    // sale must not silently detach the customer; only an explicit "Remove" or
    // logout should. Resets everything clearCart() does except the customer fields.
    clearCartKeepCustomer: (state) => {
      return {
        ...initialState,
        customerId:      state.customerId,
        customerName:    state.customerName,
        customerMobile:  state.customerMobile,
        customerAddress: state.customerAddress,
      };
    },

    // Restores a previously-abandoned cart (see abandonedCartMiddleware.js) once a
    // customer with one attaches to an empty cart. Only touches items + totals —
    // customerId/Name/Mobile are already correct from the attach that triggered this.
    restoreCart: (state, action) => {
      state.items = action.payload.items ?? [];
      recalculateTotals(state);
    },

    // "Fulfill from order" — replaces the entire cart (not a merge) with the order's
    // customer + selected line(s), tagged with fulfillmentOrderId/OrderNo so
    // useCreateInvoice can reference the source order. unitPrice here is a display
    // estimate only; buildPricedLineItems re-prices against today's rates at submission.
    hydrateFromOrder: (state, action) => {
      const { items, customerId, customerName, customerMobile, fulfillmentOrderId, fulfillmentOrderNo } = action.payload;
      const next = {
        ...initialState,
        items,
        customerId, customerName, customerMobile,
        fulfillmentOrderId, fulfillmentOrderNo,
      };
      recalculateTotals(next);
      return next;
    },

  },

  // Redux Persist rehydration migration: a cart persisted before multi-promo
  // support has appliedPromoCode/appliedPromoDetails (singular), not an
  // appliedPromos array — migrate it so an in-progress cart isn't lost on upgrade.
  // Must return the whole slice, not mutate one field, or the rest of the
  // persisted cart (items, customer) is silently dropped.
  extraReducers: (builder) => {
    builder.addCase(REHYDRATE, (state, action) => {
      const persistedCart = action.payload?.cart;
      if (!persistedCart) return state;

      let appliedPromos;
      if (Array.isArray(persistedCart.appliedPromos)) {
        appliedPromos = persistedCart.appliedPromos;
      } else if (persistedCart.appliedPromoCode) {
        appliedPromos = [{
          promoCode:      persistedCart.appliedPromoCode,
          promoDetails:   persistedCart.appliedPromoDetails ?? null,
          discountAmount: persistedCart.discountAmount ?? 0,
        }];
      } else {
        appliedPromos = [];
      }

      // Guard against a non-array or malformed persisted `items` — recalculateTotals's
      // reduce() would otherwise throw on every app load. Malformed individual lines
      // (missing unitPrice/quantity) are dropped too, to avoid a NaN subtotal/tax/total.
      const items = Array.isArray(persistedCart.items)
        ? persistedCart.items.filter((item) =>
            item &&
            item.itemId != null &&
            typeof item.unitPrice === 'number' &&
            typeof item.quantity === 'number'
          )
        : [];

      // Recompute rather than trust the persisted subtotal/discount/total — a cart
      // persisted before discount became derived carries a stale frozen figure.
      const rehydrated = { ...state, ...persistedCart, appliedPromos, items };
      recalculateTotals(rehydrated);
      return rehydrated;
    });
  },
});

export const {
  addItem,
  removeItem,
  updateQuantity,
  attachCustomer,
  detachCustomer,
  applyPromo,
  removePromo,
  clearCart,
  clearCartKeepCustomer,
  restoreCart,
  hydrateFromOrder,
} = cartSlice.actions;

export const selectCartItems          = (state) => state.cart.items;
export const selectCartItemCount      = (state) => state.cart.items.reduce((sum, i) => sum + i.quantity, 0);
export const selectCartSubtotal       = (state) => state.cart.subtotal;
export const selectCartTax            = (state) => state.cart.taxAmount;
export const selectCartTotal          = (state) => state.cart.total;
export const selectCartDiscount       = (state) => state.cart.discountAmount;
export const selectCartCustomerId     = (state) => state.cart.customerId;
export const selectCartCustomerName   = (state) => state.cart.customerName;
export const selectCartCustomerMobile = (state) => state.cart.customerMobile;
export const selectCartCustomerAddress = (state) => state.cart.customerAddress;
export const selectAppliedPromos      = (state) => state.cart.appliedPromos;
export const selectIsCartEmpty        = (state) => state.cart.items.length === 0;
export const selectFulfillmentOrderId = (state) => state.cart.fulfillmentOrderId;
export const selectFulfillmentOrderNo = (state) => state.cart.fulfillmentOrderNo;

export default cartSlice.reducer;