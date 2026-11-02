// SERVER-ONLY. The website DB (shopify-app) is the source of truth for tickets — the
// lucirajewelry.cloud workflow panel reads and writes the same collection. The POS DB only
// receives the original files and a write-only raw copy of each ticket; it is never read for status.
// Every ticket carries `env` (UAT/LIVE, from the session) and is only ever read back within that env.
import { randomBytes } from 'node:crypto';
import { GridFSBucket } from 'mongodb';
import jwt from 'jsonwebtoken';

import { getDb } from '@/lib/mongo/client';
import { getWebsiteDb } from '@/lib/mongo/websiteClient';
import { getUserStoresCached, postUpstream } from '@/lib/reports/serverAccess';
import { toPublicTicket } from './normalize';
import { goldKarat } from './constants';

export { toPublicTicket };

const TICKETS = 'pos_cad_tickets';
const RAW_COPY = 'cadTickets_POS';
const FILE_BUCKET = 'ticketFiles_POS';

let indexesReady = null;

export async function getTicketsCollection() {
  const col = (await getWebsiteDb()).collection(TICKETS);
  indexesReady ??= Promise.all([
    col.createIndex({ env: 1, ticket_number: 1 }, { unique: true }),
    col.createIndex({ env: 1, store_id: 1, created_at: -1 }),
    col.createIndex({ env: 1, customer_party_id: 1 }),
    col.createIndex({ env: 1, status: 1 }),
    col.createIndex({ env: 1, store_code: 1, ticket_year: 1, ticket_seq: -1 }),
  ]).catch((err) => {
    indexesReady = null;
    throw err;
  });
  await indexesReady;
  return col;
}

export async function getFileBucket() {
  return new GridFSBucket(await getDb(), { bucketName: FILE_BUCKET });
}

/** Today's (IST) OrnaVerse sales rate per gram for a gold karat at the session's store, or null. */
export async function getTodayGoldRate(session, karat) {
  const gold = goldKarat(karat);
  if (!gold || !session.companyId) return null;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const data = await postUpstream(session, 'Services/Helpers/GetMetalRate', {
    item_group_id: 106, karat_id: gold.karatId, is_purchase: false,
    from_date: today, to_date: today, company_id: session.companyId, use_karat_rate: true,
  });
  return typeof data?.rate === 'number' && data.rate > 0 ? data.rate : null;
}

export function newFileId() {
  return randomBytes(16).toString('hex');
}

export function fileUrl(request, fileId) {
  const base = process.env.APP_BASE_URL || new URL(request.url).origin;
  return `${base.replace(/\/$/, '')}/api/ticketing/files/${fileId}`;
}

/**
 * Links uploaded files to a ticket and returns them as reference_images entries.
 * Returns null if any id is unknown or already belongs to a ticket.
 */
export async function claimFiles(request, fileIds, ticketNumber) {
  const ids = [...new Set(fileIds)];
  if (!ids.length) return [];
  const filesCol = (await getDb()).collection(`${FILE_BUCKET}.files`);
  const files = await filesCol.find({ _id: { $in: ids }, 'metadata.ticket_number': null }).toArray();
  if (files.length !== ids.length) return null;

  const claimed = await filesCol.updateMany(
    { _id: { $in: ids }, 'metadata.ticket_number': null },
    { $set: { 'metadata.ticket_number': ticketNumber } },
  );
  if (claimed.modifiedCount !== ids.length) return null;

  const byId = new Map(files.map((f) => [f._id, f]));
  return ids.map((id) => {
    const f = byId.get(id);
    return { id, url: fileUrl(request, id), file_name: f.filename, type: f.metadata.contentType, uploaded_at: f.uploadDate };
  });
}

// ID documents (PAN, Aadhaar, passport, DL, GST) and accounting settings are deliberately not copied.
const PROFILE_FIELDS = [
  'party_code', 'party_name', 'mobile', 'phone',
  'city_name', 'state_name', 'country_name', 'birth_date', 'anniversary', 'party_address', 'party_contacts',
];

