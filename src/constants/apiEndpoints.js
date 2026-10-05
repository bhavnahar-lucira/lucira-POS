const API = {

  // ─────────────────────────────────────────────────────────────────────────
  // AUTHENTICATION
  // ─────────────────────────────────────────────────────────────────────────
  AUTH: {
    GENERATE_TOKEN: 'connect/token',
    REFRESH_TOKEN:  'connect/token',
    SWITCH_COMPANY: 'Account/SwitchCompany',
  },

  // Not under Services/ — Serenity's generic file-upload endpoint, used by
  // the Interstore Return photo-attach flow (see interstoreReturnService.js).
  FILES: {
    TEMPORARY_UPLOAD: 'File/TemporaryUpload',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // STORES
  // ─────────────────────────────────────────────────────────────────────────
  STORES: {
    GET_USER_STORES: 'Services/Administration/Stores/GetUserStores',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // HR — EMPLOYEE
  // ─────────────────────────────────────────────────────────────────────────
  HR: {
    EMPLOYEE_LIST: 'Services/HR/Employee/List',
  },

  SETTINGS: {
    GET_PAYMENT_MODES:        'Services/Administration/PaymentReceiptMode/List',
    GET_PAYMENT_MODES_REFUND: 'Services/Administration/PaymentReceiptMode/PaymentModesForRefund',
    GET_BANK_POS_ACCOUNTS:    'Services/Administration/BankPOS/List',
    GET_TAXES:                'Services/Common/GetTaxes',
    CHECK_METAL_RATE_TODAY:   'Services/Common/Common/CheckMetalRateForToday',
    GET_REASON_CODES:         'Services/Administration/Reason/List',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // LOCATION MASTER
  // ─────────────────────────────────────────────────────────────────────────
  LOCATION: {
    COUNTRIES: 'Services/Master/Countries/List',
    STATES:    'Services/Master/States/List',
    CITIES:    'Services/Master/Cities/List',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // CATEGORIES
  // ─────────────────────────────────────────────────────────────────────────
  CATEGORIES: {
    GET_TYPES:       'Services/Master/Type/List',
    GET_SUBTYPES:    'Services/Master/SubType/List',
    GET_SUBTYPE_DETAILS: 'Services/Master/SubTypeDetails/List',
    GET_ITEM_GROUPS: 'Services/Master/ItemGroups/List',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // ITEMS / PRODUCTS (Master data)
  // ─────────────────────────────────────────────────────────────────────────
  ITEMS: {
    LIST:          'Services/Master/Items/List',
    URD_LIST:      'Services/Master/AllItems/List',
    RETRIEVE:      'Services/Master/Items/Retrieve',
    SIZES:         'Services/Master/ItemsSizes/List',
    ATTRIBUTES:    'Services/Master/Attributes/List',
    DESIGNS:       'Services/Master/Style/GetDesigns',
    DESIGN_DETAIL: 'Services/Master/Style/Retrieve',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // CATALOG (Live store inventory)
  // ─────────────────────────────────────────────────────────────────────────
  CATALOG: {
    GET_PRODUCTS:              'Services/Inventory/ProductCatalog/List',
    GET_STOCK_BY_STORES:       'Services/Inventory/ProductCatalog/GetStockByStores',
    GET_STOCK_BY_STORES_BATCH: 'Services/Inventory/ProductCatalog/GetStockByStoresBatch',
  },

  INVENTORY: {
    GET_STOCK:          'Services/Inventory/GetStock',
    STOCK_JOURNAL_LIST: 'Services/Inventory/StockJournal/List',
    STOCK_JOURNAL_BOM_LIST: 'Services/Inventory/StockJournalBOM/List',
    ITEM_ENQUIRIES_CREATE: 'Services/POS/ItemEnquiries/Create',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // HELPERS (rate calculation)
  // ─────────────────────────────────────────────────────────────────────────
  HELPERS: {
    GET_RATE:           'Services/Helpers/GetRate',
    GET_LABOUR_RATE:    'Services/Helpers/GetLabourRate',
    GET_METAL_RATE:     'Services/Helpers/GetMetalRate',
    SET_SALES_ITEMS:    'Services/Helpers/SetSalesItems',
    SET_RETURN_ITEMS:   'Services/Helpers/SetReturnItems',
    SET_BUYBACK_ITEMS:  'Services/Helpers/SetBuyBackItems',
    SET_EXCHANGE_ITEMS: 'Services/Helpers/SetExchangeItems',
    SET_URD_ITEMS:      'Services/Helpers/SetURDItems',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // CUSTOMERS
  // ─────────────────────────────────────────────────────────────────────────
  CUSTOMERS: {
    GET_CUSTOMER: 'Services/POS/Customer/GetCustomer',
    LIST:         'Services/POS/Customer/List',
    RETRIEVE:     'Services/POS/Customer/Retrieve',
    CREATE:       'Services/POS/Customer/Create',
    UPDATE:       'Services/POS/Customer/Update',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // WALK-IN
  // ─────────────────────────────────────────────────────────────────────────
  WALKIN: {
    REGISTER: 'Services/POS/WalkIn/Register',
    LOOKUP: 'Services/POS/WalkIn/Lookup',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // PARTY (Customer 360)
  // ─────────────────────────────────────────────────────────────────────────
  PARTY: {
    RETRIEVE: 'Services/Master/Party/PartyRetrieve',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // ORDERS (POS native)
  // Flow: Create → (optional Update) → Post
  // Key: transaction_id | Number: document_no | Date: document_date
  // Amount: net_amount | Status DERIVED (not a field):
  //   balance_amount <= 0                        → "paid"
  //   balance_amount > 0 && receipt_amount > 0   → "partial"
  //   balance_amount > 0 && receipt_amount == 0  → "due"
  // ─────────────────────────────────────────────────────────────────────────
  ORDERS: {
    CREATE:         'Services/POS/Order/Create',
    UPDATE:         'Services/POS/Order/Update',
    POST:           'Services/POS/Order/Post',
    CANCEL:         'Services/POS/Order/Cancel',
    RETRIEVE:       'Services/POS/Order/Retrieve',
    RECEIPT_LIST:   'Services/POS/OrderReceipt/List',
    LIST:           'Services/POS/Order/List',
    APPLY_DISCOUNT: 'Services/POS/Order/ApplyAdditionalDiscount',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // ORDER FULFILLMENT
  // ─────────────────────────────────────────────────────────────────────────
  ORDER_FULFILLMENT: {
    READY_TO_INVOICE: 'Services/POS/OrderItems/List',
    ALL_OPEN:          'Services/Inventory/OrderItemFulfilment/List',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // INVOICES 
  // ─────────────────────────────────────────────────────────────────────────
  INVOICES: {
    CREATE:         'Services/POS/Invoice/Create',
    UPDATE:         'Services/POS/Invoice/Update',
    POST:           'Services/POS/Invoice/Post',
    CANCEL:         'Services/POS/Invoice/Cancel',
    RETRIEVE:       'Services/POS/Invoice/Retrieve',
    LIST:           'Services/POS/Invoice/List',
    GENERATE_PDF:   'Services/POS/Invoice/GeneratePDF',
    APPLY_DISCOUNT: 'Services/POS/Invoice/ApplyAdditionalDiscount',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // INVOICE RECEIPTS
  // ─────────────────────────────────────────────────────────────────────────
  INVOICE_RECEIPTS: {
    CREATE:           'Services/POS/InvoiceReceipt/Create',
    LIST:             'Services/POS/InvoiceReceipt/List',
    VALIDATE_VOUCHER: 'Services/POS/InvoiceReceipt/ValidateVoucher',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // INVOICE HELPERS
  // ─────────────────────────────────────────────────────────────────────────
  INVOICE_HELPERS: {
    RECEIPTS_SELECT:      'Services/POS/POSReceiptsSelect/List',
    GET_PARTY_DAILY_CASH: 'Services/POS/POSInvoice/GetPartyDailyCash', // unaffected — confirmed working on its own
  },

  // ─────────────────────────────────────────────────────────────────────────
  // RETURNS
  // ─────────────────────────────────────────────────────────────────────────
  RETURNS: {
    CREATE:     'Services/POS/Return/Create',
    POST:       'Services/POS/Return/Post',
    CANCEL:     'Services/POS/Return/Cancel',
    RETRIEVE:   'Services/POS/Return/Retrieve',
    LIST:       'Services/POS/Return/List',
    SOLD_ITEMS: 'Services/POS/InvoiceItems/List',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // REFUNDS
  // ─────────────────────────────────────────────────────────────────────────
  REFUNDS: {
    CREATE:           'Services/POS/Refund/Create',
    UPDATE:           'Services/POS/Refund/Update',
    DELETE:           'Services/POS/Refund/Delete',
    RETRIEVE:         'Services/POS/Refund/Retrieve',
    LIST:             'Services/POS/Refund/List',
    CUSTOMER_CREDITS: 'Services/POS/POSReceiptsSelect/List',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // CREDIT NOTES
  // ─────────────────────────────────────────────────────────────────────────
  CREDIT_NOTES: {
    CREATE:   'Services/POS/CreditNote/Create',
    POST:     'Services/POS/CreditNote/Post',
    CANCEL:   'Services/POS/CreditNote/Cancel',
    RETRIEVE: 'Services/POS/CreditNote/Retrieve',
    LIST:     'Services/POS/CreditNote/List',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // EXCHANGE
  // ─────────────────────────────────────────────────────────────────────────
  EXCHANGE: {
    CREATE:   'Services/POS/Exchange/Create',
    POST:     'Services/POS/Exchange/Post',
    CANCEL:   'Services/POS/Exchange/Cancel',
    RETRIEVE: 'Services/POS/Exchange/Retrieve',
    LIST:     'Services/POS/Exchange/List',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // BUY BACK
  // ─────────────────────────────────────────────────────────────────────────
  BUYBACK: {
    CREATE:   'Services/POS/BuyBack/Create',
    POST:     'Services/POS/BuyBack/Post',
    CANCEL:   'Services/POS/BuyBack/Cancel',
    RETRIEVE: 'Services/POS/BuyBack/Retrieve',
    LIST:     'Services/POS/BuyBack/List',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // URD PURCHASE (Old Gold / Unregistered Dealer)
  // ─────────────────────────────────────────────────────────────────────────
  URD_PURCHASE: {
    CREATE:   'Services/POS/URDPurchase/Create',
    POST:     'Services/POS/URDPurchase/Post',
    CANCEL:   'Services/POS/URDPurchase/Cancel',
    RETRIEVE: 'Services/POS/URDPurchase/Retrieve',
    LIST:     'Services/POS/URDPurchase/List',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // REPAIR
  // ─────────────────────────────────────────────────────────────────────────
  REPAIR: {
    REPAIR_ORDER_LIST:     'Services/Inventory/Repair/List',
    REPAIR_ORDER_RETRIEVE: 'Services/Inventory/Repair/Retrieve',
    REPAIR_ORDER_CREATE:   'Services/Inventory/Repair/Create',
    REPAIR_ORDER_POST:     'Services/Inventory/Repair/Post',
    REPAIR_ORDER_CANCEL:   'Services/Inventory/Repair/Cancel',
    REPAIR_SOLD_ITEMS:     'Services/POS/InvoiceItems/List',
    COMPANY_LOCATIONS:     'Services/Administration/CompanyWiseLocations/List',
    REPAIR_IN_CREATE:      'Services/POS/RepairIn/Create',
    REPAIR_IN_POST:        'Services/POS/RepairIn/Post',
    REPAIR_IN_CANCEL:      'Services/POS/RepairIn/Cancel',
    REPAIR_IN_RETRIEVE:    'Services/POS/RepairIn/Retrieve',
    REPAIR_IN_LIST:        'Services/POS/RepairIn/List',
    REPAIR_OUT_CREATE:     'Services/POS/RepairOut/Create',
    REPAIR_OUT_POST:       'Services/POS/RepairOut/Post',
    REPAIR_OUT_LIST:       'Services/POS/RepairOut/List',
    REPAIR_INVOICE_CREATE:   'Services/POS/RepairInvoice/Create',
    REPAIR_INVOICE_POST:     'Services/POS/RepairInvoice/Post',
    REPAIR_INVOICE_RETRIEVE: 'Services/POS/RepairInvoice/Retrieve',
    REPAIR_INVOICE_LIST:     'Services/POS/RepairInvoice/List',
    REPAIR_INVOICE_RECEIPT:  'Services/POS/RepairInvoiceReceipt/Create',
    REPAIR_INVOICE_HELPERS_GET_ADVANCES:  'Services/POS/POSRepairInvoice/GetAdvances',
    REPAIR_INVOICE_HELPERS_GET_SCHEME:    'Services/POS/POSRepairInvoice/GetScheme',
    REPAIR_INVOICE_HELPERS_GET_CREDIT:    'Services/POS/POSRepairInvoice/GetCreditNote',
    REPAIR_INVOICE_HELPERS_GET_EXCHANGE:  'Services/POS/POSRepairInvoice/GetExchange',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // INTERSTORE RETURN (IRR)
  // ─────────────────────────────────────────────────────────────────────────
  INTERSTORE_RETURN: {
    CREATE:               'Services/POS/InterstoreReturn/Create',
    UPDATE:               'Services/POS/InterstoreReturn/Update',
    DELETE:               'Services/POS/InterstoreReturn/Delete',
    RETRIEVE:             'Services/POS/InterstoreReturn/Retrieve',
    LIST:                 'Services/POS/InterstoreReturn/List',
    SUBMIT_FOR_APPROVAL:  'Services/POS/InterstoreReturn/SubmitForApproval',
    APPROVE:              'Services/POS/InterstoreReturn/Approve',
    REJECT:               'Services/POS/InterstoreReturn/Reject',
    RESUBMIT:             'Services/POS/InterstoreReturn/Resubmit',
    RETURN_TO_ORIGIN:     'Services/POS/InterstoreReturn/ReturnToOrigin',
    LOCAL_ABSORPTION:     'Services/POS/InterstoreReturn/LocalAbsorption',
    ADD_ITEM_IMAGE:       'Services/POS/InterstoreReturn/AddItemImage',
    REMOVE_ITEM_IMAGE:    'Services/POS/InterstoreReturn/RemoveItemImage',
    SOLD_ITEMS:           'Services/POS/InvoiceItems/List',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // ESTIMATION / QUOTATION
  // ─────────────────────────────────────────────────────────────────────────
  ESTIMATION: {
    CREATE:   'Services/POS/Estimation/Create',
    UPDATE:   'Services/POS/Estimation/Update',
    POST:     'Services/POS/Estimation/Post',
    CANCEL:   'Services/POS/Estimation/Cancel',
    RETRIEVE: 'Services/POS/Estimation/Retrieve',
    LIST:     'Services/POS/Estimation/List',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // DAILY CLOSING
  // ─────────────────────────────────────────────────────────────────────────
  DAILY_CLOSING: {
    CREATE:   'Services/POS/DailyClosing/Create',
    RETRIEVE: 'Services/POS/DailyClosing/Retrieve',
    LIST:     'Services/POS/DailyClosing/List',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // CRM
  // Promotions, gift vouchers, walk-in leads/visits
  // ─────────────────────────────────────────────────────────────────────────
  CRM: {
    GET_PROMOTION:                'Services/CRM/Promotion/GetPromotion',
    LIST:                         'Services/CRM/Promotion/List',
    APPLY_PROMOTIONS:             'Services/Helper/ApplyPromotions',
    REVERSE_PROMOTION:            'Services/Helper/ReversePromotion',
    GIFT_VOUCHER_CHECK_UTILIZATION: 'Services/CRM/GiftVoucherTransactions/CheckUtilization',
    GIFT_VOUCHER_REDEEM:          'Services/CRM/GiftVoucherTransactions/CheckRedeem',
    CUSTOMER_LIST:                'Services/CRM/Customer/List',
    SOURCES_LIST:                 'Services/CRM/Sources/List',
    CUSTOMER_VISITS_LIST:         'Services/CRM/CustomerVisits/List',
    LOYALTY_CHECKOUT_SETTINGS:    'Services/CRM/LoyaltyCheckout/GetSettings',
    LOYALTY_CHECKOUT_PREVIEW:     'Services/CRM/LoyaltyCheckout/Preview',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // CUSTOMER HISTORY
  // ─────────────────────────────────────────────────────────────────────────
  CUSTOMER_HISTORY: {
    TRANSACTIONS:      'Services/Reports/CustomerHistory/Transactions',
    ITEM_TRANSACTIONS: 'Services/Reports/CustomerHistory/ItemTransactions',
    TOTAL_RECEIPTS:    'Services/Reports/CustomerHistory/TotalReceipts',
    TOTAL_PROMOTIONS:  'Services/Reports/CustomerHistory/TotalPromotions',
    PARTY_TRANSACTIONS: 'Services/Reports/CustomerHistory/GetPartyTransactions',
    SALES_INSIGHTS:     'Services/Reports/CustomerHistory/GetSalesInsights',
  },
  
  REWARDS: {
    GET_POINTS:      'Services/CRM/CustomerRewards/GetCustomerPoints',
    LOYALTY_HISTORY: 'Services/CRM/CustomerRewards/LoyaltyHistories',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // SCHEMES (Jewellery savings/instalment schemes)
  // ─────────────────────────────────────────────────────────────────────────
  SCHEMES: {
    LIST:                'Services/CRM/Schemes/List',
    ENROLLMENTS_LIST:    'Services/POS/SchemeEnrollment/List',
    ENROLL:              'Services/POS/SchemeEnrollment/Create',
    ENROLLMENT_RETRIEVE: 'Services/POS/SchemeEnrollment/Retrieve',
    ENROLLMENT_UPDATE:   'Services/POS/SchemeEnrollment/Update',
    RECEIPT_CREATE:      'Services/POS/SchemeReceipt/Create',
    RECEIPT_LIST:        'Services/POS/SchemeReceipt/List',
    MONTHLY_DETAILS:     'Services/POS/SchemeMonthlyDetails/List',
    MATURITY_BENEFIT:    'Services/Helper/GetSchemeMaturityBenefit',
    FORECLOSE_BENEFIT:   'Services/Helper/GetSchemeForcloseBenefit',
    CANCELLATION:        'Services/Helper/GetSchemeCancellation',
    RULES_LIST:          'Services/CRM/SchemesRules/List',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // DOCUMENT CONFIG 
  // ─────────────────────────────────────────────────────────────────────────
  DOCUMENT_CONFIG: {
    FINANCIAL_YEAR_LIST:   'Services/Administration/FinancialYear/List',
    DOCUMENT_NUMBERING_LIST: 'Services/Administration/DocumentNumbering/List',
    DOCUMENT_REPORTS_LIST: 'Services/Administration/DocumentReports/List',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // REPORT RENDERING
  // ─────────────────────────────────────────────────────────────────────────
  REPORT_RENDER: {
    RENDER:       'Print/Render',
    PRINT_RENDER: 'Print/PrintRender',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // EXCHANGE RATE
  // ─────────────────────────────────────────────────────────────────────────
  EXCHANGE_RATE: {
    GET: 'Services/Administration/ExchangeRate/GetExchangeRate',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // COSTING — metal rates + tenant-wide policy configuration (return
  // window, cash limits, credit limits, etc. — see complianceService.js)
  // ─────────────────────────────────────────────────────────────────────────
  COSTING: {
    ADD_METAL_RATE: 'Services/Costing/MetalRates/Create',
    POLICY_LIST:    'Services/Costing/Policy/List',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // CUSTOM
  // ─────────────────────────────────────────────────────────────────────────
  CUSTOM: {
    ATTRIBUTES_DEFINITION_LIST: 'Services/Master/CustomAttributesDefinition/List',
    ATTRIBUTES_OPTIONS_LIST: 'Services/Master/CustomAttributesOptions/List',
    ATTRIBUTES_VALUES_LIST: 'Services/Master/CustomAttributesValues/List',
    CREATE_TEMP_VOUCHER: 'Services/POS/POSEstimationItems/CreateTempVoucher',
    TYPE_DETAILS_LIST: 'Services/Master/TypeDetails/List'
  },
};

export default API;