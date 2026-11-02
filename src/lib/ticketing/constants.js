export const TICKET_STATUS = {
  AWAITING_G2D:               'awaiting_g2d',
  G2D_SHARED:                 'g2d_shared',
  AWAITING_CAD:               'awaiting_cad',
  AWAITING_CUSTOMER_FEEDBACK: 'awaiting_customer_feedback',
  AWAITING_FINAL:             'awaiting_final',
  FINAL_RECEIVED:             'final_received',
  ORDER_PLACED:               'order_placed',
  CANCELLED:                  'cancelled',
};

export const TICKET_STATUS_LABELS = {
  awaiting_g2d:               'Awaiting G2D estimate',
  g2d_shared:                 'G2D estimate shared – customer to confirm',
  awaiting_cad:               'Awaiting CAD design',
  awaiting_customer_feedback: 'CAD design shared – customer to confirm',
  awaiting_final:             'Design approved – awaiting final details & SKU',
  final_received:             'Final details received – ready to place order',
  order_placed:               'Order placed',
  cancelled:                  'Cancelled',
};

export const ticketStatusLabel = (status) => TICKET_STATUS_LABELS[status]
  ?? (status ? String(status).replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : '—');

// What the POS writes for the workflow panel at each step, in the panel's own vocabulary.
export const PANEL_STATE = {
  G2D_REQUESTED: { status: 'g2d_requested',   status_label: 'G2D estimate requested',  team_label: 'with CAD' },
  CAD_DESIGN:    { status: 'cad_in_progress', status_label: 'CAD design in progress',  team_label: 'with CAD' },
  SKU_PENDING:   { status: 'sku_pending',     status_label: 'Customer approved CAD – SKU pending', team_label: 'with CAD' },
  CANCELLED:     { status: 'cancelled',       status_label: 'Cancelled',               team_label: 'Closed' },
};

// Extra details kept in the POS record for an advance paid by card (OrnaVerse's own bank account + reference
// number are captured with every non-cash mode).
const CARD_FIELDS = [
  { key: 'card_last4', label: 'Card last 4 digits', required: true, type: 'last4' },
  { key: 'approval_code', label: 'Approval code' },
];
export const advanceModeFields = (modeName) => (/card/i.test(modeName ?? '') ? CARD_FIELDS : []);

// OrnaVerse karat_id and the client rate code (useMetalRates) for each gold karat, keyed by the karat's number.
const GOLD_KARATS = {
  9:  { karatId: 835,  rateCode: '09' },
  14: { karatId: 85,   rateCode: '14' },
  18: { karatId: 86,   rateCode: '18' },
  22: { karatId: 87,   rateCode: '22' },
  24: { karatId: 1133, rateCode: '999' },
};
export const goldKarat = (karat) => GOLD_KARATS[Number(String(karat ?? '').match(/\d+/)?.[0])] ?? null;

export const CAD_REMINDER_DAYS = 10;

export const TICKET_FILE_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
export const TICKET_FILE_MAX_BYTES = 4 * 1024 * 1024;
export const TICKET_MAX_FILES = 10;
