import { after } from 'next/server';

import { getSessionFromRequest } from '@/lib/ornaverse/session';
import { ticketActionSchema } from '@/validators/ticketSchema';
import { TICKET_STATUS, PANEL_STATE } from '@/lib/ticketing/constants';
import {
  getTicketsCollection, getSessionStore, canAccessTicket, claimFiles,
  historyEntry, toPublicTicket, saveRawCopy, notifyCloud, getTodayGoldRate,
} from '@/lib/ticketing/server';
import { ticketDesigns, g2dEstimates, effectiveStatus, requestedSpecs } from '@/lib/ticketing/normalize';
import { postUpstream } from '@/lib/reports/serverAccess';


function parsePartyId(request) {
  const value = Number(new URL(request.url).searchParams.get('partyId'));
  return Number.isInteger(value) && value > 0 ? value : null;
}

async function loadAccessibleTicket(request, params) {
  const session = await getSessionFromRequest(request);
  if (!session) return { error: Response.json({ error: 'Not authenticated' }, { status: 401 }) };

  const { ticketNumber } = await params;
  const col = await getTicketsCollection();
  const ticket = await col.findOne({ env: session.env, ticket_number: ticketNumber });
  // 404 rather than 403, so ticket numbers can't be probed from another store.
  if (!ticket || !canAccessTicket(session, ticket, parsePartyId(request))) {
    return { error: Response.json({ error: 'Ticket not found' }, { status: 404 }) };
  }
  return { session, col, ticket };
}

