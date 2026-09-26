// src/constants/toastMessages.js
// All user-facing toast notification strings for Lucira POS.
//
// RULES:
//   - Plain strings for simple messages
//   - Arrow functions for messages that include dynamic values
//   - Never use toast() directly in service files — only in hooks and components
//
// Usage:
//   import TOAST from '@/constants/toastMessages'
//   toast.success(TOAST.AUTH.LOGIN_SUCCESS)
//   toast.success(TOAST.CUSTOMER.CREATED(name))

const TOAST = {

  // SESSION_EXPIRED/REFRESH_FAILED removed 2026-08-27 — dead: never
  // referenced anywhere. src/lib/axios/interceptors.js owns this wording
  // itself, deliberately as its own self-contained literal strings (see its
  // header comment on why 401/403 "keep the fixed copy" over the server's
  // own reason) — its own generic errorMap's 401 entry, and the distinct,
  // more detailed forced-logout toast in handleLogout() ("check Orders/
  // Invoices for anything you were just placing"), which is intentionally
  // NOT the same message as a generic session-expired toast.
  AUTH: {
    LOGIN_SUCCESS:   'Logged in successfully.',
    LOGIN_FAILED:    'Invalid username or password. Please try again.',
    LOGOUT_SUCCESS:  'Logged out successfully.',
    // ADDED 2026-09-09 — see useAuth.js login()'s own comment: createReportSession
    // now gets 3 tries at login time instead of 1, so this should only ever
    // fire on a genuine, non-transient failure. Named honestly ("open an
    // invoice to reconnect") rather than implying the operator did something
    // wrong — the reconnect panel on InvoiceReportButton is the actual fix path.
    PRINT_SESSION_UNAVAILABLE: 'Signed in — but printing needs reconnecting. Open any invoice\'s print button to reconnect.',
  },

  STORE: {
    SWITCHED:      (storeName) => `Switched to ${storeName}.`,
    LOAD_FAILED:   'Failed to load store list. Please try again.',
    SWITCH_FAILED: 'Could not switch stores. Please try again.',
  },

  WISHLIST: {
    ITEM_ADDED:   (itemName) => `${itemName} added to wishlist.`,
    ITEM_REMOVED: (itemName) => `${itemName} removed from wishlist.`,
  },

  CART: {
    ITEM_ADDED:   (itemName) => `${itemName} added to cart.`,
    ITEM_REMOVED: (itemName) => `${itemName} removed from cart.`,
    ITEM_UPDATED: 'Cart updated.',
    CART_CLEARED: 'Cart has been cleared.',
    PROMO_APPLIED: (code) => `Promo code ${code} applied successfully.`,
    PROMO_REMOVED: 'Promo code removed.',
    PROMO_INVALID: (code) => `Promo code ${code} is not valid.`,
    // Distinct from PROMO_INVALID — the code IS real and active, it just
    // doesn't apply to what's in THIS basket (see checkoutPricingService.js
    // — most promos here are scoped to a component like the diamond or
    // making charge). usePromoValidation checks this BEFORE ever applying
    // the code (2026-08-24), so a promo that fails this never enters
    // appliedPromos at all — no tag, no toggle, just this one toast.
    PROMO_NOT_APPLICABLE: (code) => `Promo code ${code} doesn't apply to these items — no discount given.`,
    // Cart still pricing when Apply was pressed — there's nothing to check
    // eligibility against yet (see usePromoValidation). The input is also
    // disabled during this window; this only covers a click that landed a
    // beat before the disabled state did.
    PROMO_NOT_READY: 'Still pricing your cart — try applying this again in a moment.',
    // Different from PROMO_NOT_APPLICABLE: this promo WAS genuinely eligible
    // when applied, but the cart changed afterward (an item was added or
    // removed) and it no longer gives anything for what's in the basket now
    // — the defensive auto-removal in DiscountSection catches this
    // case, which the up-front check above cannot.
    PROMO_NO_LONGER_APPLIES: (code) => `Promo code ${code} no longer applies to your cart — removed.`,
    PROMO_FAILED:  'Failed to validate promo code. Please try again.',
    PROMO_SIMILAR_APPLIED: 'A similar promotion is already applied.',
    LOADED_FROM_ORDER: (orderNo) => `Loaded ${orderNo} into a new invoice.`,
  },

  CUSTOMER: {
    FOUND:                    (name) => `Customer ${name} logged in.`,
    NOT_FOUND:                'No customer found with this mobile number.',
    CREATED:                  (name) => `Customer ${name} created successfully.`,
    UPDATED:                  (name) => `Customer ${name} updated successfully.`,
    DETACHED:                 (name) => `Customer ${name} logged out.`,
    CREATE_FAILED:            'Failed to create customer. Please try again.',
    UPDATE_FAILED:            'Failed to update customer. Please try again.',
    LOAD_FAILED:              'Failed to load customer details. Please try again.',
    SESSION_CHANGED_REDIRECT: 'Customer changed — returning to catalog to start a fresh order.',
  },

  ORDERS: {
    CREATED:      (orderNo) => `Order #${orderNo} placed successfully.`,
    CREATE_FAILED:'Failed to place order. Please try again.',
    // transactionId (2026-08-27) — Create had already succeeded by the time
    // Post failed, so a real draft exists server-side even though the
    // operator sees this as "failed". Naming it here is what turns "the
    // order vanished" into "the order is transaction #271, still needs
    // finalising" — see useCreateOrder.js's onError for how this is called.
    POST_FAILED:  (transactionId) => transactionId
      ? `Order created (ref #${transactionId}) but couldn't be finalised. Check Orders before retrying — it may already exist as a draft.`
      : 'Failed to finalise order. Please try again.',
    CANCELLED:    'Order cancelled successfully.',
    CANCEL_FAILED:'Failed to cancel order. Please try again.',
    LOAD_FAILED:  'Failed to load orders. Please try again.',
  },

  INVOICES: {
    CREATED:      (invoiceNo) => `Invoice #${invoiceNo} created successfully.`,
    CREATE_FAILED:'Failed to create invoice. Please try again.',
    // See ORDERS.POST_FAILED above — same reasoning, same risk of an
    // orphaned draft transaction the operator has no other way to find.
    POST_FAILED:  (transactionId) => transactionId
      ? `Invoice created (ref #${transactionId}) but couldn't be finalised. Check Invoices before retrying — it may already exist as a draft.`
      : 'Failed to finalise invoice. Please try again.',
    CANCELLED:    'Invoice cancelled successfully.',
    CANCEL_FAILED:'Failed to cancel invoice. Please try again.',
    LOAD_FAILED:  'Failed to load invoice. Please try again.',
    PDF_SUCCESS:  'Invoice PDF generated successfully.',
    PDF_FAILED:   'Failed to generate PDF. Please try again.',
    RECEIPT_ADDED: 'Payment recorded successfully.',
    RECEIPT_FAILED:'Failed to record payment. Please try again.',
  },

  RETURNS: {
    CREATED:      'Return created successfully.',
    CREATE_FAILED:'Failed to create return. Please try again.',
    POST_SUCCESS: 'Return posted successfully.',
    POST_FAILED:  'Failed to post return. Please try again.',
    CANCELLED:    'Return cancelled.',
    CANCEL_FAILED:'Failed to cancel return. Please try again.',
    LOAD_FAILED:  'Failed to load returns. Please try again.',
  },

  INTERSTORE_RETURN: {
    CREATED:          'Interstore return created.',
    CREATE_FAILED:    'Failed to create interstore return. Please try again.',
    IMAGES_SAVED:     'Photos attached.',
    IMAGES_FAILED:    'Failed to attach photos. Please try again.',
    SUBMITTED:        'Submitted for approval.',
    SUBMIT_FAILED:    'Failed to submit for approval. Please try again.',
    APPROVED:         'Approved — moved to settlement.',
    APPROVE_FAILED:   'Failed to approve. Please try again.',
    REJECTED:         'Rejected.',
    REJECT_FAILED:    'Failed to reject. Please try again.',
    RESUBMITTED:      'Resubmitted for approval.',
    RESUBMIT_FAILED:  'Failed to resubmit. Please try again.',
    RETURNED_TO_ORIGIN:      'Returned to origin store — closed.',
    RETURN_TO_ORIGIN_FAILED: 'Failed to return to origin. Please try again.',
    LOCALLY_ABSORBED:        'Locally absorbed — closed.',
    LOCAL_ABSORPTION_FAILED: 'Failed to complete local absorption. Please try again.',
  },

  REFUNDS: {
    CREATED:      'Refund recorded successfully.',
    CREATE_FAILED:'Failed to record refund. Please try again.',
    COMPLETED:    'Refund completed successfully.',
    DELETED:      'Refund deleted.',
    LOAD_FAILED:  'Failed to load refunds. Please try again.',
  },

  CREDIT_NOTES: {
    CREATED:      'Credit note created successfully.',
    CREATE_FAILED:'Failed to create credit note. Please try again.',
    POSTED:       'Credit note posted — customer balance updated.',
    POST_FAILED:  'Failed to post credit note. Please try again.',
    CANCELLED:    'Credit note cancelled.',
    CANCEL_FAILED:'Failed to cancel credit note. Please try again.',
    LOAD_FAILED:  'Failed to load credit notes. Please try again.',
  },

  EXCHANGE: {
    CREATED:      'Exchange created successfully.',
    CREATE_FAILED:'Failed to create exchange. Please try again.',
    POSTED:       'Exchange posted successfully.',
    POST_FAILED:  'Failed to post exchange. Please try again.',
    CANCELLED:    'Exchange cancelled.',
    CANCEL_FAILED:'Failed to cancel exchange. Please try again.',
    LOAD_FAILED:  'Failed to load exchanges. Please try again.',
  },

  BUYBACK: {
    CREATED:      'Buy back created successfully.',
    CREATE_FAILED:'Failed to create buy back. Please try again.',
    POSTED:       'Buy back posted successfully.',
    POST_FAILED:  'Failed to post buy back. Please try again.',
    CANCELLED:    'Buy back cancelled.',
    CANCEL_FAILED:'Failed to cancel buy back. Please try again.',
    LOAD_FAILED:  'Failed to load buy backs. Please try again.',
  },

  // ── URD PURCHASE (Old Gold) ───────────────────────────────────────────────
  URD_PURCHASE: {
    CREATED:      'Old gold purchase created successfully.',
    CREATE_FAILED:'Failed to create old gold purchase. Please try again.',
    POSTED:       'Old gold purchase posted successfully.',
    POST_FAILED:  'Failed to post old gold purchase. Please try again.',
    CANCELLED:    'Old gold purchase cancelled.',
    CANCEL_FAILED:'Failed to cancel old gold purchase. Please try again.',
    LOAD_FAILED:  'Failed to load old gold purchases. Please try again.',
  },

  REPAIR: {
    INTAKE_CREATED:      'Repair intake recorded successfully.',
    INTAKE_FAILED:       'Failed to record repair intake. Please try again.',
    INTAKE_POSTED:       'Repair intake posted successfully.',
    INTAKE_POST_FAILED:  'Failed to post repair intake. Please try again.',
    OUT_CREATED:         'Item sent to craftsman successfully.',
    OUT_FAILED:          'Failed to record repair-out. Please try again.',
    OUT_POSTED:          'Repair-out posted successfully.',
    OUT_POST_FAILED:     'Failed to post repair-out. Please try again.',
    INVOICE_CREATED:     'Repair invoice created successfully.',
    INVOICE_FAILED:      'Failed to create repair invoice. Please try again.',
    INVOICE_POSTED:      'Repair invoice posted — item ready for customer.',
    INVOICE_POST_FAILED: 'Failed to post repair invoice. Please try again.',
    RECEIPT_CREATED:     'Payment recorded against repair invoice.',
    RECEIPT_FAILED:      'Failed to record payment. Please try again.',
    LOAD_FAILED:         'Failed to load repair records. Please try again.',
  },

  ESTIMATION: {
    CREATED:        'Quotation created successfully.',
    CREATE_FAILED:  'Failed to create quotation. Please try again.',
    UPDATED:        'Quotation updated.',
    UPDATE_FAILED:  'Failed to update quotation. Please try again.',
    CONVERTED:      'Quotation converted to sale successfully.',
    CONVERT_FAILED: 'Failed to convert quotation. Please try again.',
    CANCELLED:      'Quotation cancelled.',
    CANCEL_FAILED:  'Failed to cancel quotation. Please try again.',
    LOAD_FAILED:    'Failed to load quotations. Please try again.',
  },

  DAILY_CLOSING: {
    CREATED:      'Daily closing recorded successfully.',
    CREATE_FAILED:'Failed to record daily closing. Please try again.',
    LOAD_FAILED:  'Failed to load closing records. Please try again.',
  },

  GIFT_VOUCHER: {
    APPLIED:      (code) => `Gift voucher ${code} applied successfully.`,
    APPLY_FAILED: 'Failed to apply gift voucher. Please try again.',
    INVALID:      (code) => `Gift voucher ${code} is invalid or has no balance.`,
    REDEEMED:     'Gift voucher redeemed successfully.',
    REDEEM_FAILED:'Failed to redeem gift voucher. Please try again.',
  },

  SCHEMES: {
    ENROLLED:        'Customer enrolled in scheme successfully.',
    ENROLL_FAILED:   'Failed to enroll customer. Please try again.',
    RECEIPT_SUCCESS: 'Scheme payment recorded successfully.',
    RECEIPT_FAILED:  'Failed to record scheme payment. Please try again.',
    LOAD_FAILED:     'Failed to load schemes. Please try again.',
    CLOSURE_RECORDED:'Benefit amount recorded on the enrollment.',
    CLOSURE_FAILED:  'Failed to record the benefit amount. Please try again.',
    REDEEMED:        'Enrollment redeemed.',
    REDEEM_FAILED:   'Failed to redeem the enrollment. Please try again.',
  },

  METAL_RATES: {
    ADDED:       'Metal rates updated successfully.',
    ADD_FAILED:  'Failed to update metal rates. Please try again.',
    NOT_SET:     'Metal rates have not been set for today. Please update before billing.',
  },

  CUSTOMER_HISTORY: {
    LOAD_FAILED: 'Failed to load customer history. Please try again.',
  },

  CATALOG: {
    LOAD_FAILED:  'Failed to load products. Please try again.',
    SEARCH_ERROR: 'Search failed. Please try again.',
    FILTER_ERROR: 'Failed to load filter options.',
    SKU_COPIED:   (sku) => `SKU ${sku} copied to clipboard.`,
    COPY_FAILED:  'Could not copy SKU. Please try again.',
  },

  GENERIC: {
    SOMETHING_WRONG: 'Something went wrong. Please try again.',
    NETWORK_ERROR:   'Network error. Please check your connection.',
    UNAUTHORIZED:    'You do not have permission to perform this action.',
    SERVER_ERROR:    'Server error. Please try again in a moment.',
    LOAD_FAILED:     'Failed to load data. Please try again.',
    SAVE_FAILED:     'Failed to save. Please try again.',
    POST_FAILED:     'Failed to finalise. Please try again.',
    CANCEL_FAILED:   'Failed to cancel. Please try again.',
  },

};

export default TOAST;