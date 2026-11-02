// src/store/slices/uiSlice.js
// Manages UI-only state — sidebar, modals, global loading.
// NOT persisted — resets to default on every app load.

import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  // Below md: whether the overlay nav drawer is open (Header's hamburger).
  // Always starts closed so a phone never loads with the page covered.
  sidebarOpen:   false,
  // md and up: whether the sidebar is squeezed to its icon-only rail.
  //   null  → the viewport decides (Sidebar's CSS): rail on a tablet
  //           (md..lg, where a 224px column costs too much of the page),
  //           expanded with labels on a laptop/desktop (lg+).
  //   true/false → the operator clicked Collapse/Expand; applies at every
  //           md+ size until the next reload (this slice isn't persisted).
  // Reported directly (2026-10-28/29): bare icons were hard to tell apart on
  // a laptop, but the open sidebar ate too much space on a tablet.
  sidebarCollapsed: null,
  globalLoading: false,
  cartOpen:      false,
  // Deliberately kept in this NOT-persisted slice rather than cartSlice: a
  // crash/reload mid-sale must not freeze a persisted `true` forever, which
  // would permanently block customer switching. See checkout/page.jsx's
  // handlePaymentConfirmed and HeaderCustomerControl.
  checkoutInProgress: false,
  // Set (to the promo's own code) while DiscountSection's gold-coin quantity
  // discovery is probing/settling, null once it lands on a final number.
  // Reported directly (2026-10-08, twice): without this, the cart visibly
  // showed the raw intermediate quantity (the applyPromo starting value of 1,
  // then the stock-probe ceiling) during that multi-second window, and it
  // read as "the count isn't being calculated" rather than "still working on
  // it". CartItemRow uses this to show a loading state on the free-gift line
  // instead of its in-flight quantity. Belongs here, not in cartSlice, for
  // the same reason checkoutInProgress does — purely transient UI state that
  // must not survive a reload (a stuck 'true' would hide the correct,
  // already-settled quantity forever behind a loading state nothing clears).
  freeGiftDiscoveryPromoCode: null,
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {

    openSidebar:  (state) => { state.sidebarOpen = true;  },
    closeSidebar: (state) => { state.sidebarOpen = false; },
    toggleSidebar:(state) => { state.sidebarOpen = !state.sidebarOpen; },
    setSidebarCollapsed: (state, action) => { state.sidebarCollapsed = action.payload; },

    openCart:  (state) => { state.cartOpen = true;  },
    closeCart: (state) => { state.cartOpen = false; },

    setGlobalLoading: (state, action) => { state.globalLoading = action.payload; },

    // Guards against a customer switch/detach mid-payment-confirmation redirecting
    // away from checkout before it clears the cart (risking a duplicate charge on
    // retry). checkout/page.jsx sets this for the duration of placeOrder/placeInvoice;
    // HeaderCustomerControl disables customer switching while it's true.
    setCheckoutInProgress: (state, action) => { state.checkoutInProgress = action.payload; },

    setFreeGiftDiscoveryPromoCode: (state, action) => { state.freeGiftDiscoveryPromoCode = action.payload; },

  },
});

export const {
  openSidebar,
  closeSidebar,
  toggleSidebar,
  setSidebarCollapsed,
  openCart,
  closeCart,
  setGlobalLoading,
  setCheckoutInProgress,
  setFreeGiftDiscoveryPromoCode,
} = uiSlice.actions;

export const selectSidebarOpen   = (state) => state.ui.sidebarOpen;
export const selectSidebarCollapsed = (state) => state.ui.sidebarCollapsed;
export const selectGlobalLoading = (state) => state.ui.globalLoading;
export const selectCartOpen      = (state) => state.ui.cartOpen;
export const selectCheckoutInProgress = (state) => state.ui.checkoutInProgress;
export const selectFreeGiftDiscoveryPromoCode = (state) => state.ui.freeGiftDiscoveryPromoCode;

export default uiSlice.reducer;