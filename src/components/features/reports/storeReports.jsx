import PhoneLink from '@/components/shared/PhoneLink';
import { formatAmountOrDash } from '@/lib/priceUtils';
import { formatDatePadded } from '@/lib/dateUtils';

const amount = { align: 'right', format: formatAmountOrDash, total: true };
const count = { align: 'right', total: true };
const date = (v) => (v ? formatDatePadded(v) : '—');
const text = (v) => v || '—';
const phone = (v) => (v ? <PhoneLink phone={v} /> : '—');
const grams = (v) => (v == null ? '—' : Number(v).toFixed(3));
const signed = (v) => (v > 0 ? `+${v}` : String(v ?? 0));

export const STORE_COLUMNS = [
  { key: 'store_code', label: 'Store', mobile: true },
  { key: 'store_name', label: 'Store Name', filter: true },
];

const SESSION_NOTE = ['Store', 'OrnaVerse gives this list only for the store you are logged into. Super admins: switch store (top bar) to see another store.'];

/**
 * Day-to-day store reports. `dates`: 'range' uses the From–To dates; 'current' always shows the position right now.
 * `pivot` turns the server rows into the table shown (Collections: one row per store, one column per payment mode).
 */
export const STORE_REPORTS = {
  collections: {
    label: 'Collections',
    dates: 'range',
    filenamePrefix: 'collections',
    emptyMessage: 'No payments collected in this range.',
    pivot: (rows) => {
      const modes = [...new Set(rows.map((r) => r.mode))].sort();
      const byStore = new Map();
      for (const r of rows) {
        const row = byStore.get(r.company_id) ?? { company_id: r.company_id, store_code: r.store_code, store_name: r.store_name, total: 0 };
        row[`mode:${r.mode}`] = (row[`mode:${r.mode}`] ?? 0) + r.amount;
        row.total += r.amount;
        byStore.set(r.company_id, row);
      }
      return {
        rows: [...byStore.values()],
        columns: [
          ...STORE_COLUMNS,
          ...modes.map((m) => ({ key: `mode:${m}`, label: m, ...amount })),
          { key: 'total', label: 'Total Collected', ...amount, mobile: true },
        ],
      };
    },
    notes: [
      ['Source', 'OrnaVerse’s POS Dashboard “Payment Collections”, one store at a time — the same figures OrnaVerse shows.'],
      ['Day-end', 'Tap Today for the day’s closing figure. Any date range works; amounts are everything received in it.'],
      ['What counts', 'Money received in the range, by payment mode, exactly as OrnaVerse’s POS Dashboard counts it (amounts include GST).'],
      ['Cancelled', 'OrnaVerse keeps payments taken against a bill or order that was cancelled later, so totals can be higher than sales.'],
      ['Daily Closing', 'OrnaVerse’s own Daily Closing document has never been used at any store, so this view is the day-end reference.'],
    ],
  },

  orderStatus: {
    label: 'Order Status',
    dates: 'range',
    filenamePrefix: 'order-status',
    emptyMessage: 'No orders booked in this range.',
    columns: [
      { key: 'document_no', label: 'Order No.', mobile: true },
      { key: 'order_date', label: 'Order Date', format: date },
      { key: 'party_name', label: 'Customer', mobile: true },
      { key: 'mobile', label: 'Mobile', format: phone },
      { key: 'item_name', label: 'Item', format: text },
      { key: 'item_code', label: 'Design', hidden: true },
      { key: 'status', label: 'Status', filter: true, filterAlways: true, mobile: true },
      { key: 'delivery_date', label: 'Promised By', format: date },
      { key: 'days_late', label: 'Days Late', align: 'right', format: (v) => (v ? `${v}` : '—') },
      { key: 'bill_no', label: 'Bill No.', format: text },
      { key: 'pieces', label: 'Pieces', ...count, hidden: true },
      { key: 'weight', label: 'Weight (g)', align: 'right', format: grams, hidden: true },
      { key: 'net_amount', label: 'Order Value', ...amount },
    ],
    notes: [
      ['Source', 'OrnaVerse “Order Tracking V2”: one row per ordered item, for orders booked in the date range.'],
      ['Status', 'OrnaVerse’s own stage — New, PO Generated (sent to production), Ready to Invoice (piece is ready), Invoice Pending, Shipped (billed to the customer), Cancelled. Use the Status filter for what needs action.'],
      ['Promised By', 'The delivery date on the order. Days Late counts days past it for items not yet shipped or cancelled.'],
      ['Bill No.', 'The invoice the item was billed on, once billed.'],
      ['Order Value', 'Item value including GST.'],
    ],
  },

  balanceDue: {
    label: 'Balance Due',
    dates: 'current',
    filenamePrefix: 'balance-due',
    emptyMessage: 'No open orders with a balance to collect.',
    columns: [
      { key: 'document_no', label: 'Order No.', mobile: true },
      { key: 'order_date', label: 'Order Date', format: date },
      { key: 'party_name', label: 'Customer' },
      { key: 'mobile', label: 'Mobile', format: phone },
      { key: 'employee_name', label: 'Jewelry Consultant', format: text, filter: true },
      { key: 'delivery_date', label: 'Promised By', format: date },
      { key: 'days_open', label: 'Days Open', align: 'right' },
      { key: 'net_amount', label: 'Order Value', ...amount },
      { key: 'receipt_amount', label: 'Received', ...amount },
      { key: 'balance_amount', label: 'Balance Due', ...amount, mobile: true },
    ],
    notes: [
      ['Source', 'OrnaVerse “Open POS Orders”: every open order still to be billed, from any date.'],
      ['Balance Due', 'Order value (incl. GST) minus advances received. Only orders with more than ₹1 due are listed.'],
      ['Bills', 'Store bills are settled in full when they are made, so money still to collect sits on open orders.'],
      ['Current', 'Shows the position right now; the date range doesn’t apply.'],
    ],
  },

  credits: {
    label: 'Customer Credits',
    dates: 'current',
    filenamePrefix: 'customer-credits',
    emptyMessage: 'No customers holding credit.',
    columns: [
      { key: 'party_name', label: 'Customer', mobile: true },
      { key: 'advance', label: 'Advance', ...amount },
      { key: 'credit_note', label: 'Credit Note', ...amount },
      { key: 'return_amount', label: 'Return', ...amount },
      { key: 'exchange', label: 'Exchange', ...amount },
      { key: 'urd_purchase', label: 'URD', ...amount },
      { key: 'amount', label: 'Credit Available', ...amount, mobile: true },
    ],
    notes: [
      ['Source', 'OrnaVerse “Customer Credits Summary”, one store at a time.'],
      ['Credit Available', 'Unused advances, credit notes, returns, exchanges and old-gold (URD) value the customer can put towards a purchase.'],
      ['Store-wise', 'Counts credit created at this store minus what was used here. A customer may hold more in total across stores — the customer profile / checkout shows the full amount.'],
      ['Current', 'Shows the position right now; the date range doesn’t apply.'],
    ],
  },

  schemeDues: {
    label: 'Scheme Dues',
    dates: 'current',
    sessionStore: true,
    filenamePrefix: 'scheme-dues',
    emptyMessage: 'No scheme instalments due.',
    columns: [
      { key: 'party_name', label: 'Customer', mobile: true },
      { key: 'mobile', label: 'Mobile', format: phone },
      { key: 'scheme', label: 'Scheme', filter: true },
      { key: 'document_no', label: 'Enrollment No.' },
      { key: 'enrolled_on', label: 'Enrolled', format: date, hidden: true },
      { key: 'paid_count', label: 'Paid', align: 'right', format: (v, r) => `${v}${r?.tenure ? ` / ${r.tenure}` : ''}` },
      { key: 'due_count', label: 'Instalments Due', ...count },
      { key: 'due_amount', label: 'Amount Due', ...amount, mobile: true },
      { key: 'oldest_due', label: 'Due Since', format: date },
      { key: 'days_overdue', label: 'Days Overdue', align: 'right' },
      { key: 'status', label: 'Status', filter: true, filterAlways: true },
    ],
    notes: [
      ['Source', 'OrnaVerse scheme enrollments and their monthly instalment schedule.'],
      ['Who', 'Active enrollments with at least one unpaid instalment whose due date is today or earlier.'],
      ['Status', 'Due = falls due today; In grace period = past due but within the scheme’s grace days; Overdue = past the grace days.'],
      SESSION_NOTE,
    ],
  },

  repairs: {
    label: 'Repairs',
    dates: 'current',
    sessionStore: true,
    filenamePrefix: 'repairs',
    emptyMessage: 'No repair orders at this store.',
    columns: [
      { key: 'document_no', label: 'Repair No.', mobile: true },
      { key: 'repair_date', label: 'Date', format: date },
      { key: 'party_name', label: 'Customer' },
      { key: 'items', label: 'Item', format: text },
      { key: 'pieces', label: 'Pieces', ...count, hidden: true },
      { key: 'weight', label: 'Weight (g)', align: 'right', format: grams, hidden: true },
      { key: 'status', label: 'Status', filter: true, filterAlways: true, mobile: true },
      { key: 'days_open', label: 'Days Open', align: 'right', format: (v) => (v == null ? '—' : v) },
      { key: 'billed_on', label: 'Repair Bill', format: text },
    ],
    notes: [
      ['Source', 'OrnaVerse repair orders (REP) and repair bills (RIN) — the same statuses as the Repair screen.'],
      ['Status', 'Not sent to HO = still at the store; Sent to HO = transferred for repair; At workshop = sent to an outside workshop; Billed = repair bill (RIN) made for it.'],
      ['Days Open', 'Days since the repair was booked, for repairs not yet billed or cancelled.'],
      SESSION_NOTE,
    ],
  },

  stockAging: {
    label: 'Stock Aging',
    dates: 'current',
    filenamePrefix: 'stock-aging',
    emptyMessage: 'No stock at this store.',
    columns: [
      { key: 'item_code', label: 'Design', mobile: true },
      { key: 'sku', label: 'SKU', format: text },
      { key: 'type_name', label: 'Category', filter: true },
      { key: 'sub_type_name', label: 'Sub Category', hidden: true },
      { key: 'collection_name', label: 'Collection', hidden: true },
      { key: 'total_pieces', label: 'Pieces', ...count },
      { key: 'pieces30', label: '0–30 days', ...count },
      { key: 'pieces60', label: '31–60', ...count },
      { key: 'pieces120', label: '61–120', ...count },
      { key: 'pieces180', label: '121–180', ...count },
      { key: 'pieces270', label: '181–270', ...count },
      { key: 'pieces360', label: '271–360', ...count },
      { key: 'pieces360_plus', label: '360+', ...count },
      { key: 'over_180', label: 'Over 180 days', ...count, mobile: true },
    ],
    notes: [
      ['Source', 'OrnaVerse “Stock Aging (Branch Wise)”, one store at a time.'],
      ['Age', 'Pieces grouped by how long they have been in stock, using OrnaVerse’s own age buckets. Over 180 days = 181–270 + 271–360 + 360+.'],
      ['Current', 'Stock held right now; the date range doesn’t apply. Sort by Over 180 days to find slow pieces to push.'],
    ],
  },

  stockMovement: {
    label: 'Stock Movement',
    dates: 'current',
    filenamePrefix: 'stock-movement',
    emptyMessage: 'No stock at this store.',
    columns: [
      { key: 'type_name', label: 'Category', mobile: true },
      { key: 'yes_pieces', label: 'Yesterday Pcs', ...count },
      { key: 'today_pieces', label: 'Today Pcs', ...count },
      { key: 'change_pieces', label: 'Change Pcs', ...count, format: signed, mobile: true },
      { key: 'yes_weight', label: 'Yesterday Wt (g)', ...count, format: grams },
      { key: 'today_weight', label: 'Today Wt (g)', ...count, format: grams },
      { key: 'change_weight', label: 'Change Wt (g)', ...count, format: (v) => (v > 0 ? `+${grams(v)}` : grams(v)) },
      { key: 'today_diamond_weight', label: 'Diamond Wt Today (ct)', ...count, format: grams, hidden: true },
    ],
    notes: [
      ['Source', 'OrnaVerse “Stock Summary (Yesterday Vs Today)”, one store at a time.'],
      ['Yesterday', 'Stock at the end of yesterday. Today = stock right now.'],
      ['Change', 'Today minus yesterday: minus = sold / sent out today, plus = received today.'],
    ],
  },

  discounts: {
    label: 'Discounts',
    dates: 'range',
    filenamePrefix: 'item-discounts',
    emptyMessage: 'No bills in this range.',
    columns: [
      { key: 'document_no', label: 'Bill No.', mobile: true },
      { key: 'bill_date', label: 'Date', format: date },
      { key: 'employee_name', label: 'Jewelry Consultant', format: text, filter: true },
      { key: 'party_name', label: 'Customer', hidden: true },
      { key: 'item_name', label: 'Item', format: text },
      { key: 'sku', label: 'SKU', hidden: true },
      { key: 'type_name', label: 'Category', filter: true, hidden: true },
      { key: 'gross_amount', label: 'Price', ...amount },
      { key: 'diamond_discount', label: 'Diamond Disc.', ...amount },
      { key: 'making_discount', label: 'Making Disc.', ...amount },
      { key: 'metal_discount', label: 'Metal Disc.', ...amount, hidden: true },
      { key: 'color_stone_discount', label: 'Stone Disc.', ...amount, hidden: true },
      { key: 'discount', label: 'Total Discount', ...amount, mobile: true },
      {
        key: 'discount_percent', label: 'Disc. %', align: 'right', format: (v) => `${v ?? 0}%`,
        total: (rows) => {
          const gross = rows.reduce((s, r) => s + (r.gross_amount || 0), 0);
          const disc = rows.reduce((s, r) => s + (r.discount || 0), 0);
          return gross > 0 ? Math.round((disc / gross) * 1000) / 10 : 0;
        },
      },
      { key: 'taxable_amount', label: 'After Discount', ...amount },
      { key: 'net_amount', label: 'Bill Value (incl. GST)', ...amount, hidden: true },
    ],
    notes: [
      ['Source', 'OrnaVerse “Item Discounts”: every item billed in the range, posted bills only.'],
      ['Price', 'Item price before discount, excl. GST. After Discount = Price − Total Discount — the same pre-GST value used for RTS / MTO on Sales Summary.'],
      ['Discount', 'Everything taken off the item — promotions and manual discounts — split by part (diamond, making, metal, stone) as OrnaVerse records it.'],
      ['Disc. %', 'Total Discount ÷ Price. The total row is the overall % for the rows shown, not an average.'],
    ],
  },
};

export const STORE_REPORT_TABS = Object.entries(STORE_REPORTS).map(([key, r]) => ({ key, label: r.label }));
