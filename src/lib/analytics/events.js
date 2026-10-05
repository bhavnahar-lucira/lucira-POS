const PREFIX = 'POS_';

const RAW_EVENTS = {
  AGENT_LOGIN:           'agent_login',
  AGENT_LOGOUT:          'agent_logout',
  AGENT_IDLE_LOGOUT:     'agent_idle_logout',
  STORE_SELECTED:        'store_selected',
  STORE_SWITCHED:        'store_switched',

  SESSION_START:         'session_start',
  SESSION_END:           'session_end',
  SESSION_IDLE_TIMEOUT:  'session_idle_timeout',

  PAGE_VIEW:             'page_view',

  PRODUCT_VIEWED:        'product_viewed',
  PRODUCT_SEARCHED:      'product_searched',
  PRODUCT_SEARCH_EMPTY:  'product_search_empty',
  CATEGORY_FILTERED:     'category_filtered',
  FILTER_APPLIED:        'filter_applied',
  FILTERS_CLEARED:       'filters_cleared',
  BARCODE_SCANNED:       'barcode_scanned',
  BARCODE_SCAN_FAILED:   'barcode_scan_failed',
  
  SIMILAR_PRODUCTS_VIEWED: 'similar_products_viewed',
  SIMILAR_PRODUCT_CLICKED: 'similar_product_clicked',
  PRODUCT_STORY_VIEWED:    'product_story_viewed',

  CART_ITEM_ADDED:       'cart_item_added',
  CART_ITEM_REMOVED:     'cart_item_removed',
  CART_ITEM_QTY_CHANGED: 'cart_item_qty_changed',
  CART_OPENED:           'cart_opened',
  CART_CLEARED:          'cart_cleared',
  CART_ABANDONED:        'cart_abandoned',

  CHECKOUT_STARTED:      'checkout_started',
  PAYMENT_SELECTED:      'payment_selected',
  PAYMENT_DECLINED:      'payment_declined',
  PROMO_APPLIED:         'promo_applied',
  PROMO_FAILED:          'promo_failed',
  ORDER_PLACED:          'order_placed',
  ORDER_FAILED:          'order_failed',

  ORDER_CANCELLED:        'order_cancelled',
  ORDER_CANCEL_FAILED:    'order_cancel_failed',

  INVOICE_CANCELLED:      'invoice_cancelled',
  INVOICE_CANCEL_FAILED:  'invoice_cancel_failed',
  INVOICE_RECEIPT_ADDED:  'invoice_receipt_added',
  INVOICE_RECEIPT_FAILED: 'invoice_receipt_failed',

  RETURN_CREATED:         'return_created',
  RETURN_POSTED:          'return_posted',
  RETURN_CANCELLED:       'return_cancelled',
  RETURN_FAILED:          'return_failed',

  REFUND_CREATED:         'refund_created',
  REFUND_RECEIPT_ADDED:   'refund_receipt_added',
  REFUND_DELETED:         'refund_deleted',
  REFUND_FAILED:          'refund_failed',

  CREDIT_NOTE_CREATED:    'credit_note_created',
  CREDIT_NOTE_POSTED:     'credit_note_posted',
  CREDIT_NOTE_CANCELLED:  'credit_note_cancelled',
  CREDIT_NOTE_FAILED:     'credit_note_failed',

  EXCHANGE_CREATED:       'exchange_created',
  EXCHANGE_POSTED:        'exchange_posted',
  EXCHANGE_CANCELLED:     'exchange_cancelled',
  EXCHANGE_FAILED:        'exchange_failed',

  BUYBACK_CREATED:        'buyback_created',
  BUYBACK_POSTED:         'buyback_posted',
  BUYBACK_CANCELLED:      'buyback_cancelled',
  BUYBACK_FAILED:         'buyback_failed',

  URD_PURCHASE_CREATED:   'urd_purchase_created',
  URD_PURCHASE_POSTED:    'urd_purchase_posted',
  URD_PURCHASE_CANCELLED: 'urd_purchase_cancelled',
  URD_PURCHASE_FAILED:    'urd_purchase_failed',

  REPAIR_IN_CREATED:       'repair_in_created',
  REPAIR_IN_POSTED:        'repair_in_posted',
  REPAIR_IN_CANCELLED:     'repair_in_cancelled',
  REPAIR_IN_FAILED:        'repair_in_failed',
  REPAIR_OUT_CREATED:      'repair_out_created',
  REPAIR_OUT_POSTED:       'repair_out_posted',
  REPAIR_OUT_FAILED:       'repair_out_failed',
  REPAIR_INVOICE_CREATED:  'repair_invoice_created',
  REPAIR_INVOICE_POSTED:   'repair_invoice_posted',
  REPAIR_INVOICE_FAILED:   'repair_invoice_failed',
  REPAIR_RECEIPT_CREATED:  'repair_receipt_created',
  REPAIR_RECEIPT_FAILED:   'repair_receipt_failed',

  ESTIMATION_CREATED:      'estimation_created',
  ESTIMATION_POSTED:       'estimation_posted',
  ESTIMATION_CANCELLED:    'estimation_cancelled',
  ESTIMATION_FAILED:       'estimation_failed',

  SCHEME_ENROLLED:         'scheme_enrolled',
  SCHEME_ENROLL_FAILED:    'scheme_enroll_failed',
  SCHEME_PAYMENT_RECORDED: 'scheme_payment_recorded',
  SCHEME_PAYMENT_FAILED:   'scheme_payment_failed',

  METAL_RATE_ADDED:        'metal_rate_added',
  METAL_RATE_ADD_FAILED:   'metal_rate_add_failed',

  CUSTOMER_SEARCHED:     'customer_searched',
  CUSTOMER_SELECTED:     'customer_selected',
  CUSTOMER_CREATED:      'customer_created',
  CUSTOMER_DETACHED:     'customer_detached',
  WALKIN_RECORDED:       'walkin_recorded',

  CLICK:                 'click',
  CUSTOMIZE_OPENED:      'customize_opened',
  CUSTOMIZE_CONFIRMED:   'customize_confirmed',
};

// Applies PREFIX once, centrally — nothing above ever types "POS_" by hand.
const EVENTS = Object.fromEntries(
  Object.entries(RAW_EVENTS).map(([key, value]) => [key, `${PREFIX}${value}`])
);

export const GA_ECOMMERCE_EVENTS = {
  VIEW_ITEM:        'view_item',
  ADD_TO_CART:      'add_to_cart',
  REMOVE_FROM_CART: 'remove_from_cart',
  VIEW_CART:        'view_cart',
  BEGIN_CHECKOUT:   'begin_checkout',
  ADD_PAYMENT_INFO: 'add_payment_info',
  PURCHASE:         'purchase',
};

export default EVENTS;
