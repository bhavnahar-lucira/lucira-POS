import { after } from 'next/server';

import { getSessionFromRequest } from '@/lib/ornaverse/session';
import { createTicketSchema, createMultiTicketSchema } from '@/validators/ticketSchema';
import { PANEL_STATE, MULTI_PRODUCT_TICKETS_ENABLED, TICKET_FORMAT_MULTI } from '@/lib/ticketing/constants';
import { newTicketItem, TICKET_OPEN } from '@/lib/ticketing/multiActions';
import {
  getTicketsCollection, getSessionStore, insertTicketWithNumber, claimFiles, getCustomerProfileSnapshot,
  historyEntry, toPublicTicket, saveRawCopy, notifyCloud,
} from '@/lib/ticketing/server';

const LIST_LIMIT = 1000;

export async function GET(request) {
  const session = await getSessionFromRequest(request);
  if (!session) return Response.json({ error: 'Not authenticated' }, { status: 401 });

  const partyParam = new URL(request.url).searchParams.get('partyId');
  let filter;
  if (partyParam != null) {
    const partyId = Number(partyParam);
    if (!Number.isInteger(partyId) || partyId <= 0) return Response.json({ error: 'Invalid partyId' }, { status: 400 });
    filter = { env: session.env, customer_party_id: partyId };
  } else if (session.isSuperAdmin) {
    filter = { env: session.env };
  } else if (session.companyId) {
    filter = { env: session.env, store_id: session.companyId };
  } else {
    return Response.json({ error: 'Switch to a store to view tickets.' }, { status: 403 });
  }

  try {
    const tickets = await (await getTicketsCollection())
      .find(filter, { projection: { history: 0 } })
      .sort({ created_at: -1 })
      .limit(LIST_LIMIT)
      .toArray();
    return Response.json({ tickets: tickets.map(toPublicTicket) });
  } catch (err) {
    console.error('[api/ticketing] GET', err);
    return Response.json({ error: 'Failed to load tickets' }, { status: 500 });
  }
}

export async function POST(request) {
  const session = await getSessionFromRequest(request);
  if (!session) return Response.json({ error: 'Not authenticated' }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (Array.isArray(body?.items)) return createMultiTicket(request, session, body);

  const parsed = createTicketSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid ticket', details: parsed.error.flatten() }, { status: 400 });
  }
  const { customer, sales_person: salesPerson, specs, file_ids: fileIds } = parsed.data;

  let store;
  try {
    store = await getSessionStore(session);
  } catch (err) {
    console.error('[api/ticketing] POST store lookup', err);
    return Response.json({ error: 'OrnaVerse is not responding right now. Please try again in a moment.' }, { status: 502 });
  }
  if (!store) return Response.json({ error: 'Switch to a store before raising a ticket.' }, { status: 403 });

  try {
    const profile = await getCustomerProfileSnapshot(session, customer.party_id);
    const now = new Date();
    const ticket = await insertTicketWithNumber({
      env: session.env,
      order_source: 'POS',
      store_id: store.company_id,
      store_code: store.company_code,
      store_name: store.mailing_name,
      customer_party_id: customer.party_id,
      customer_name: profile?.party_name ?? customer.name,
      customer_mobile: customer.mobile ?? profile?.mobile ?? null,
      customer_profile: profile,
      sales_person_id: salesPerson.id,
      sales_person_name: salesPerson.name,
      created_by: session.username,
      created_at: now,
      updated_at: now,
      specs,
      requested_specs: specs,
      reference_images: [],
      ...PANEL_STATE.G2D_REQUESTED,
      awaiting_cad_since: now,
      approved_version: null,
      order_number: null,
      order_placed_at: null,
      cancel_reason: null,
      cancelled_at: null,
      cancelled_by: null,
      history: [historyEntry(session, store, 'ticket_created')],
    });

    const col = await getTicketsCollection();
    const referenceImages = await claimFiles(request, fileIds, ticket.ticket_number);
    if (!referenceImages) {
      await col.deleteOne({ _id: ticket._id });
      return Response.json({ error: 'One or more uploaded files are invalid. Please re-upload.' }, { status: 400 });
    }
    await col.updateOne({ _id: ticket._id }, { $set: { reference_images: referenceImages } });
    ticket.reference_images = referenceImages;

    after(async () => {
      await saveRawCopy(ticket);
      await notifyCloud('ticket_created', ticket);
    });

    return Response.json({ ticket: toPublicTicket(ticket) }, { status: 201 });
  } catch (err) {
    console.error('[api/ticketing] POST', err);
    return Response.json({ error: 'Failed to create ticket' }, { status: 500 });
  }
}

async function createMultiTicket(request, session, body) {
  if (!MULTI_PRODUCT_TICKETS_ENABLED) return Response.json({ error: 'Multi-product tickets are not enabled yet.' }, { status: 403 });
  const parsed = createMultiTicketSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid ticket', details: parsed.error.flatten() }, { status: 400 });
  }
  const { customer, sales_person: salesPerson, general_notes: generalNotes, items } = parsed.data;
  const allFileIds = items.flatMap((i) => i.file_ids);
  if (new Set(allFileIds).size !== allFileIds.length) {
    return Response.json({ error: 'The same image was added to more than one product. Please re-upload.' }, { status: 400 });
  }

  let store;
  try {
    store = await getSessionStore(session);
  } catch (err) {
    console.error('[api/ticketing] POST store lookup', err);
    return Response.json({ error: 'OrnaVerse is not responding right now. Please try again in a moment.' }, { status: 502 });
  }
  if (!store) return Response.json({ error: 'Switch to a store before raising a ticket.' }, { status: 403 });

  try {
    const profile = await getCustomerProfileSnapshot(session, customer.party_id);
    const now = new Date();
    const ticket = await insertTicketWithNumber({
      env: session.env,
      order_source: 'POS',
      format: TICKET_FORMAT_MULTI,
      store_id: store.company_id,
      store_code: store.company_code,
      store_name: store.mailing_name,
      customer_party_id: customer.party_id,
      customer_name: profile?.party_name ?? customer.name,
      customer_mobile: customer.mobile ?? profile?.mobile ?? null,
      customer_profile: profile,
      sales_person_id: salesPerson.id,
      sales_person_name: salesPerson.name,
      created_by: session.username,
      created_at: now,
      updated_at: now,
      general_notes: generalNotes,
      items: [],
      ...TICKET_OPEN,
      order_details: null,
      advances: [],
      pos_order: null,
      cancel_reason: null,
      cancelled_at: null,
      cancelled_by: null,
      comments: [],
      history: [historyEntry(session, store, 'ticket_created', { products: items.length })],
    });

    const col = await getTicketsCollection();
    const claimed = await claimFiles(request, allFileIds, ticket.ticket_number);
    if (!claimed) {
      await col.deleteOne({ _id: ticket._id });
      return Response.json({ error: 'One or more uploaded files are invalid. Please re-upload.' }, { status: 400 });
    }
    const byId = new Map(claimed.map((f) => [f.id, f]));
    ticket.items = items.map((item, i) => newTicketItem(
      ticket.ticket_number, i + 1, item.specs, item.file_ids.map((id) => byId.get(id)), now,
    ));
    await col.updateOne({ _id: ticket._id }, { $set: { items: ticket.items } });

    after(async () => {
      await saveRawCopy(ticket);
      await notifyCloud('ticket_created', ticket);
    });

    return Response.json({ ticket: toPublicTicket(ticket) }, { status: 201 });
  } catch (err) {
    console.error('[api/ticketing] POST multi', err);
    return Response.json({ error: 'Failed to create ticket' }, { status: 500 });
  }
}