/** The customer's profile as OrnaVerse returns it to this login (masked values stay masked), or null if unavailable. */
export async function getCustomerProfileSnapshot(session, partyId) {
  try {
    const entity = (await postUpstream(session, 'Services/POS/Customer/Retrieve', { EntityId: partyId }))?.Entity;
    if (!entity) return null;
    return Object.fromEntries(PROFILE_FIELDS.filter((k) => k in entity).map((k) => [k, entity[k]]));
  } catch (err) {
    console.error('[ticketing] customer profile fetch failed', partyId, err?.message);
    return null;
  }
}

/** The store this session is logged into, as OrnaVerse's GetUserStores returns it, or null. */
export async function getSessionStore(session) {
  if (!session.companyId) return null;
  const stores = await getUserStoresCached(session);
  return stores.find((s) => s.company_id === session.companyId) ?? null;
}

/**
 * Inserts the ticket under the next number for its env + store + year, e.g. FCS-26-0007.
 * The number is the highest existing ticket_seq + 1; the unique (env, ticket_number) index
 * turns a simultaneous insert into a duplicate-key error, which simply retries with the next number.
 */
export async function insertTicketWithNumber(ticket) {
  const col = await getTicketsCollection();
  const yy = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', year: '2-digit' }).format(new Date());
  const year = Number(yy);

  const [last] = await col
    .find({ env: ticket.env, store_code: ticket.store_code, ticket_year: year }, { projection: { ticket_seq: 1 } })
    .sort({ ticket_seq: -1 })
    .limit(1)
    .toArray();
  let seq = last?.ticket_seq ?? 0;

  for (let attempt = 0; attempt < 50; attempt++) {
    seq += 1;
    const doc = {
      ...ticket,
      ticket_number: `${ticket.store_code}-${yy}-${String(seq).padStart(4, '0')}`,
      ticket_year: year,
      ticket_seq: seq,
    };
    try {
      await col.insertOne(doc);
      return doc;
    } catch (err) {
      if (err?.code !== 11000) throw err;
    }
  }
  throw new Error('Could not allocate a ticket number');
}

/** Super admins see every ticket, stores their own, and any store can reach a ticket through its customer's profile. */
export function canAccessTicket(session, ticket, partyId) {
  if (ticket.env !== session.env) return false;
  return !!session.isSuperAdmin
    || ticket.store_id === session.companyId
    || (partyId != null && ticket.customer_party_id === partyId);
}

export function historyEntry(session, store, action, changes = null) {
  return {
    action,
    at: new Date(),
    user: session.username,
    store_id: session.companyId ?? null,
    store_code: store?.company_code ?? null,
    changes,
  };
}

export async function saveRawCopy(ticket) {
  try {
    const { _id, ...rest } = ticket;
    await (await getDb()).collection(RAW_COPY)
      .replaceOne({ env: ticket.env, ticket_number: ticket.ticket_number }, { ...rest, copied_at: new Date() }, { upsert: true });
  } catch (err) {
    console.error('[ticketing] raw copy failed', ticket.ticket_number, err?.message);
  }
}

/** Pings the lucirajewelry.cloud workflow panel. Never throws — the ticket is already saved in the shared DB. */
export async function notifyCloud(event, ticket) {
  const url = process.env.TICKETING_WEBHOOK_URL;
  const secret = process.env.ONEVIEW_JWT_SECRET;
  if (!url || !secret) return;

  let result;
  try {
    const token = jwt.sign({ env: ticket.env, ticket_number: ticket.ticket_number, event }, secret, { expiresIn: '5m' });
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ event, env: ticket.env, ticket: toPublicTicket(ticket) }),
      signal: AbortSignal.timeout(8_000),
    });
    result = { event, ok: res.ok, status: res.status, at: new Date() };
  } catch (err) {
    result = { event, ok: false, error: err?.message ?? 'failed', at: new Date() };
  }

  try {
    await (await getTicketsCollection()).updateOne({ env: ticket.env, ticket_number: ticket.ticket_number }, { $set: { cloud_sync: result } });
  } catch (err) {
    console.error('[ticketing] cloud_sync update failed', ticket.ticket_number, err?.message);
  }
}
