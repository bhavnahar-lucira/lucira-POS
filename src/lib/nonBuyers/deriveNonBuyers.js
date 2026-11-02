// Non-Buyers — walk-in visitors who keep coming to the store but haven't
// bought. Pure function, no I/O: the /non-buyers page feeds it the store's
// full walk-in visit log (Services/CRM/CustomerVisits/List) plus the same
// store's orders + invoices (useAllOrders), both straight from OrnaVerse,
// and re-runs it client-side whenever a filter changes — same "filter the
// raw rows, then group" shape as lib/buyers/groupPurchasesByBuyer.js.
//
// ── THE RULE ────────────────────────────────────────────────────────────────
// 1. Visits inside [fromDate, toDate] are grouped into one row per PERSON.
// 2. That person is a NON-BUYER when:
//      visitCount >= minVisits
//      AND no posted (not cancelled, not draft) order or invoice at this
//          store dated on/after their FIRST visit in the window.
//    A purchase after the window still counts — someone who visited in
//    early October and bought on 20 October has converted, even when the
//    filter only covers 1–15 October.
// 3. Purchases BEFORE that first visit don't disqualify anyone — they're
//    surfaced as `isPastBuyer` (a lapsed customer browsing again is a
//    different, warmer follow-up than a first-timer).
// 4. A cancelled order after the first visit is surfaced as
//    `hasCancelledOrder` — still a non-buyer, but a very warm one.
//
// ── MATCHING A VISITOR TO THEIR PURCHASES ───────────────────────────────────
// A CRM visit row carries the CRM lead (customer_id), name and mobile, but
// no POS party_id, so mobile is the join key — compared on its last 10
// digits (lib/mongo/normalizeMobile.js's normalizeMobileKey), the same key
// the Buyers module already uses.
// OrnaVerse masks mobiles for a non-admin session ("******5670", see
// normalizers/customer.js's isMaskedValue). A masked number can't be joined
// exactly, so it falls back to last-4-digits + same normalized name — both
// have to match, which keeps a false "already bought" match unlikely.

import { normalizeMobileKey } from '@/lib/mongo/normalizeMobile';
import { isMaskedValue } from '@/lib/normalizers/customer';
import { deriveDocumentStatus } from '@/hooks/customer/useCustomerOrders';
import APP_CONFIG from '@/constants/appConfig';

const DAY_MS = 24 * 60 * 60 * 1000;

const dayOf = (iso) => (iso ? String(iso).slice(0, 10) : null);

