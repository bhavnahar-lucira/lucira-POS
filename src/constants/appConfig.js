const APP_CONFIG = {

  // ── METAL TYPE IDs ────────────────────────────────────────────────────────
  METAL_TYPES: {
    GOLD:      106,
    SILVER:    107,
    PLATINUM:  108,
    PALLADIUM: 109,
    ALLOY:     111,
  },

  // ── URD PURCHASE MASTER ITEMS ─────────────────────────────────────────────
  URD_MASTER_ITEMS: {
    GOLD: 46875,
  },

  CURRENCY: {
    INR_ID:     103,
    INR_CODE:   'INR',
    INR_SYMBOL: '₹',
  },

  // ── DOCUMENT TYPES ────────────────────────────────────────────────────────
  DOCUMENT_TYPES: {
    POS_INVOICE:     54,  // prefix "LJ"
    POS_ORDER:       53,  // prefix "RPO"
    RETURN:          55,  // prefix "PSR"
    CREDIT_NOTE:     123, // prefix "CRN"
    REFUND:          126, // prefix "RFD"
    POS_RECEIPT:     57,  // prefix "PRC"
    EXCHANGE:        56,  // prefix "EXC"
    BUYBACK:         97,  // prefix "BYB"
    URD_PURCHASE:    104, // prefix "URD"
    REPAIR_IN:       117, // prefix "REPI"
    REPAIR_OUT:      118, // prefix "RPO" (distinct document_id from POS_ORDER
                           // despite the same prefix text — this store's own config)
    REPAIR_INVOICE:  119, // prefix "RIN"
    SCHEME_RECEIPT:  99,  // prefix "SPY"
    SCHEME_ENROLLMENT: 125, // prefix "HO-SEN"
    ESTIMATION:      52,  // prefix "QTN" — same constant pricingService.js
    INTERSTORE_RETURN: 128,
  },

  // ── INTERSTORE RETURN ──────────────────────────────────────────────────────
  INTERSTORE_RETURN_STATUS: {
    DRAFT:                 0,
    PENDING_APPROVAL:      1,
    APPROVED:              2,
    PENDING_SETTLEMENT:    3,
    CLOSED:                4,
    REJECTED:              5,
    PERMANENTLY_CLOSED:    6,
    DEEMED_SUPPLY:         7,
  },
  INTERSTORE_RETURN_PATHWAY: {
    SAME_STORE:              1,
    COCO_CROSS_STORE:        2,
    FRANCHISEE_MEDIATED:     3,
  },
  INTERSTORE_RETURN_TRANSACTION_TYPE: {
    RETURN:   1,
    EXCHANGE: 2,
    BUYBACK:  3,
  },
  INTERSTORE_RETURN_SOURCE_PROCUREMENT_TYPE: {
    CONSIGNMENT_BASED: 1,
    PURCHASE_BASED:    2,
    PRE_ORNAVERSE:     3,
  },

  // ── COMPLIANCE ────────────────────────────────────────────────────────────
  COMPLIANCE: {
    PAN_MANDATORY_THRESHOLD: 200000,
    CASH_DAILY_LIMIT: 199999,
  },

  // ── TAX ───────────────────────────────────────────────────────────────────
  TAX: {
    GST_RATE: 0.03,
  },

  // ── PAGINATION ────────────────────────────────────────────────────────────
  // Take: 0 = fetch all (use only for small/static datasets)
  PAGINATION: {
    DEFAULT_TAKE:       50,
    CATALOG_TAKE:       100,
    ORDERS_TAKE:        50,
    INVOICES_TAKE:      100,
    TRANSACTIONS_TAKE:  50,   // returns, refunds, exchange, buyback, URD, repair
    SCHEMES_TAKE:       0,    // fetch all — small dataset
    CATEGORIES_TAKE:    0,    // fetch all — small static dataset
    CUSTOMERS_TAKE:     50,   // paginated browse
    CUSTOMERS_ALL_TAKE: 5000, // one-off full fetch for name search
    EMPLOYEES_ALL_TAKE: 5000, // one-off full fetch for name search
    ANALYTICS_TAKE:     12,   // months for revenue charts
  },

  // ── STALE TIMES (milliseconds) ────────────────────────────────────────────
  STALE_TIME: {
    STATIC:    30 * 60 * 1000, // 30 min — categories, payment modes, schemes, location
    CATALOG:    5 * 60 * 1000, // 5 min  — product catalog, item detail
    CUSTOMER:   5 * 60 * 1000, // 5 min  — customer data
    ORDERS:     2 * 60 * 1000, // 2 min  — orders, invoices, transactions
    STOCK:      1 * 60 * 1000, // 1 min  — live stock levels
    ANALYTICS: 10 * 60 * 1000, // 10 min — analytics charts (slow-changing)
    MASTER_DATA: 24 * 60 * 60 * 1000,
  },

  // ── SESSION ───────────────────────────────────────────────────────────────
  SESSION: {
    IDLE_TIMEOUT_MS:       10 * 60 * 1000,
    STAFF_IDLE_TIMEOUT_MS: 20 * 60 * 1000,
    WARNING_BEFORE:        30 * 1000,
  },

  SEARCH: {
    DEBOUNCE_MS:      300,
    MIN_QUERY_LENGTH:   2,
  },

  // ── PAYMENT MODES ─────────────────────────────────────────────────────────
  PAYMENT_MODES: {
    LOYALTY_MODE_TYPE: 11,
    ALLOWLIST: ['Cash', 'Credit Card', 'Debit Card', 'UPI'],
    DENYLIST: [
      'Exchange',
      'Return',
      'Old Gold',
      'Order Advance',
      'Scheme Payment',
      'scheme Enrollment',
      'Spin the Wheel',
      'Spin the Wheel :-Coin',
      'GoKwik',
      'Razorpay',
      'District - Zomato',
    ],
  },

  // ── REPAIR STAGES ─────────────────────────────────────────────────────────
  REPAIR: {
    STAGES: {
      INTAKE:   'intake',   // RepairIn created
      WORKSHOP: 'workshop', // RepairOut posted (with craftsman)
      READY:    'ready',    // RepairOut received back (RepairIn returned)
      INVOICED: 'invoiced', // RepairInvoice created and posted
    },
  },

  // ── ESTIMATION STATUSES ───────────────────────────────────────────────────
  ESTIMATION: {
    STATUSES: {
      DRAFT:     'draft',     // created, not yet posted
      CONVERTED: 'converted', // posted → became an invoice/order
      CANCELLED: 'cancelled', // customer declined
    },
  },

  // ── ORDER STATUS ───────────────────────────────────────────────────────────
  // document_status: 2 (Cancelled)              → CANCELLED
  // document_status: 0 (Draft)                  → DRAFT
  // document_status: 1 (Posted), balance <= 0                        → PAID
  // document_status: 1 (Posted), balance > 0 && receipt_amount > 0   → PARTIAL
  // document_status: 1 (Posted), balance > 0 && receipt_amount == 0  → DUE
  ORDER_STATUS: {
    PAID:      'paid',
    PARTIAL:   'partial',
    DUE:       'due',
    CANCELLED: 'cancelled',
    DRAFT:     'draft',
  },

};

export default APP_CONFIG;