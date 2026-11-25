// src/lib/workflow/workflowOrdersClient.js
// SERVER-ONLY. Read-only view of the workflow panel's orders (website DB `order_workflows`),
// mapped to the POS workflow-orders API shape.
import { getWebsiteDb } from '@/lib/mongo/websiteClient';

const COLLECTION = 'order_workflows';
const MAX_LIMIT = 250;

const STAGE_SOURCES = [
  ['1_sales_review', 'salesReview'],
  ['2_cad_team', 'cadTeam'],
  ['3_yogi_action', 'yogiAction'],
  ['4_po_fulfillment', 'poFulfillment'],
  ['5_vendor_ops', 'vendorOps'],
  ['6_inward_qc', 'inwardQc'],
  ['7_certificate_team', 'certificateTeam'],
  ['8_invoicing_huid', 'invoicingHuid'],
  ['10_packaging', 'packaging'],
  ['11_shipping', 'shipping'],
];

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const contains = (s) => ({ $regex: escapeRegex(s), $options: 'i' });

function compact(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const out = Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && v.length === 0)),
  );
  return Object.keys(out).length ? out : null;
}

function toApiOrder(d, ticketDocs = new Map()) {
  const ship = d.shippingAddress ?? {};
  const fin = d.financials ?? {};
  const ticketNumber = d.orderNumber?.match(/^#ORD-(.+)$/)?.[1] ?? null;
  const erpDocumentNo = ticketNumber && ticketDocs.has(ticketNumber)
    ? ticketDocs.get(ticketNumber)
    : d.documentNo || d.stockAllocation?.documentNo || null;
  const stages = Object.fromEntries(
    STAGE_SOURCES.map(([key, field]) => [key, compact(d[field])]).filter(([, v]) => v),
  );
  if (d.stockAllocation) stages.stock_allocation = compact(d.stockAllocation);

  return {
    id: String(d._id),
    order_id: d.orderId != null ? String(d.orderId) : null,
    order_number: d.orderNumber ?? null,
    ticket_number: ticketNumber,
    po_number: d.poFulfillment?.poNumber || null,
    erp_document_no: erpDocumentNo,
    channel: d.channel ?? null,
    source_name: d.sourceName || null,
    current_step: d.currentStep ?? null,
    status: d.status ?? null,
    priority: d.priority ?? 'normal',
    assigned_to: d.assignedTo || null,
    total_amount: d.totalAmount ?? fin.totalPrice ?? 0,
    payment_mode: d.paymentMode ?? null,
    narration: d.narration || null,
    created_at: d.createdAt ?? null,
    updated_at: d.updatedAt ?? null,
    customer: {
      name: d.customer?.name || [d.customer?.firstName, d.customer?.lastName].filter(Boolean).join(' ') || null,
      phone: d.customer?.phone || null,
      email: d.customer?.email || null,
    },
    shipping_address: d.shippingAddress
      ? {
        address1: [ship.address1, ship.address2].filter(Boolean).join(', ') || d.customer?.address || null,
        city: ship.city || d.customer?.city || null,
        province: ship.province || ship.state || d.customer?.state || null,
        zip: ship.zip || ship.pincode || d.customer?.pincode || null,
        country: ship.country || null,
      }
      : null,
    items: (d.items ?? []).map((it) => ({
      title: it.title ?? null,
      sku: it.sku ?? null,
      quantity: it.quantity ?? 1,
      price: it.price ?? 0,
      image_url: it.imageUrl || null,
      variant_title: it.variantTitle || null,
      properties: it.properties ?? [],
    })),
    financials: {
      subtotal: fin.subtotalPrice ?? null,
      discounts: fin.totalDiscounts ?? null,
      total: fin.totalPrice ?? d.totalAmount ?? null,
      paid: fin.paidAmount ?? null,
      outstanding: fin.totalOutstanding ?? null,
      financial_status: fin.financialStatus ?? null,
    },
    erp_sync: d.erpSync
      ? { status: d.erpSync.status, syncedAt: d.erpSync.syncedAt ?? null, documentNo: erpDocumentNo, error: d.erpSync.errorMessage ?? null }
      : null,
    stages,
    timeline_logs: (d.logs ?? [])
      .map((l) => ({ step: l.step, action: l.action, timestamp: l.timestamp, user: l.performedBy || null, role: l.role || null, notes: l.notes || null }))
      .reverse(),
  };
}

/** Workflow orders that belong to one of these store codes (by OrnaVerse doc no. or ticket order no.). */
function storeFilter(codes) {
  const or = [];
  for (const code of codes) {
    const safe = escapeRegex(code);
    or.push(
      { documentNo: { $regex: `^${safe}-`, $options: 'i' } },
      { 'stockAllocation.documentNo': { $regex: `^${safe}-`, $options: 'i' } },
      { orderNumber: { $regex: `^#ORD-${safe}-`, $options: 'i' } },
    );
  }
  return { $or: or };
}

function buildFilter(params, { ignoreStep = false } = {}) {
  const and = [];
  if (Array.isArray(params.store_codes)) {
    if (!params.store_codes.length) return { _id: null };
    and.push(storeFilter(params.store_codes));
  }
  const search = String(params.search || params.query || '').trim();
  if (search) {
    const digits = search.replace(/\D/g, '');
    const or = [
      { orderNumber: contains(search) },
      { 'poFulfillment.poNumber': contains(search) },
      { documentNo: contains(search) },
      { 'stockAllocation.documentNo': contains(search) },
      { 'customer.name': contains(search) },
      { 'items.sku': contains(search) },
      { 'items.title': contains(search) },
    ];
    if (digits.length >= 4) or.push({ 'customer.phone': contains(digits.slice(-10)) });
    and.push({ $or: or });
  }
  if (params.order_number) and.push({ orderNumber: contains(String(params.order_number).trim()) });
  if (params.po_number) and.push({ 'poFulfillment.poNumber': contains(String(params.po_number).trim()) });
  if (params.document_no) {
    const doc = contains(String(params.document_no).trim());
    and.push({ $or: [{ documentNo: doc }, { 'stockAllocation.documentNo': doc }] });
  }

  const step = String(params.step || 'all').trim().toLowerCase();
  if (!ignoreStep && step && step !== 'all') {
    and.push({ currentStep: step === 'vendor_ops' || step === 'vendor_assignment' ? { $in: ['vendor_ops', 'vendor_assignment'] } : step });
  }
  const status = String(params.status || '').trim().toLowerCase();
  if (status && status !== 'all') and.push({ status });

  const created = {};
  if (/^\d{4}-\d{2}-\d{2}$/.test(params.from_date || '')) created.$gte = new Date(`${params.from_date}T00:00:00+05:30`);
  if (/^\d{4}-\d{2}-\d{2}$/.test(params.to_date || '')) created.$lte = new Date(`${params.to_date}T23:59:59.999+05:30`);
  if (Object.keys(created).length) and.push({ createdAt: created });

  return and.length ? { $and: and } : {};
}

export async function getWorkflowOrders(params = {}) {
  const limit = Math.min(Math.max(Number(params.limit) || 50, 1), MAX_LIMIT);
  const offset = Math.max(Number(params.offset) || 0, 0);
  const filter = buildFilter(params);

  const col = (await getWebsiteDb()).collection(COLLECTION);
  const [docs, total, stageRows] = await Promise.all([
    col.find(filter, { projection: { 'erpSync.rawResponse': 0 } })
      .sort({ createdAt: -1, _id: -1 })
      .skip(offset)
      .limit(limit)
      .toArray(),
    col.countDocuments(filter),
    col.aggregate([
      { $match: buildFilter(params, { ignoreStep: true }) },
      { $group: { _id: '$currentStep', n: { $sum: 1 } } },
    ]).toArray(),
  ]);
  const stage_counts = Object.fromEntries(stageRows.filter((r) => r._id).map((r) => [r._id, r.n]));
  const ticketDocs = await ticketDocumentNos(docs, params.env);

  return {
    success: true,
    meta: { total, limit, offset, returned: docs.length, stage_counts },
    data: docs.map((d) => toApiOrder(d, ticketDocs)),
  };
}

/** Map(ticket no. → the OrnaVerse order no. that ticket placed, or null) for the ticket orders among these workflow orders. */
async function ticketDocumentNos(docs, env) {
  const numbers = [...new Set(docs.map((d) => d.orderNumber?.match(/^#ORD-(.+)$/)?.[1]).filter(Boolean))];
  if (!numbers.length) return new Map();
  const tickets = await (await getWebsiteDb()).collection('pos_cad_tickets')
    .find({ ...(env ? { env } : {}), ticket_number: { $in: numbers } }, { projection: { ticket_number: 1, 'pos_order.document_no': 1 } })
    .toArray();
  return new Map(tickets.map((t) => [t.ticket_number, t.pos_order?.document_no ?? null]));
}

const ticketOrderNumbers = (ticket) => [...new Set([ticket.order_number, ticket.orderNumber, `#ORD-${ticket.ticket_number}`].filter(Boolean))];

/** The workflow panel's current stage for a ticket's order (matched by the panel order no., then the POS order no.), or null. */
export async function getWorkflowStatusForTicket(ticket) {
  const col = (await getWebsiteDb()).collection(COLLECTION);
  const projection = { orderNumber: 1, currentStep: 1, status: 1, updatedAt: 1 };
  const posDoc = ticket.pos_order?.document_no;
  const doc = await col.findOne({ orderNumber: { $in: ticketOrderNumbers(ticket) } }, { sort: { updatedAt: -1 }, projection })
    ?? (posDoc
      ? await col.findOne({ $or: [{ documentNo: posDoc }, { 'stockAllocation.documentNo': posDoc }], orderNumber: { $not: /^#ORD-/ } }, { sort: { updatedAt: -1 }, projection })
      : null);
  return doc
    ? { order_number: doc.orderNumber ?? null, current_step: doc.currentStep ?? null, status: doc.status ?? null, updated_at: doc.updatedAt ?? null }
    : null;
}

const TICKET_WORKFLOW = /^#ORD-(.+)$/;

/**
 * Workflow orders bound to these OrnaVerse order nos. — Map(documentNo → workflow doc). The panel links its own orders
 * to OrnaVerse orders, and for ticket orders ("#ORD-<ticket>") it can pick the wrong one (another order of the same
 * customer). The ticket records the order it really placed, so for those that pairing wins over the panel's link.
 */
async function findBoundWorkflows(docNos, env, projection) {
  if (!docNos.length) return new Map();
  const db = await getWebsiteDb();
  const envFilter = env ? { env } : {};
  const tickets = db.collection('pos_cad_tickets');
  const ticketProjection = { ticket_number: 1, order_number: 1, orderNumber: 1, 'pos_order.document_no': 1 };

  const placing = await tickets.find({ ...envFilter, 'pos_order.document_no': { $in: docNos } }, { projection: ticketProjection }).toArray();
  const workflows = await db.collection(COLLECTION).find({
    $or: [
      { documentNo: { $in: docNos } },
      { 'stockAllocation.documentNo': { $in: docNos } },
      ...(placing.length ? [{ orderNumber: { $in: placing.flatMap(ticketOrderNumbers) } }] : []),
    ],
  }, { projection: { ...projection, orderNumber: 1, documentNo: 1, 'stockAllocation.documentNo': 1, updatedAt: 1 } })
    .sort({ updatedAt: 1 })
    .toArray();

  const named = [...new Set(workflows.map((w) => w.orderNumber?.match(TICKET_WORKFLOW)?.[1]).filter(Boolean))];
  const known = new Set(placing.map((t) => t.ticket_number));
  const extra = named.filter((n) => !known.has(n));
  const allTickets = extra.length
    ? [...placing, ...await tickets.find({ ...envFilter, ticket_number: { $in: extra } }, { projection: ticketProjection }).toArray()]
    : placing;
  const ticketByOrderNumber = new Map(allTickets.flatMap((t) => ticketOrderNumbers(t).map((n) => [n, t])));

  const wanted = new Set(docNos);
  const out = new Map();
  for (const w of workflows) {
    const ticket = ticketByOrderNumber.get(w.orderNumber);
    const bound = ticket
      ? [ticket.pos_order?.document_no]
      : [w.documentNo, w.stockAllocation?.documentNo];
    for (const no of bound) if (no && wanted.has(no)) out.set(no, w);
  }
  return out;
}

/** Current stage per OrnaVerse order no. — { [documentNo]: { order_number, current_step, status, updated_at } }. */
export async function getWorkflowStatusesByDocumentNos(docNos, { env } = {}) {
  const bound = await findBoundWorkflows(docNos, env, { currentStep: 1, status: 1 });
  return Object.fromEntries([...bound].map(([no, d]) => [no, {
    order_number: d.orderNumber ?? null, current_step: d.currentStep ?? null, status: d.status ?? null, updated_at: d.updatedAt ?? null,
  }]));
}

/** The full workflow order (POS API shape) for one OrnaVerse order no., or null. */
export async function getWorkflowOrderByDocumentNo(docNo, { env } = {}) {
  const match = (await findBoundWorkflows([docNo], env, {})).get(docNo);
  if (!match) return null;
  const doc = await (await getWebsiteDb()).collection(COLLECTION)
    .findOne({ _id: match._id }, { projection: { 'erpSync.rawResponse': 0 } });
  return doc ? toApiOrder(doc, await ticketDocumentNos([doc], env)) : null;
}
