import { getSessionFromRequest } from '@/lib/ornaverse/session';
import { TICKET_STATUS, CAD_REMINDER_DAYS } from '@/lib/ticketing/constants';
import { getTicketsCollection, toPublicTicket } from '@/lib/ticketing/server';
import { activeHold, mostUrgentStep } from '@/lib/ticketing/responseTimer';

const DAY_MS = 24 * 60 * 60 * 1000;
const empty = () => ({
  g2dShared: [], designReady: [], finalReceived: [], cadOverdue: [], readyToConfirm: [], newComments: [],
  hoOnHold: [], hoResumed: [], hoDelayed: [],
});
const CLOSED = [TICKET_STATUS.ORDER_PLACED, TICKET_STATUS.CANCELLED];
const PROJECTION = { customer_profile: 0, reference_images: 0, 'items.reference_images': 0 };

const summary = (t, item = null) => ({
  ticket_number: t.ticket_number,
  customer_name: t.customer_name,
  store_code: t.store_code ?? null,
  item_id: item?.item_id ?? null,
  item_category: item?.requested_specs?.category ?? null,
  latest_design_label: (item ?? t).latest_design_label ?? null,
  awaiting_cad_since: (item ?? t).awaiting_cad_since ?? null,
});

const openTickets = async (filter) => (await (await getTicketsCollection())
  .find({ ...filter, status: { $nin: CLOSED } }, { projection: PROJECTION })
  .sort({ updated_at: -1 }).limit(500).toArray())
  .map(toPublicTicket)
  .filter((t) => !CLOSED.includes(t.status));

function addStoreNotices(result, tickets) {
  const cutoff = new Date(Date.now() - CAD_REMINDER_DAYS * DAY_MS);
  const overdue = (entry) => new Date(entry.awaiting_cad_since) <= cutoff;
  for (const t of tickets) {
    const lastComment = t.comments?.at(-1);
    if (lastComment && lastComment.team !== 'store') result.newComments.push({ ...summary(t), comment_id: lastComment.id, item_id: lastComment.item_id });

    const units = t.items ? t.items.map((item) => [item, item.status]) : [[null, t.status]];
    for (const [item, status] of units) {
      const entry = summary(t, item);
      if (status === TICKET_STATUS.G2D_SHARED) result.g2dShared.push(entry);
      if (status === TICKET_STATUS.AWAITING_CUSTOMER_FEEDBACK) result.designReady.push(entry);
      if ([TICKET_STATUS.AWAITING_G2D, TICKET_STATUS.AWAITING_CAD].includes(status) && overdue(entry)) {
        result.cadOverdue.push({ ...entry, days_waiting: Math.floor((Date.now() - new Date(entry.awaiting_cad_since).getTime()) / DAY_MS) });
      }
    }
    if (t.status === TICKET_STATUS.FINAL_RECEIVED) result.finalReceived.push(summary(t));
    if (t.status === TICKET_STATUS.READY_TO_CONFIRM) result.readyToConfirm.push(summary(t));
  }
}

function addHoNotices(result, tickets) {
  const now = Date.now();
  for (const t of tickets) {
    const hold = activeHold(t.holds);
    if (hold) {
      result.hoOnHold.push({ ...summary(t), hold_id: hold.id, reason: hold.reason, step: hold.step, held_at: hold.held_at, held_by: hold.held_by });
    } else {
      const resumed = (t.holds ?? []).filter((h) => h.resumed_at && now - new Date(h.resumed_at).getTime() < DAY_MS).at(-1);
      if (resumed) result.hoResumed.push({ ...summary(t), hold_id: resumed.id, step: resumed.step, resumed_at: resumed.resumed_at, resumed_by: resumed.resumed_by });
    }
    const urgent = mostUrgentStep(t, now);
    if (urgent?.timing.delayed_minutes > 0) {
      result.hoDelayed.push({ ...summary(t), step_key: urgent.step.key, step: urgent.step.label, delayed_minutes: urgent.timing.delayed_minutes, on_hold: !!hold });
    }
  }
  result.hoDelayed.sort((a, b) => b.delayed_minutes - a.delayed_minutes);
}

// Stores are notified about their own tickets; super admins (HO) also get holds, resumes and delays from every store.
export async function GET(request) {
  const session = await getSessionFromRequest(request);
  if (!session) return Response.json({ error: 'Not authenticated' }, { status: 401 });

  try {
    const result = empty();
    if (session.companyId) addStoreNotices(result, await openTickets({ env: session.env, store_id: session.companyId }));
    if (session.isSuperAdmin) addHoNotices(result, await openTickets({ env: session.env }));
    return Response.json(result);
  } catch (err) {
    console.error('[api/ticketing/notifications] GET', err);
    return Response.json({ error: 'Failed to load ticket notifications' }, { status: 500 });
  }
}
