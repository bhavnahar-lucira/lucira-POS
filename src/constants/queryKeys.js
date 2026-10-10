export const QUERY_KEYS = {

  STORES: {
    USER_STORES: () => ['stores', 'user-stores'],
  },

  HR: {
    EMPLOYEE_BY_USER: (userId) => ['hr', 'employee-by-user', userId],
    EMPLOYEES_BY_COMPANY: (companyId) => ['hr', 'employees-by-company', companyId],
  },

  SETTINGS: {
    PAYMENT_MODES:        () => ['settings', 'payment-modes'],
    PAYMENT_MODES_REFUND: () => ['settings', 'payment-modes-refund'],
    BANK_POS_ACCOUNTS:    () => ['settings', 'bank-pos-accounts'],
    TAXES:                (companyId) => ['settings', 'taxes', companyId],
    METAL_RATE_TODAY:     () => ['settings', 'metal-rate-today'],
    METAL_RATE:           (karatId, companyId, dateKey) => ['settings', 'metal-rate', karatId, companyId, dateKey],
    REASON_CODES:         () => ['settings', 'reason-codes'],
  },

  EXCHANGE_RATE: {
    GET: (currencyId, companyId) => ['exchange-rate', currencyId, companyId],
  },

  // ── DOCUMENT CONFIG (financial year + per-document-type ledger config) ────
  DOCUMENT_CONFIG: {
    FINANCIAL_YEARS:    ()          => ['document-config', 'financial-years'],
    DOCUMENT_NUMBERING: ()          => ['document-config', 'document-numbering'],
  },

  LOCATION: {
    COUNTRIES: ()            => ['location', 'countries'],
    STATES:    (countryId)   => ['location', 'states', countryId],
    CITIES:    (stateId)     => ['location', 'cities', stateId],
  },

  CATEGORIES: {
    TYPES:       () => ['categories', 'types'],
    SUBTYPES:    () => ['categories', 'subtypes'],
    SUBTYPE_DETAILS: (typeId) => ['categories', 'subtype-details', typeId],
    ITEM_GROUPS: () => ['categories', 'item-groups'],
  },

  // ── ITEMS (Master catalogue) ──────────────────────────────────────────────
  ITEMS: {
    LIST:            (params)  => ['items', 'list', params],
    DETAIL:          (itemId)  => ['items', 'detail', itemId],
    CUSTOM_ESTIMATE_LIST:  ()  => ['items', 'custom-estimate-list'],
    ATTRIBUTES:      (typeId)  => ['items', 'attributes', typeId],
    SIZES:           ()        => ['items', 'sizes'],
    DESIGN_VARIANTS: (styleId) => ['items', 'design-variants', styleId],
    MASTER_SEARCH:   (query)   => ['items', 'master-search', query],
    URD_SEARCH:      (query, baseItemId) => ['items', 'urd-search', query, baseItemId],
    PRICING:         (itemId, companyId) => ['items', 'pricing', itemId, companyId],
    MASTER_PRICING:  (itemId) => ['items', 'master-pricing', itemId],
    STORE_PIECES:    (itemId, companyId) => ['items', 'store-pieces', itemId, companyId],
    SEARCH: (params) => ['items', 'search', {
      q:    params.item_search,
      grp:  params.item_group_ids,
      typ:  params.type_ids,
      sub:  params.sub_type_ids,
      fw:   params.from_weight,
      tw:   params.to_weight,
      fdw:  params.from_diamond_weight,
      tdw:  params.to_diamond_weight,
    }],
  },

  // ── CATALOG (Live store inventory) ────────────────────────────────────────
  CATALOG: {
    PRODUCTS:              (params)  => ['catalog', 'products', params],
    // showOutOfStock varies the key — it's a genuinely different, much
    // larger pool (all tenant master records vs. the fast in-stock-only
    // sweep), not a client-side filter over the same data; caching them
    // under one key would let one silently overwrite the other.
    ALL_SHARED:            (showOutOfStock = false) => ['catalog', 'all', 'shared', showOutOfStock],
    SKU_SEARCH:            (query, storeId) => ['catalog', 'sku-search', query, storeId],
    // Exact per-piece SKU, distinct from SKU_SEARCH above (an item_code text
    // search) — see useExactSkuSearch.js's own header.
    EXACT_SKU_SEARCH:      (query, storeId) => ['catalog', 'exact-sku-search', query, storeId],
    CATEGORY_SEARCH:       (typeIds, storeId) => ['catalog', 'category-search', typeIds, storeId],
    STOCK_BY_STORES:       (itemId)  => ['catalog', 'stock-by-stores', itemId],
    STOCK_BY_STORES_BATCH: (itemIds) => ['catalog', 'stock-by-stores-batch', itemIds],
    // Per-item key for useCrossStoreStockCodes — see that hook's own header
    // for why this replaced a single joined-array key.
    STOCK_BY_STORES_ITEM:  (itemId)  => ['catalog', 'stock-by-stores-item', itemId],
    // Real, allocation-aware count for the ACTIVE store only — distinct from
    // STOCK_BY_STORES' raw piece count (see useClaimableStock.js's header).
    CLAIMABLE_STOCK:       (itemId, companyId) => ['catalog', 'claimable-stock', itemId, companyId],
    PRICE:                 (itemId, storeId, epoch) => ['catalog', 'price', itemId, storeId, epoch],
    PRICE_EPOCH:           (storeId, canaryIds) => ['catalog', 'price-epoch', storeId, canaryIds],
  },

  INVENTORY: {
    STOCK: (itemCode) => ['inventory', 'stock', itemCode],
  },

  CUSTOMERS: {
    LOOKUP:   (mobile)    => ['customers', 'lookup', mobile],
    RETRIEVE: (partyId)   => ['customers', 'detail', partyId],
    LIST:     (params)    => ['customers', 'list', params],
    SEARCH:   (companyId, containsText) => ['customers', 'search', companyId, containsText],
    WISHLIST: (partyId) => ['customers', 'wishlist', partyId],
    RECENTLY_VIEWED: (partyId) => ['customers', 'recently-viewed', partyId],
  },
  
  WALKINS: {
    LIST: (companyId, fromDate, toDate) => ['walkins', 'list', companyId, fromDate, toDate],
  },

  ORDERS: {
    LIST:            (params)     => ['orders', 'list', params],
    CUSTOMER_ORDERS: (customerId, storeId) => ['orders', 'customer', customerId, storeId],
    DETAIL:          (orderId)    => ['orders', 'detail', orderId],
  },

  // ── ORDER FULFILLMENT ("Fulfill from order") ──────────────────────────────
  ORDER_FULFILLMENT: {
    READY_TO_INVOICE: (partyId) => ['order-fulfillment', 'ready', partyId],
    ALL_OPEN:          (partyId) => ['order-fulfillment', 'all-open', partyId],
  },

  INVOICES: {
    LIST:   (params)    => ['invoices', 'list', params],
    ALL:    (companyId) => ['invoices', 'all', companyId],
    DETAIL: (invoiceId) => ['invoices', 'detail', invoiceId],
  },

  // ── INVOICE HELPERS (checkout available balances) ─────────────────────────
  INVOICE_HELPERS: {
    RECEIPTS:        (partyId)            => ['invoice-helpers', 'receipts',   partyId],
    PARTY_DAILY_CASH:(partyId, companyId) => ['invoice-helpers', 'daily-cash', partyId, companyId],
  },

  // ── REPAIR INVOICE HELPERS (billing-time available balances) ──────────────
  REPAIR_INVOICE_HELPERS: {
    ADVANCES:    (partyId, companyId) => ['repair-invoice-helpers', 'advances',    partyId, companyId],
    SCHEME:      (partyId, companyId) => ['repair-invoice-helpers', 'scheme',      partyId, companyId],
    CREDIT_NOTE: (partyId, companyId) => ['repair-invoice-helpers', 'credit-note', partyId, companyId],
    EXCHANGE:    (partyId, companyId) => ['repair-invoice-helpers', 'exchange',    partyId, companyId],
  },

  RETURNS: {
    LIST:       (params)        => ['returns', 'list', params],
    DETAIL:     (transactionId) => ['returns', 'detail', transactionId],
    SOLD_ITEMS: (partyId, companyId, transactionType) => ['returns', 'sold-items', partyId, companyId, transactionType],
  },

  COMPLIANCE: {
    POLICY: () => ['compliance', 'policy'],
  },

  REFUNDS: {
    LIST:             (params)   => ['refunds', 'list', params],
    DETAIL:           (refundId) => ['refunds', 'detail', refundId],
    CUSTOMER_CREDITS: (partyId, companyId)  => ['refunds', 'customer-credits', partyId, companyId],
  },

  CREDIT_NOTES: {
    LIST:   (params)          => ['credit-notes', 'list', params],
    DETAIL: (transactionId)   => ['credit-notes', 'detail', transactionId],
  },

  EXCHANGE: {
    LIST:   (params)          => ['exchange', 'list', params],
    DETAIL: (transactionId)   => ['exchange', 'detail', transactionId],
  },

  BUYBACK: {
    LIST:   (params)          => ['buyback', 'list', params],
    DETAIL: (transactionId)   => ['buyback', 'detail', transactionId],
  },

  URD_PURCHASE: {
    LIST:   (params)          => ['urd-purchase', 'list', params],
    DETAIL: (transactionId)   => ['urd-purchase', 'detail', transactionId],
  },

  // ── INTERSTORE RETURN (IRR) ────────────────────────────────────────────────
  INTERSTORE_RETURN: {
    LIST:       (params)       => ['interstore-return', 'list', params],
    DETAIL:     (id)           => ['interstore-return', 'detail', id],
    SOLD_ITEMS: (partyId)      => ['interstore-return', 'sold-items', partyId],
  },

  REPAIR: {
    ORDERS:              (params)          => ['repair', 'orders', params],
    ORDER_DETAIL:        (transactionId)   => ['repair', 'order-detail', transactionId],
    SOLD_ITEMS:          (params)          => ['repair', 'sold-items', params],
    LOCATION:            (companyId)       => ['repair', 'location', companyId],
    REPAIR_INS:          (params)          => ['repair', 'repair-ins', params],
    REPAIR_IN_DETAIL:    (transactionId)   => ['repair', 'repair-in-detail', transactionId],
    REPAIR_OUTS:         (params)          => ['repair', 'repair-outs', params],
    REPAIR_INVOICES:     (params)          => ['repair', 'repair-invoices', params],
    REPAIR_INVOICE_DETAIL:(transactionId)  => ['repair', 'repair-invoice-detail', transactionId],
  },

  ESTIMATION: {
    LIST:   (params)          => ['estimation', 'list', params],
    DETAIL: (transactionId)   => ['estimation', 'detail', transactionId],
  },

  CRM: {
    PROMOTION:              (promoCode)   => ['crm', 'promotion', promoCode],
    PROMOTION_LIST:         ()            => ['crm', 'promotion-list'],
    GIFT_VOUCHER_CHECK:     (voucherCode) => ['crm', 'gift-voucher-check', voucherCode],
    // Walk-in leads/visits (2026-09-28) — merged in here rather than kept as
    // a second top-level CRM key, which silently overwrote this one (the
    // reported bug: QUERY_KEYS.CRM.VISITS was undefined because THIS object
    // literal, defined later in the file, won).
    LEADS:                  ()            => ['crm', 'leads'],
    SOURCES:                ()            => ['crm', 'sources'],
    VISITS:                 (companyId)   => ['crm', 'visits', companyId],
  },

  CUSTOMER_HISTORY: {
    TRANSACTIONS:      (customerId, companyId) => ['customer-history', 'transactions', customerId, companyId],
    ITEM_TRANSACTIONS: (customerId) => ['customer-history', 'item-transactions',  customerId],
    TOTAL_RECEIPTS:    (customerId) => ['customer-history', 'total-receipts',     customerId],
    TOTAL_PROMOTIONS:  (customerId) => ['customer-history', 'total-promotions',   customerId],
  },

  CUSTOMER_360: {
    ALL: (customerId) => ['customer-360', 'all', customerId],
  },

  SCHEMES: {
    LIST:                ()               => ['schemes', 'list'],
    ENROLLMENTS:         (params)         => ['schemes', 'enrollments', params],
    ENROLLMENT_DETAIL:   (enrollmentId)   => ['schemes', 'enrollment-detail', enrollmentId],
    CUSTOMER_ENROLLMENTS:(customerId, storeId) => ['schemes', 'enrollments', 'customer', customerId, storeId],
    RECEIPT_LIST:        (enrollmentId)   => ['schemes', 'receipts', enrollmentId],
    MONTHLY_DETAILS:     (enrollmentId)   => ['schemes', 'monthly-details', enrollmentId],
    MATURITY:            (enrollmentId)   => ['schemes', 'maturity',     enrollmentId],
    FORECLOSE:           (enrollmentId)   => ['schemes', 'foreclose',    enrollmentId],
    CANCELLATION:        (enrollmentId)   => ['schemes', 'cancellation', enrollmentId],
  },

  // external_product_id lives on StyleRow (Style/Retrieve), NOT ProductCatalogRow
  SHOPIFY: {
    PRODUCT_IMAGES: (externalProductId) => ['shopify', 'product-images', externalProductId],
  },

  // ── REVIEWS (Nector) ─────────────────────────────────────────────────────
  REVIEWS: {
    SUMMARY: (shopifyProductId) => ['reviews', 'summary', shopifyProductId],
    LIST:    (shopifyProductId) => ['reviews', 'list', shopifyProductId],
  },

  NECTOR: {
    CHECKOUT_INFO: (mobile, amount) => ['nector', 'checkout-info', mobile, amount],
    // OrnaVerse's own native LoyaltyCheckout integration (2026-09-28) — see
    // nectorService.js's header for why this is a separate, independent
    // mechanism from CHECKOUT_INFO above, not a rename of it.
    LOYALTY_CHECKOUT_SETTINGS: (companyId) => ['nector', 'loyalty-checkout-settings', companyId],
    LOYALTY_CHECKOUT_PREVIEW:  (partyId, cartAmount, companyId) =>
      ['nector', 'loyalty-checkout-preview', partyId, cartAmount, companyId],
  },

  // ── CUSTOM ─────────────────────────────────────────────────────
  CUSTOM: {
    ITEM: (entityId) => ['item', 'item', entityId],
    SIZES: (typeId) => ['item', 'sizes', typeId],
    TYPEDETAILS: (typeId) => ['custom', 'type-details', typeId],
    QUOTE: (params) => ['custom', 'quote', params]
  }
};