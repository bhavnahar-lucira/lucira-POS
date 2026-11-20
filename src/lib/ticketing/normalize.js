// The lucirajewelry.cloud workflow panel writes its CAD fields (cadVersions, status 'cad_shared'/'ok', …)
// onto the same ticket documents; this maps them to the POS view of a ticket.
import { TICKET_STATUS, TICKET_FORMAT_MULTI } from './constants';

const CAD_BASE_URL = 'https://lucirajewelry.cloud';

export const versionLabel = (version) => `V${String(version).replace(/^v/i, '')}`;

const versionParts = (version) => String(version).replace(/^v/i, '').split('.').map((n) => Number(n) || 0);

export function compareVersions(a, b) {
  const pa = versionParts(a);
  const pb = versionParts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff) return diff;
  }
  return 0;
}

const absoluteCadUrl = (url) => (/^https?:\/\//i.test(url) ? url : `${CAD_BASE_URL}/${String(url).replace(/^\//, '')}`);

/** Designs shared by the CAD panel, newest first, each with the store's recorded customer decision. */
export function ticketDesigns(ticket) {
  const decisions = new Map((ticket.design_decisions ?? []).map((d) => [d.version, d]));
  const byVersion = new Map();
  for (const v of ticket.cadVersions ?? []) {
    if (v?.version != null) byVersion.set(String(v.version), v);
  }
  // The panel sometimes shares a CAD image only in its timeline, without cadVersions. Its top-level
  // cadImageUrl is not used: the panel also puts the G2D estimate image there.
  if (!byVersion.size) {
    const shared = ticket.timeline?.findLast((t) => t.stage === 'cad_shared' && t.imageUrl);
    if (shared) {
      const version = String(ticket.cadVersion ?? 'v1.0');
      byVersion.set(version, { version, imageUrl: shared.imageUrl, notes: shared.description, uploadedAt: shared.timestamp });
    }
  }
  return [...byVersion.values()]
    .map((v) => {
      const version = String(v.version);
      const url = v.imageUrl ?? v.filePath;
      const decision = decisions.get(version);
      return {
        version,
        label: versionLabel(version),
        files: url ? [{ url: absoluteCadUrl(url), file_name: v.fileName ?? `Design ${versionLabel(version)}` }] : [],
        cad_notes: v.notes ?? null,
        uploaded_at: v.uploadedAt ?? null,
        uploaded_by: v.uploadedBy ?? null,
        customer_decision: decision?.decision ?? null,
        customer_feedback: decision?.feedback ?? null,
        decided_at: decision?.decided_at ?? null,
        decided_by: decision?.decided_by ?? null,
      };
    })
    .sort((a, b) => compareVersions(b.version, a.version));
}

/** Status from the ticket's data rather than the raw field, which the panel sets in its own vocabulary. */
export function effectiveStatus(ticket, designs = ticketDesigns(ticket), g2d = g2dEstimates(ticket), { requireConfirmation = false } = {}) {
  if (ticket.status === TICKET_STATUS.CANCELLED) return TICKET_STATUS.CANCELLED;
  // Only an order the POS itself placed in OrnaVerse counts; the panel's own order_number is its manufacturing order.
  if (ticket.pos_order?.transaction_id) return TICKET_STATUS.ORDER_PLACED;
  const design = designs[0];
  if (design) {
    if (!design.customer_decision) return TICKET_STATUS.AWAITING_CUSTOMER_FEEDBACK;
    if (design.customer_decision !== 'approved') return TICKET_STATUS.AWAITING_CAD;
    return ticket.estimation ? TICKET_STATUS.FINAL_RECEIVED : TICKET_STATUS.AWAITING_FINAL;
  }
  const estimate = g2d[0];
  if (!estimate) return ticket.status === 'g2d_shared' ? TICKET_STATUS.G2D_SHARED : TICKET_STATUS.AWAITING_G2D;
  if (!estimate.customer_decision) return TICKET_STATUS.G2D_SHARED;
  if (estimate.customer_decision !== 'approved') return TICKET_STATUS.AWAITING_G2D;
  // In a multi-product ticket CAD starts only once the ticket's order (and advance) is confirmed.
  return requireConfirmation && !ticket.order_details ? TICKET_STATUS.G2D_APPROVED : TICKET_STATUS.AWAITING_CAD;
}

// Panel history entries carry `time` ('YYYY-MM-DD HH:mm', UTC) and `author` ('name · from → to') instead of `at`/`user`.
const historyAt = (h) => h.at ?? (h.time ? new Date(`${h.time.replace(' ', 'T')}Z`) : null);
const historyUser = (h) => h.user ?? (h.author ? h.author.split(' · ')[0] : 'CAD team');
const normalizeHistoryEntry = (h) => (h.at && h.user ? h : { ...h, at: historyAt(h), user: historyUser(h) });

const isBlank = (v) => v == null || v === '' || v === 'blank';

/** G2D estimate rounds shared by the panel, newest first. */
export function g2dEstimates(ticket) {
  const decisions = new Map((ticket.g2d_decisions ?? []).map((d) => [d.round, d]));
  const sharedSteps = (ticket.timeline ?? []).filter((t) => t.stage === 'g2d_shared');
  let previous = [];
  return (ticket.history ?? [])
    .filter((h) => h.action === 'share_g2d_estimate')
    .map((h, i) => {
      const urls = [...new Set([h.thumbnail, sharedSteps[i]?.imageUrl].filter((u) => typeof u === 'string' && u))];
      const own = (Array.isArray(h.changes) ? h.changes : []).map((c) => ({
        field: c.field, from: isBlank(c.from) ? null : String(c.from), to: isBlank(c.to) ? null : String(c.to),
      }));
      // The panel logs only the fields it touched, so carry the rest forward from the earlier round.
      const changes = [
        ...previous.filter((p) => p.to != null && !own.some((c) => c.field === p.field)).map((p) => ({ field: p.field, from: p.to, to: p.to })),
        ...own,
      ];
      previous = changes;
      return {
        round: i + 1,
        at: historyAt(h),
        by: historyUser(h),
        note: h.note || null,
        changes,
        files: urls.map((url, n) => ({ url: absoluteCadUrl(url), file_name: `G2D estimate ${i + 1}${urls.length > 1 ? `-${n + 1}` : ''}` })),
        customer_decision: decisions.get(i + 1)?.decision ?? null,
        customer_feedback: decisions.get(i + 1)?.feedback ?? null,
        decided_at: decisions.get(i + 1)?.decided_at ?? null,
        decided_by: decisions.get(i + 1)?.decided_by ?? null,
      };
    })
    .reverse();
}

/** The workflow panel's final data (its `estimation` object) plus its manufacturing order reference, or null. */
export function finalDetails(ticket) {
  const est = ticket.estimation;
  if (!est) return null;
  const created = ticket.history?.findLast((h) => h.action === 'order_created');
  // Multi-product tickets: the panel saves the line item and totals flat, in snake_case.
  const lineItem = est.lineItem ?? {
    item_name: est.item_name, category: est.category, item_size_name: est.item_size_name,
    sku: est.sku, design_code: est.design_code, image: est.image,
  };
  return {
    ...est,
    lineItem,
    subTotal: est.subTotal ?? est.sub_total,
    taxAmount: est.taxAmount ?? est.tax_amount,
    roundOff: est.roundOff ?? est.round_off,
    netAmount: est.netAmount ?? est.net_amount,
    manufacturing_order_number: ticket.orderNumber ?? ticket.order_number ?? est.order_number ?? null,
    received_at: created?.at ?? ticket.order_placed_at ?? est.saved_at ?? null,
    received_by: created?.user ?? ticket.orderCreatedBy ?? est.saved_by ?? null,
    panel_status_label: ticket.status_label ?? null,
  };
}

const REQUEST_SPEC_KEYS = ['category', 'metal', 'karat', 'size', 'budget', 'gold_weight', 'requirement_notes', 'description'];

/** The store's original request; the panel writes its own values into `specs`, so older tickets are rebuilt from it. */
export function requestedSpecs(ticket) {
  if (ticket.requested_specs) return ticket.requested_specs;
  const specs = Object.fromEntries(REQUEST_SPEC_KEYS.map((k) => [k, ticket.specs?.[k] ?? null]));
  const goldBefore = ticket.history?.find((h) => h.action === 'share_g2d_estimate' && Array.isArray(h.changes))
    ?.changes.find((c) => c.field === 'Gold weight (g)')?.from;
  if (!isBlank(goldBefore) && Number.isFinite(Number(goldBefore))) specs.gold_weight = Number(goldBefore);
  return specs;
}

export const isMultiTicket = (ticket) => ticket?.format === TICKET_FORMAT_MULTI;

/** A product of a multi-product ticket, seen as a single-product ticket so the per-ticket helpers apply to it. */
export function itemView(ticket, item) {
  return {
    ...item,
    status: ticket.status === TICKET_STATUS.CANCELLED ? TICKET_STATUS.CANCELLED : item.status,
    pos_order: ticket.pos_order ?? null,
  };
}

export function itemStatus(ticket, item) {
  const view = itemView(ticket, item);
  return effectiveStatus(view, ticketDesigns(view), g2dEstimates(view), { requireConfirmation: true });
}

export const isActiveItem = (ticket, item) => itemStatus(ticket, item) !== TICKET_STATUS.CANCELLED;

function toPublicItem(ticket, item) {
  const view = itemView(ticket, item);
  const designs = ticketDesigns(view);
  const g2d = g2dEstimates(view);
  return {
    item_id: item.item_id,
    item_seq: item.item_seq,
    specs: item.specs ?? {},
    requested_specs: requestedSpecs(item),
    reference_images: item.reference_images ?? [],
    status: effectiveStatus(view, designs, g2d, { requireConfirmation: true }),
    panel_status: item.status ?? null,
    panel_status_label: item.status_label ?? null,
    designs,
    g2d_estimates: g2d,
    latest_design_label: designs[0]?.label ?? null,
    cad_remarks: item.cadRemarks ?? null,
    final_details: finalDetails(item),
    final_revisions: item.final_revisions ?? [],
    order_details: item.order_details ?? null,
    awaiting_cad_since: item.awaiting_cad_since ?? null,
    created_at: item.created_at ?? null,
    cancel_reason: item.cancel_reason ?? null,
    cancelled_at: item.cancelled_at ?? null,
    cancelled_by: item.cancelled_by ?? null,
  };
}

const STAGE_ORDER = [
  TICKET_STATUS.AWAITING_G2D, TICKET_STATUS.G2D_SHARED, TICKET_STATUS.G2D_APPROVED, TICKET_STATUS.AWAITING_CAD,
  TICKET_STATUS.AWAITING_CUSTOMER_FEEDBACK, TICKET_STATUS.AWAITING_FINAL, TICKET_STATUS.FINAL_RECEIVED,
];

/** Ticket-level status of a multi-product ticket from its active products. */
export function multiTicketStatus(ticket, statuses) {
  if (ticket.status === TICKET_STATUS.CANCELLED) return TICKET_STATUS.CANCELLED;
  if (ticket.pos_order?.transaction_id) return TICKET_STATUS.ORDER_PLACED;
  const active = statuses.filter((s) => s !== TICKET_STATUS.CANCELLED);
  if (!active.length) return TICKET_STATUS.CANCELLED;
  if (active.every((s) => s === TICKET_STATUS.FINAL_RECEIVED)) return TICKET_STATUS.FINAL_RECEIVED;
  if (canConfirmOrder(active)) return TICKET_STATUS.READY_TO_CONFIRM;
  return TICKET_STATUS.IN_PROGRESS;
}

/** Every active product not yet confirmed is G2D-approved, and at least one is waiting for confirmation. */
export function canConfirmOrder(activeStatuses) {
  const unconfirmed = activeStatuses.filter((s) => STAGE_ORDER.indexOf(s) <= STAGE_ORDER.indexOf(TICKET_STATUS.G2D_APPROVED));
  return unconfirmed.length > 0 && unconfirmed.every((s) => s === TICKET_STATUS.G2D_APPROVED);
}

const normalizeComment = (c) => ({
  id: c.id ?? null,
  item_id: c.item_id ?? null,
  text: c.text ?? c.message ?? '',
  author: c.author ?? 'CAD team',
  team: c.team === 'store' ? 'store' : (c.team ?? 'cad').toLowerCase(),
  store_code: c.store_code ?? null,
  at: c.at ?? c.created_at ?? null,
});

export const ticketComments = (ticket) => (ticket.comments ?? [])
  .map(normalizeComment)
  .sort((a, b) => new Date(a.at ?? 0) - new Date(b.at ?? 0));

function toPublicMultiTicket(ticket) {
  const { _id, items: rawItems = [], ...rest } = ticket;
  const items = [...rawItems].sort((a, b) => a.item_seq - b.item_seq).map((item) => toPublicItem(ticket, item));
  const active = items.filter((i) => i.status !== TICKET_STATUS.CANCELLED);
  const itemHistory = rawItems.flatMap((item) => (item.history ?? []).map((h) => ({ ...normalizeHistoryEntry(h), item_id: item.item_id })));
  const budgets = active.map((i) => Number(i.requested_specs?.budget)).filter((n) => Number.isFinite(n) && n > 0);
  return {
    ...rest,
    format: TICKET_FORMAT_MULTI,
    status: multiTicketStatus(ticket, items.map((i) => i.status)),
    items,
    active_item_count: active.length,
    budget_total: budgets.length ? budgets.reduce((t, n) => t + n, 0) : null,
    comments: ticketComments(ticket),
    ...(ticket.history && {
      history: [...ticket.history.map(normalizeHistoryEntry), ...itemHistory].sort((a, b) => new Date(a.at ?? 0) - new Date(b.at ?? 0)),
    }),
  };
}

export function toPublicTicket(ticket) {
  if (!ticket) return null;
  if (isMultiTicket(ticket)) return toPublicMultiTicket(ticket);
  const { _id, ...rest } = ticket;
  const designs = ticketDesigns(ticket);
  const g2d = g2dEstimates(ticket);
  const panelLogsShares = ticket.history?.some((h) => h.action === 'share_cad_design');
  const shared = panelLogsShares ? [] : designs.map((d) => ({
    action: 'design_shared', at: d.uploaded_at, user: d.uploaded_by ?? 'CAD team', changes: { version: d.version },
  }));
  return {
    ...rest,
    status: effectiveStatus(ticket, designs, g2d),
    designs,
    latest_design_label: designs[0]?.label ?? null,
    cad_remarks: ticket.cadRemarks ?? null,
    requested_specs: requestedSpecs(ticket),
    final_details: finalDetails(ticket),
    g2d_estimates: g2d,
    comments: ticketComments(ticket),
    ...(ticket.history && {
      history: [...ticket.history.map(normalizeHistoryEntry), ...shared].sort((a, b) => new Date(a.at ?? 0) - new Date(b.at ?? 0)),
    }),
  };
}
