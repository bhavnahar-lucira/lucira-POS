// src/lib/workflow/workflowConstants.js

export const WORKFLOW_STAGES = [
  {
    key: 'sales_review',
    stageKey: '1_sales_review',
    stepNumber: 1,
    label: 'Sales Review',
    shortLabel: 'Sales',
    description: 'Initial Sales Order Review',
  },
  {
    key: 'cad_team',
    stageKey: '2_cad_team',
    stepNumber: 2,
    label: 'CAD Team',
    shortLabel: 'CAD',
    description: 'CAD Design & Estimation',
  },
  {
    key: 'yogi_action',
    stageKey: '3_yogi_action',
    stepNumber: 3,
    label: 'Management Approval',
    shortLabel: 'Approval',
    description: 'Management Approval & ERP Push',
  },
  {
    key: 'po_fulfillment',
    stageKey: '4_po_fulfillment',
    stepNumber: 4,
    label: 'PO Fulfillment',
    shortLabel: 'PO',
    description: 'PO Generation & Inventory Fulfillment',
  },
  {
    key: 'vendor_ops',
    stageKey: '5_vendor_ops',
    alternateKeys: ['vendor_assignment'],
    stepNumber: 5,
    label: 'Vendor Ops',
    shortLabel: 'Vendor',
    description: 'Vendor Manufacturing & Ops',
  },
  {
    key: 'inward_qc',
    stageKey: '6_inward_qc',
    stepNumber: 6,
    label: 'Inward QC',
    shortLabel: 'QC',
    description: 'Quality Check & Physical Inspection',
  },
  {
    key: 'certificate_team',
    stageKey: '7_certificate_team',
    stepNumber: 7,
    label: 'Certificate Team',
    shortLabel: 'Cert',
    description: 'Diamond / Gemstone Certification',
  },
  {
    key: 'invoicing_huid',
    stageKey: '8_invoicing_huid',
    stepNumber: 8,
    label: 'HUID & Invoicing',
    shortLabel: 'HUID',
    description: 'Hallmarking & HUID Invoicing',
  },
  {
    key: 'purchase_invoice',
    stageKey: '9_purchase_invoice',
    stepNumber: 9,
    label: 'Purchase Invoice',
    shortLabel: 'PI',
    description: 'Purchase Invoice Verification',
  },
  {
    key: 'packaging',
    stageKey: '10_packaging',
    stepNumber: 10,
    label: 'Packaging',
    shortLabel: 'Pack',
    description: 'Box Packing & Labeling',
  },
  {
    key: 'shipping',
    stageKey: '11_shipping',
    stepNumber: 11,
    label: 'Shipping & Delivery',
    shortLabel: 'Shipping',
    description: 'Logistics, Tracking & Delivery',
  },
];

export const WORKFLOW_STEP_ORDER = WORKFLOW_STAGES.map((s) => s.key);

export function getStageMeta(stageKey) {
  if (!stageKey) return null;
  const normalized = String(stageKey).toLowerCase().replace(/^\d+_/, '');
  return (
    WORKFLOW_STAGES.find(
      (s) =>
        s.key === normalized ||
        s.stageKey === stageKey ||
        (s.alternateKeys && s.alternateKeys.includes(normalized))
    ) || {
      key: normalized,
      stageKey,
      stepNumber: 0,
      label: normalized.replace(/_/g, ' ').toUpperCase(),
      shortLabel: normalized,
      description: 'Workflow stage',
    }
  );
}

const TONE = {
  done: 'bg-status-in-stock/10 text-status-in-stock ring-1 ring-status-in-stock/20',
  active: 'bg-status-made-order/10 text-status-made-order ring-1 ring-status-made-order/20',
  error: 'bg-status-error/10 text-status-error ring-1 ring-status-error/20',
  neutral: 'bg-muted text-muted-foreground ring-1 ring-border',
};

export const WORKFLOW_STATUS_CONFIG = {
  pending: { label: 'Pending', classes: TONE.neutral },
  in_progress: { label: 'In progress', classes: TONE.active },
  in_production: { label: 'In production', classes: TONE.active },
  approved: { label: 'Approved', classes: TONE.done },
  completed: { label: 'Completed', classes: TONE.done },
  delivered: { label: 'Delivered', classes: TONE.done },
  cancelled: { label: 'Cancelled', classes: TONE.error },
  rejected: { label: 'Rejected', classes: TONE.error },
};

export const WORKFLOW_STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export const WORKFLOW_CHANNEL_LABELS = { 'shopify Admin API': 'Website', web: 'Ticket', store: 'Store', Amazon: 'Amazon' };

/** Where a workflow order came from, with the number that source gave it — "Website #3894", "Ticket HO-26-0001". */
export function workflowSourceLabel(order) {
  if (order.ticket_number) return `Ticket ${order.ticket_number}`;
  const source = WORKFLOW_CHANNEL_LABELS[order.channel] ?? order.channel ?? 'Order';
  return order.order_number ? `${source} ${order.order_number}` : source;
}