function normalizeName(name) {
  return String(name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function lastFourDigits(mobile) {
  const digits = String(mobile ?? '').replace(/\D/g, '');
  return digits.length >= 4 ? digits.slice(-4) : null;
}

function maskedSignature(mobile, name) {
  const last4 = lastFourDigits(mobile);
  const normalized = normalizeName(name);
  return last4 && normalized ? `${last4}|${normalized}` : null;
}

function exactMobileKey(mobile) {
  if (!mobile || isMaskedValue(mobile)) return null;
  return normalizeMobileKey(mobile);
}

/**
 * Indexes the store's orders/invoices by every key a visitor can be matched
 * on. Draft documents are dropped (never a real purchase); cancelled ones
 * are kept but flagged, so they can raise `hasCancelledOrder`.
 * @param {object[]} documents — useAllOrders' normalized rows ({ raw, status, orderDate, documentType })
 */
function indexDocuments(documents) {
  const byMobile = new Map();
  const bySignature = new Map();

  const push = (map, key, doc) => {
    if (!key) return;
    const list = map.get(key);
    if (list) list.push(doc);
    else map.set(key, [doc]);
  };

  for (const doc of documents) {
    const status = doc.status
      ?? deriveDocumentStatus(doc.raw?.document_status, doc.balanceAmount, doc.receiptAmount);
    if (status === APP_CONFIG.ORDER_STATUS.DRAFT) continue;

    const entry = {
      day: dayOf(doc.orderDate),
      date: doc.orderDate,
      isCancelled: status === APP_CONFIG.ORDER_STATUS.CANCELLED,
      documentNo: doc.orderNo ?? null,
      documentType: doc.documentType,
      amount: doc.totalAmount ?? null,
    };
    if (!entry.day) continue;

    const mobile = doc.raw?.mobile;
    push(byMobile, exactMobileKey(mobile), entry);
    push(bySignature, maskedSignature(mobile, doc.customerName ?? doc.raw?.party_name), entry);
  }

  return { byMobile, bySignature };
}

function findDocumentsFor(person, index) {
  if (person.mobileKey) return index.byMobile.get(person.mobileKey) ?? [];
  if (person.signature) return index.bySignature.get(person.signature) ?? [];
  return [];
}

/**
 * @param {{
 *   visits: object[],     // normalizeCrmVisit rows (visitId, leadId, customerName, mobile, email, visitedAt, source, notes, companyName)
 *   documents: object[],  // useAllOrders rows for the SAME store
 *   fromDate?: string,    // 'YYYY-MM-DD', inclusive; empty = no lower bound
 *   toDate?: string,      // 'YYYY-MM-DD', inclusive; empty = no upper bound
 *   minVisits?: number,
 *   now?: number,         // injectable clock, for daysSinceLastVisit
 * }} params
 * @returns {object[]} one row per non-buyer, most visits first
 */
export function deriveNonBuyers({
  visits, documents, fromDate = '', toDate = '', minVisits = 2, now = Date.now(),
}) {
  const index = indexDocuments(documents ?? []);
  const people = new Map();

  for (const visit of visits ?? []) {
    const day = dayOf(visit.visitedAt);
    if (!day) continue;
    if (fromDate && day < fromDate) continue;
    if (toDate && day > toDate) continue;

    const mobileKey = exactMobileKey(visit.mobile);
    const key = mobileKey
      ? `m:${mobileKey}`
      : visit.leadId != null ? `l:${visit.leadId}` : `v:${visit.visitId}`;

    let person = people.get(key);
    if (!person) {
      person = {
        key,
        leadId: visit.leadId ?? null,
        name: visit.customerName ?? null,
        mobile: visit.mobile ?? null,
        email: visit.email ?? null,
        mobileKey,
        signature: mobileKey ? null : maskedSignature(visit.mobile, visit.customerName),
        isMasked: !!visit.mobile && isMaskedValue(visit.mobile),
        sources: new Set(),
        visits: [],
      };
      people.set(key, person);
    }
    person.visits.push(visit);
    if (visit.source) person.sources.add(visit.source);
    if (!person.name && visit.customerName) person.name = visit.customerName;
    if (!person.email && visit.email) person.email = visit.email;
  }

  const rows = [];
  for (const person of people.values()) {
    if (person.visits.length < minVisits) continue;

    const ordered = [...person.visits].sort((a, b) => new Date(b.visitedAt) - new Date(a.visitedAt));
    const lastVisitAt = ordered[0].visitedAt;
    const firstVisitAt = ordered[ordered.length - 1].visitedAt;
    const firstVisitDay = dayOf(firstVisitAt);

    const docs = findDocumentsFor(person, index);
    const after = docs.filter((d) => d.day >= firstVisitDay);
    if (after.some((d) => !d.isCancelled)) continue; // converted — not a non-buyer

    const before = docs.filter((d) => d.day < firstVisitDay && !d.isCancelled);
    const lastPurchase = before.reduce(
      (latest, d) => (!latest || d.day > latest.day ? d : latest),
      null,
    );

    const lastVisitMs = new Date(lastVisitAt).getTime();
    rows.push({
      key: person.key,
      leadId: person.leadId,
      name: person.name,
      mobile: person.mobile,
      email: person.email,
      isMasked: person.isMasked,
      visitCount: ordered.length,
      firstVisitAt,
      lastVisitAt,
      daysSinceLastVisit: Number.isFinite(lastVisitMs)
        ? Math.max(0, Math.floor((now - lastVisitMs) / DAY_MS))
        : null,
      sources: [...person.sources],
      visits: ordered,
      isPastBuyer: !!lastPurchase,
      lastPurchaseDate: lastPurchase?.date ?? null,
      hasCancelledOrder: after.some((d) => d.isCancelled),
    });
  }

  return rows.sort((a, b) =>
    b.visitCount - a.visitCount || new Date(b.lastVisitAt) - new Date(a.lastVisitAt));
}
