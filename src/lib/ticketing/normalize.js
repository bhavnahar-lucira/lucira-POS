// The lucirajewelry.cloud workflow panel writes its CAD fields (cadVersions, status 'cad_shared'/'ok', …)
// onto the same ticket documents; this maps them to the POS view of a ticket.
import { TICKET_STATUS } from './constants';

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
export function effectiveStatus(ticket, designs = ticketDesigns(ticket), g2d = g2dEstimates(ticket)) {
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
  return estimate.customer_decision === 'approved' ? TICKET_STATUS.AWAITING_CAD : TICKET_STATUS.AWAITING_G2D;
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
  return (ticket.history ?? [])
    .filter((h) => h.action === 'share_g2d_estimate')
    .map((h, i) => {
      const urls = [...new Set([h.thumbnail, sharedSteps[i]?.imageUrl].filter((u) => typeof u === 'string' && u))];
      return {
        round: i + 1,
        at: historyAt(h),
        by: historyUser(h),
        note: h.note || null,
        changes: (Array.isArray(h.changes) ? h.changes : []).map((c) => ({
          field: c.field, from: isBlank(c.from) ? null : String(c.from), to: isBlank(c.to) ? null : String(c.to),
        })),
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
  if (!ticket.estimation) return null;
  const created = ticket.history?.findLast((h) => h.action === 'order_created');
  return {
    ...ticket.estimation,
    manufacturing_order_number: ticket.orderNumber ?? ticket.order_number ?? null,
    received_at: created?.at ?? ticket.order_placed_at ?? null,
    received_by: created?.user ?? ticket.orderCreatedBy ?? null,
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

export function toPublicTicket(ticket) {
  if (!ticket) return null;
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
    ...(ticket.history && {
      history: [...ticket.history.map(normalizeHistoryEntry), ...shared].sort((a, b) => new Date(a.at ?? 0) - new Date(b.at ?? 0)),
    }),
  };
}