export async function GET(request, { params }) {
  try {
    const { error, ticket } = await loadAccessibleTicket(request, params);
    if (error) return error;
    return Response.json({ ticket: toPublicTicket(ticket) });
  } catch (err) {
    console.error('[api/ticketing/:ticketNumber] GET', err);
    return Response.json({ error: 'Failed to load ticket' }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = ticketActionSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid action' }, { status: 400 });
  }
  const input = parsed.data;

  try {
    const { error, session, col, ticket } = await loadAccessibleTicket(request, params);
    if (error) return error;

    const store = await getSessionStore(session).catch(() => null);
    const now = new Date();
    const designs = ticketDesigns(ticket);
    const g2d = g2dEstimates(ticket);
    const status = effectiveStatus(ticket, designs, g2d);
    const filter = { env: ticket.env, ticket_number: ticket.ticket_number, status: ticket.status };
    let update;
    let arrayFilters;

    if (input.action === 'update_request') {
      if (status !== TICKET_STATUS.AWAITING_G2D) {
        return Response.json({ error: 'The request can only be updated while waiting for the G2D estimate.' }, { status: 409 });
      }
      const requested = requestedSpecs(ticket);
      const specChanges = Object.fromEntries(Object.entries(input.specs)
        .filter(([key, value]) => JSON.stringify(requested[key] ?? null) !== JSON.stringify(value))
        .map(([key, value]) => [key, { from: requested[key] ?? null, to: value }]));
      if (!Object.keys(specChanges).length && !input.file_ids.length) {
        return Response.json({ error: 'Nothing was changed.' }, { status: 400 });
      }
      const newImages = await claimFiles(request, input.file_ids, ticket.ticket_number);
      if (!newImages) return Response.json({ error: 'One or more uploaded files are invalid. Please re-upload.' }, { status: 400 });

      const changes = { ...specChanges, ...(newImages.length && { reference_images_added: newImages.map((f) => f.file_name) }) };
      update = {
        // Field-by-field so the CAD panel's own specs (diamond weight, pieces, …) survive the edit.
        $set: {
          ...Object.fromEntries(Object.entries(specChanges).map(([key, { to }]) => [`specs.${key}`, to])),
          requested_specs: input.specs,
          updated_at: now,
        },
        $push: {
          reference_images: { $each: newImages },
          history: historyEntry(session, store, 'request_updated', changes),
        },
      };
    } else if (input.action === 'approve_g2d' || input.action === 'reject_g2d') {
      const estimate = g2d[0];
      if (status !== TICKET_STATUS.G2D_SHARED || !estimate || estimate.round !== input.round) {
        return Response.json({ error: 'Only the latest shared G2D estimate can be approved or sent back.' }, { status: 409 });
      }
      const approved = input.action === 'approve_g2d';
      filter['g2d_decisions.round'] = { $ne: estimate.round };
      let order;
      if (approved) {
        // The rate is always today's from OrnaVerse, never the client's figure.
        let goldRate;
        try {
          goldRate = await getTodayGoldRate(session, input.order.karat);
        } catch (err) {
          console.error('[api/ticketing/:ticketNumber] gold rate', err?.message);
          return Response.json({ error: "Could not fetch today's gold rate from OrnaVerse. Please try again." }, { status: 502 });
        }
        if (!goldRate) {
          return Response.json({ error: `Today's gold rate for ${input.order.karat} isn't set for this store.` }, { status: 409 });
        }
        let advanceReceipt = null;
        if (input.order.amount_received) {
          // The advance must be a real OrnaVerse advance receipt for this customer and amount.
          let receipt;
          try {
            receipt = (await postUpstream(session, 'Services/POS/Receipt/Retrieve', { EntityId: input.order.advance_receipt_id }))?.Entity;
          } catch (err) {
            console.error('[api/ticketing/:ticketNumber] receipt retrieve', err?.message);
            return Response.json({ error: 'Could not verify the advance receipt with OrnaVerse. Please try again.' }, { status: 502 });
          }
          if (!receipt || !receipt.is_advance || receipt.party_id !== ticket.customer_party_id
            || Math.abs((receipt.total_amount ?? 0) - input.order.amount_received) > 0.01) {
            return Response.json({ error: "The advance receipt doesn't match this customer and amount." }, { status: 409 });
          }
          advanceReceipt = {
            transaction_id: input.order.advance_receipt_id,
            document_no: receipt.document_no ?? null,
            amount: receipt.total_amount,
            document_date: receipt.document_date ?? null,
          };
        }
        order = { ...input.order, advance_receipt: advanceReceipt, gold_rate: goldRate, confirmed_at: now, confirmed_by: session.username };
      }
      update = {
        $set: {
          ...(approved ? PANEL_STATE.CAD_DESIGN : PANEL_STATE.G2D_REQUESTED),
          awaiting_cad_since: now,
          updated_at: now,
          ...(approved
            ? {
              order_details: order,
              // Top-level / specs copies are the field names the workflow panel shows.
              order_date: order.order_date,
              order_amount: order.order_amount,
              amount_received: order.amount_received,
              advance_received_date: order.advance_received_on,
              gold_rate: order.gold_rate,
              expected_delivery_date: order.expected_delivery_date,
              metal: [order.karat, order.metal].filter(Boolean).join(' '),
              size: order.size,
              'specs.karat': order.karat,
              'specs.metal': order.metal,
              'specs.size': order.size,
              'specs.description': order.description,
            }
            : { customer_feedback: input.feedback }),
        },
        $push: {
          g2d_decisions: {
            round: estimate.round,
            decision: approved ? 'approved' : 'rejected',
            feedback: approved ? null : input.feedback,
            decided_at: now,
            decided_by: session.username,
          },
          history: historyEntry(session, store, approved ? 'g2d_approved' : 'g2d_rejected', {
            round: estimate.round,
            ...(approved
              ? { order_amount: order.order_amount, amount_received: order.amount_received, advance_receipt_no: order.advance_receipt?.document_no ?? null }
              : { feedback: input.feedback }),
          }),
        },
      };
    } else if (input.action === 'approve_design' || input.action === 'reject_design') {
      const design = designs[0];
      if (status !== TICKET_STATUS.AWAITING_CUSTOMER_FEEDBACK || !design || design.version !== input.version) {
        return Response.json({ error: 'Only the latest shared design can be approved or rejected.' }, { status: 409 });
      }
      const approved = input.action === 'approve_design';
      filter['design_decisions.version'] = { $ne: design.version };
      // cadVersions[].status is what the workflow panel reads for each version.
      const hasCadVersion = ticket.cadVersions?.some((v) => String(v.version) === design.version);
      if (hasCadVersion) arrayFilters = [{ 'v.version': design.version }];
      update = {
        $set: {
          ...(hasCadVersion && { 'cadVersions.$[v].status': approved ? 'approved' : 'changes_requested' }),
          updated_at: now,
          ...(approved
            ? { ...PANEL_STATE.SKU_PENDING, approved_version: design.version }
            : { ...PANEL_STATE.CAD_DESIGN, awaiting_cad_since: now, customer_feedback: input.feedback }),
        },
        $push: {
          design_decisions: {
            version: design.version,
            decision: approved ? 'approved' : 'rejected',
            feedback: approved ? null : input.feedback,
            decided_at: now,
            decided_by: session.username,
          },
          history: historyEntry(session, store, approved ? 'design_approved' : 'design_rejected', {
            version: design.version,
            ...(!approved && { feedback: input.feedback }),
          }),
        },
      };
    } else if (input.action === 'order_placed') {
      if (status !== TICKET_STATUS.FINAL_RECEIVED) {
        return Response.json({ error: 'An order can only be linked once the final details are received.' }, { status: 409 });
      }
      // The order must really exist in OrnaVerse for this ticket's customer.
      let order;
      try {
        order = (await postUpstream(session, 'Services/POS/Order/Retrieve', { EntityId: input.transaction_id }))?.Entity;
      } catch (err) {
        console.error('[api/ticketing/:ticketNumber] order retrieve', err?.message);
        return Response.json({ error: 'Could not verify the order with OrnaVerse.' }, { status: 502 });
      }
      if (!order || order.party_id !== ticket.customer_party_id) {
        return Response.json({ error: "This order doesn't belong to the ticket's customer." }, { status: 409 });
      }
      filter['pos_order'] = null;
      const posOrder = {
        transaction_id: input.transaction_id,
        document_no: order.document_no ?? null,
        net_amount: order.net_amount ?? null,
        placed_at: now,
        placed_by: session.username,
      };
      update = {
        $set: { pos_order: posOrder, updated_at: now },
        $push: { history: historyEntry(session, store, 'pos_order_placed', { document_no: posOrder.document_no, net_amount: posOrder.net_amount }) },
      };
    } else {
      if (status === TICKET_STATUS.CANCELLED) {
        return Response.json({ error: 'This ticket is already cancelled.' }, { status: 409 });
      }
      update = {
        $set: {
          ...PANEL_STATE.CANCELLED,
          cancel_reason: input.reason,
          cancelled_at: now,
          cancelled_by: session.username,
          updated_at: now,
        },
        $push: { history: historyEntry(session, store, 'ticket_cancelled', { reason: input.reason }) },
      };
    }

    const result = await col.updateOne(filter, update, arrayFilters ? { arrayFilters } : undefined);
    if (!result.matchedCount) {
      return Response.json({ error: 'This ticket was just updated elsewhere. Refresh and try again.' }, { status: 409 });
    }

    const updated = await col.findOne({ env: ticket.env, ticket_number: ticket.ticket_number });
    after(async () => {
      await saveRawCopy(updated);
      await notifyCloud(input.action, updated);
    });
    return Response.json({ ticket: toPublicTicket(updated) });
  } catch (err) {
    console.error('[api/ticketing/:ticketNumber] POST', err);
    return Response.json({ error: 'Failed to update ticket' }, { status: 500 });
  }
}
