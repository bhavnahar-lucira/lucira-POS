import { getSessionFromRequest } from '@/lib/ornaverse/session';
import { TICKET_STATUS, CAD_REMINDER_DAYS } from '@/lib/ticketing/constants';
import { getTicketsCollection, toPublicTicket } from '@/lib/ticketing/server';

const DAY_MS = 24 * 60 * 60 * 1000;
const empty = () => ({ g2dShared: [], designReady: [], finalReceived: [], cadOverdue: [], readyToConfirm: [], newComments: [] });

const summary = (t, item = null) => ({
  ticket_number: t.ticket_number,
  customer_name: t.customer_name,
  item_id: item?.item_id ?? null,
  item_category: item?.requested_specs?.category ?? null,
  latest_design_label: (item ?? t).latest_design_label ?? null,
  awaiting_cad_since: (item ?? t).awaiting_cad_since ?? null,
});

// Only the store that raised a ticket is notified, whoever acted on it since.
export async function GET(request) {
  const session = await getSessionFromRequest(request);
  if (!session) return Response.json({ error: 'Not authenticated' }, { status: 401 });
  if (!session.companyId) return Response.json(empty());

  try {
    const cutoff = new Date(Date.now() - CAD_REMINDER_DAYS * DAY_MS);
    // The panel sets status in its own vocabulary, so open tickets are filtered after normalising.
    const tickets = await (await getTicketsCollection()).find(
      {
        env: session.env,
        store_id: session.companyId,
        status: { $nin: [TICKET_STATUS.ORDER_PLACED, TICKET_STATUS.CANCELLED] },
      },
      { projection: { customer_profile: 0, reference_images: 0, 'items.reference_images': 0 } },
    ).sort({ updated_at: -1 }).limit(200).toArray();

    const result = empty();
    const overdue = (entry) => new Date(entry.awaiting_cad_since) <= cutoff;
    for (const t of tickets.map(toPublicTicket)) {
      if ([TICKET_STATUS.ORDER_PLACED, TICKET_STATUS.CANCELLED].includes(t.status)) continue;
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
    return Response.json(result);
  } catch (err) {
    console.error('[api/ticketing/notifications] GET', err);
    return Response.json({ error: 'Failed to load ticket notifications' }, { status: 500 });
  }
}
