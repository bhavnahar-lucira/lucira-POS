// Interstore Return (IRR) — a customer returns an item at a store OTHER
// than the one that sold it. document_id 128. Full contract compiled from
// OrnaVerse's own shipped JS bundle (see the "OrnaVerse Interstore Return"
// artifact — memory [[interstore-return-artifact]]) and confirmed live on
// UAT 2026-09-11/2026-09-15 (real record interstore_return_id 5, full
// lifecycle Create→SubmitForApproval→Approve→PendingSettlement→
// LocalAbsorption→Closed) and read-only on LIVE 2026-09-17 (2 real
// store-created records — same field shape, confirming UAT/LIVE parity).
//
// Retrieve/Update/Delete use the generic Serenity `{ EntityId }` key.
// SubmitForApproval/Approve/Reject/Resubmit/ReturnToOrigin/LocalAbsorption
// use `{ interstore_return_id }` instead — confirmed both shapes live,
// don't conflate them.
//
// STORE-ROLE GATING: Approve needs the caller's OrnaVerse SESSION company
// (see storeService.switchCompany) to equal the record's origin_company_id;
// SubmitForApproval/Resubmit/ReturnToOrigin/LocalAbsorption need it to equal
// receiving_company_id. This file exposes withCompany() so callers (the
// mutation hooks) can temporarily switch, act, and switch back — see that
// function's own header for why "switch back" is not optional.

import axiosInstance from '@/lib/axios/axiosInstance';
import API from '@/constants/apiEndpoints';
import { switchCompany } from '@/services/storeService';
import { uploadTemporaryFile } from '@/services/fileUploadService';
import APP_CONFIG from '@/constants/appConfig';

const { INTERSTORE_RETURN_STATUS } = APP_CONFIG;

/**
 * Runs `fn` with the OrnaVerse session temporarily switched to `companyId`,
 * then ALWAYS switches back to `restoreCompanyId` (the operator's real
 * active store) afterward — even if `fn` throws. Never leaves the session
 * pointed at a company our own app's UI doesn't think it's acting as; see
 * [[ornaverse-switchcompany-2026-09-15]]'s "Deliberately NOT done" note for
 * why an un-restored switch is a real risk (the operator could go on to
 * transact against the wrong store without realizing it).
 *
 * Deliberately does NOT touch Redux/query-cache state the way
 * useActiveStore's switchStore does — this is a scoped, momentary switch
 * for one server call, not a change to what store the rest of the app
 * thinks the operator is at.
 *
 * @param {number} companyId
 * @param {number} restoreCompanyId
 * @param {() => Promise<any>} fn
 */
export async function withCompany(companyId, restoreCompanyId, fn) {
  if (companyId === restoreCompanyId) return fn();
  await switchCompany(companyId);
  try {
    return await fn();
  } finally {
    await switchCompany(restoreCompanyId).catch(() => {
      // Best-effort — surfacing a restore failure on top of whatever fn()
      // did (succeeded or threw) would obscure the real outcome. A stuck
      // session is recoverable next time any store-switch happens.
    });
  }
}

/**
 * @param {{ companyId: number, mode?: 'inbox'|'outbox'|'all', pendingOnly?: boolean, skip?: number, take?: number }} params
 */
export async function listInterstoreReturns({ companyId, mode = 'all', pendingOnly = false, skip = 0, take = 25 }) {
  const filters = { Skip: skip, Take: take, company_id: companyId };
  if (mode === 'inbox') filters.irr_origin_inbox = true;
  if (mode === 'outbox') filters.irr_receiving_outbox = true;
  if (pendingOnly) filters.status_id = INTERSTORE_RETURN_STATUS.PENDING_APPROVAL;

  const response = await axiosInstance.post(API.INTERSTORE_RETURN.LIST, filters);
  return {
    rows: response.data?.Entities ?? [],
    totalCount: response.data?.TotalCount ?? 0,
  };
}

/** @param {number} interstoreReturnId */
export async function getInterstoreReturnDetail(interstoreReturnId) {
  const response = await axiosInstance.post(API.INTERSTORE_RETURN.RETRIEVE, {
    EntityId: interstoreReturnId,
  });
  return response.data?.Entity ?? null;
}

/**
 * Items this customer has ever purchased, from ANY branch and ANY financial
 * year — deliberately not scoped to a company_id, unlike the same-store
 * Returns picker (returnItemsService.getSoldItems). Cross-branch reach is
 * the whole point of Interstore Return; filtering it out would break the
 * feature, not narrow it. Mirrors OrnaVerse's own "Sold Item" picker, which
 * explicitly nulls company_id/financial_year_id before this call — see the
 * IRR artifact's section 06.
 *
 * @param {{ partyId: number, take?: number }} params
 * @returns {Promise<object[]>} full nested sold-item rows (get_child:true)
 */
export async function getSoldItemsAcrossBranches({ partyId, take = 50 }) {
  if (!partyId) return [];
  const response = await axiosInstance.post(API.INTERSTORE_RETURN.SOLD_ITEMS, {
    Take: take,
    party_id: partyId,
    transaction_type: 1, // 1 = sold items (same enum Returns uses)
    get_child: true,
    IncludeColumns: [
      'item_code', 'item_line_no', 'pieces', 'weight',
      'net_weight', 'sku', 'document_no', 'company_id',
    ],
  });
  return response.data?.Entities ?? [];
}

/**
 * Prices selected sold items via the SAME Helpers/SetReturnItems endpoint
 * the same-store Returns flow uses (returnItemsService.calculateReturnItems).
 *
 * CORRECTED 2026-09-17 (live-tested on UAT): the IRR artifact's own §05
 * step-3 snippet claims this call carries a `document_id` that makes the
 * server return an IRR-shaped line (valuation_amount, source_procurement_type,
 * origin_company_id, etc). That snippet was NEVER actually live-verified —
 * it was compiled from static analysis of the shipped bundle. Tested live:
 * sending `document_id: 128` changes NOTHING — the response is always a
 * plain RETURN-shaped line (ref_transaction_id/ref_document_id/
 * ref_transaction_item_id naming, no valuation_amount/source_procurement_type/
 * origin_company_id at all), so `document_id` is no longer sent here.
 * mapReturnLineToInterstoreReturnLine() below does the real remapping this
 * needs before Create.
 *
 * @param {{ items: object[], documentDate?: Date }} params
 * @returns {Promise<object[]>} RETURN-shaped line items — pass each through
 *   mapReturnLineToInterstoreReturnLine() before sending to Create.
 */
export async function calculateInterstoreReturnItems({ items, documentDate = new Date() }) {
  if (!items?.length) return [];
  const response = await axiosInstance.post(API.HELPERS.SET_RETURN_ITEMS, {
    selected_products: items,
    exchange_rate: 1,
    document_date: documentDate.toDateString(),
    is_tax_applicable: false,
    calculate_rates: false,
  });
  return response.data?.Entities ?? [];
}

/**
 * Remaps a plain RETURN-shaped priced line (from calculateInterstoreReturnItems)
 * into IRR's own line shape.
 *
 * Field list confirmed 2026-09-17 against OrnaVerse's OWN published API
 * reference (ornaverse-advantage.apidog.io — the authoritative schema).
 * InterstoreReturnItems accepts:
 *
 *   { interstore_return_id, line_no, item_id, item_attribute_id, sku,
 *     item_name, ref_invoice_id, ref_invoice_item_id, origin_company_id,
 *     source_procurement_type, return_days_eligible, days_since_purchase,
 *     valuation_amount, valuation_locked, pieces, weight, net_weight,
 *     item_json, images[] }
 *
 * ROOT CAUSE of every 500 this file previously produced on a genuinely NEW
 * invoice item, confirmed by isolation on UAT 2026-09-17: **`line_no` is
 * NOT server-assigned** — despite looking exactly like the other
 * server-managed fields (it comes back populated on every real Retrieve,
 * same as `interstore_return_item_id`), omitting it crashes Create with a
 * generic exception. Isolated field-by-field: `line_no` alone (starting at
 * 1) fixes it; `valuation_locked`/`item_json` are NOT required (both
 * omittable). This is why re-submitting an ALREADY-USED invoice/item pair
 * always cleanly 400'd ("already assigned") while every fresh item 500'd —
 * the duplicate-check runs before line construction, so it never hit the
 * missing-`line_no` crash; a genuinely new line always did.
 *
 * `ref_invoice_id`/`ref_invoice_item_id` are confirmed real field names —
 * `InterstoreReturn/Create` 400s with "Return requires an invoice-linked
 * item." until BOTH are present. `source_procurement_type` has no known
 * derivation; sent as PurchaseBased (2), silently accepted in the original
 * 2026-09-11 test.
 *
 * `images` is populated separately, AFTER Create, via a plain Update with
 * the photo embedded in the line's own `images[]` — see
 * updateInterstoreReturnEntity. (AddItemImage's documented contract,
 * `{ interstore_return_item_id, image_path }`, was tried live 2026-09-17
 * and still 500s — see addInterstoreReturnItemImage's own header.)
 *
 * @param {object} returnLine — one row from calculateInterstoreReturnItems
 * @param {number} lineNo — 1-based position within this IRR's line_items
 */
export function mapReturnLineToInterstoreReturnLine(returnLine, lineNo) {
  return {
    line_no: lineNo,
    item_id: returnLine.item_id,
    item_attribute_id: returnLine.item_attribute_id,
    sku: returnLine.sku,
    item_name: returnLine.item_name,
    ref_invoice_id: returnLine.ref_transaction_id,
    ref_invoice_item_id: returnLine.ref_transaction_item_id,
    origin_company_id: returnLine.company_id,
    source_procurement_type: APP_CONFIG.INTERSTORE_RETURN_SOURCE_PROCUREMENT_TYPE.PURCHASE_BASED,
    valuation_amount: returnLine.net_amount,
    pieces: returnLine.pieces,
    weight: returnLine.weight,
    net_weight: returnLine.net_weight,
    // Present in a real captured Create payload (2026-10-02) alongside
    // every other field above — the full priced line, stringified. Exact
    // purpose on the server isn't documented, but it's what their own
    // client sends, so sent here too rather than omitted.
    item_json: JSON.stringify(returnLine),
    images: [],
  };
}

/**
 * Attaches a photo to one already-created IRR line — a photo is mandatory
 * before SubmitForApproval will accept the document (server-enforced:
 * "Upload at least one photo for '<sku>' before submitting.").
 *
 * CORRECTED 2026-10-02 — this was marked "still broken, 500s" as of
 * 2026-09-17 and bypassed (see git history: the create flow used to embed
 * the photo in the line's own `images[]` via a full-entity Update instead).
 * That diagnosis was wrong: the earlier test passed a base64 DATA URI as
 * `image_path`; the real contract needs a `TemporaryFile` path from
 * uploadTemporaryFile() first. CONFIRMED LIVE 2026-10-02 (real capture of
 * OrnaVerse's own Returns screen): `{ interstore_return_item_id, image_path:
 * "temporary/<guid>.png" }` → `{}` (200, empty body = success), and
 * "Complete Return" became enabled immediately after. `interstore_return_item_id`
 * is the PER-LINE id from the Create/Retrieve response's own
 * `line_items[].interstore_return_item_id` — not the entity's own
 * `interstore_return_id`.
 *
 * @param {{ interstoreReturnItemId: number, imagePath: string }} params
 *   imagePath — a `TemporaryFile` path from uploadTemporaryFile(), e.g.
 *   "temporary/941d9a4f75ea4f3588b81c3d9736f401.png".
 */
export async function addInterstoreReturnItemImage({ interstoreReturnItemId, imagePath }) {
  const response = await axiosInstance.post(API.INTERSTORE_RETURN.ADD_ITEM_IMAGE, {
    interstore_return_item_id: interstoreReturnItemId,
    image_path: imagePath,
  });
  return response.data;
}

/**
 * @param {{
 *   partyId: number, partyName?: string,
 *   originCompanyId: number, receivingCompanyId: number,
 *   documentDate: string, remark?: string,
 *   lineItems: object[],
 *   headerConfig: { financialYearId, isDocumentNumberEditable, numberOfBackdatedDays },
 * }} params
 * @returns {Promise<{ EntityId: number, Entity: object }>}
 */
export async function createInterstoreReturn({
  partyId, partyName, originCompanyId, receivingCompanyId,
  documentDate, remark = '', lineItems, headerConfig,
  transactionType = APP_CONFIG.INTERSTORE_RETURN_TRANSACTION_TYPE.RETURN,
}) {
  const sum = (f) => +lineItems.reduce((s, li) => s + (li[f] ?? 0), 0).toFixed(2);

  const response = await axiosInstance.post(API.INTERSTORE_RETURN.CREATE, {
    Entity: {
      document_id: APP_CONFIG.DOCUMENT_TYPES.INTERSTORE_RETURN,
      document_date: documentDate,
      company_id: receivingCompanyId, // owning company — matches real records, where company_id === receiving_company_id
      party_id: partyId,
      party_name: partyName ?? undefined,
      origin_company_id: originCompanyId,
      receiving_company_id: receivingCompanyId,
      transaction_type: transactionType,
      country_id: 1,
      financial_year_id: headerConfig.financialYearId,
      is_document_number_editable: headerConfig.isDocumentNumberEditable,
      allow_backdated_entry: true,
      number_of_backdated_days: headerConfig.numberOfBackdatedDays ?? 365,
      sub_total: sum('sub_total'),
      tax_amount: sum('tax_amount'),
      net_amount: sum('net_amount'),
      remark,
      line_items: lineItems,
    },
  });
  return response.data;
}

/**
 * Full create flow for a cross-store Return/Exchange/Buyback line: creates
 * the IRR, uploads + attaches each line's mandatory photo, then submits it
 * for the origin store's approval — the exact sequence CONFIRMED LIVE
 * 2026-10-02 (Create → AddItemImage per line → SubmitForApproval, strictly
 * in that order, all three required before the paired regular Return/
 * Exchange/Buyback document was accepted in the same real test).
 *
 * @param {{
 *   partyId: number, partyName?: string,
 *   originCompanyId: number, receivingCompanyId: number,
 *   documentDate: string, remark?: string, transactionType?: number,
 *   lineItems: object[], photosByLineIndex: (File|undefined)[],
 *   headerConfig: object,
 * }} params
 * @returns {Promise<number>} the new interstore_return_id
 */
export async function createInterstoreReturnWithPhotos({
  partyId, partyName, originCompanyId, receivingCompanyId,
  documentDate, remark, transactionType, lineItems, photosByLineIndex, headerConfig,
}) {
  const created = await createInterstoreReturn({
    partyId, partyName, originCompanyId, receivingCompanyId,
    documentDate, remark, transactionType, lineItems, headerConfig,
  });
  const interstoreReturnId = created?.EntityId;
  if (!interstoreReturnId) {
    throw new Error('Interstore Return creation failed — no record returned.');
  }

  // A real capture of OrnaVerse's own client (2026-10-02) calls Retrieve
  // immediately after Create, before AddItemImage — re-fetching rather than
  // trusting Create's own response for the per-line ids. Matched here
  // rather than assumed unnecessary: Create's own `Entity.line_items[]` may
  // not carry a populated `interstore_return_item_id` yet.
  const entity = await getInterstoreReturnDetail(interstoreReturnId);
  if (!entity) throw new Error('Interstore Return creation failed — could not re-fetch the new record.');

  const createdLines = entity.line_items ?? [];
  for (let i = 0; i < createdLines.length; i++) {
    const photo = photosByLineIndex[i];
    if (!photo) continue;
    const tempPath = await uploadTemporaryFile(photo);
    await addInterstoreReturnItemImage({
      interstoreReturnItemId: createdLines[i].interstore_return_item_id,
      imagePath: tempPath,
    });
  }

  await submitInterstoreReturnForApproval(interstoreReturnId);
  return interstoreReturnId;
}

/**
 * Generic Update — e.g. editing `remark` on a Draft/Rejected record (the
 * only two header fields the artifact's own dialog leaves editable once a
 * record exists, besides line_items). Not currently called anywhere in the
 * app; kept as the plain wrapper other document types also have.
 *
 * For attaching a photo specifically, use addInterstoreReturnItemImage
 * instead — a photo is mandatory before SubmitForApproval will accept the
 * document (server-enforced: "Upload at least one photo for '<sku>' before
 * submitting.").
 *
 * @param {object} entity — the full IRR entity (as returned by Create or Retrieve)
 */
export async function updateInterstoreReturnEntity(entity) {
  const response = await axiosInstance.post(API.INTERSTORE_RETURN.UPDATE, {
    EntityId: entity.interstore_return_id,
    Entity: entity,
  });
  return response.data?.Entity ?? null;
}

async function lifecycleAction(endpoint, interstoreReturnId) {
  const response = await axiosInstance.post(endpoint, { interstore_return_id: interstoreReturnId });
  // LocalAbsorption/ReturnToOrigin can return an empty 200 body — confirmed
  // live 2026-09-15. Never assume response.data is populated.
  return response.data ?? null;
}

/** Receiving store only. Draft/Rejected → PendingApproval. */
export const submitInterstoreReturnForApproval = (id) =>
  lifecycleAction(API.INTERSTORE_RETURN.SUBMIT_FOR_APPROVAL, id);

/**
 * Origin store only. PendingApproval → Approved, which the server
 * immediately advances to PendingSettlement (confirmed live: "Approved"
 * is transient, never observed as a resting state) — also writes
 * credit_note_transaction_id and consignment_out_transaction_id.
 */
export const approveInterstoreReturn = (id) =>
  lifecycleAction(API.INTERSTORE_RETURN.APPROVE, id);

/** Origin store only. PendingApproval → Rejected. */
export async function rejectInterstoreReturn(id, { rejectionReasonId, rejectionNote }) {
  const response = await axiosInstance.post(API.INTERSTORE_RETURN.REJECT, {
    interstore_return_id: id,
    rejection_reason_id: rejectionReasonId,
    rejection_note: rejectionNote,
  });
  return response.data ?? null;
}

/** Receiving store only. Rejected → PendingApproval (bumps resubmission_count). */
export const resubmitInterstoreReturn = (id) =>
  lifecycleAction(API.INTERSTORE_RETURN.RESUBMIT, id);

/** Receiving store only. PendingSettlement → Closed (goods go back to origin). */
export const returnInterstoreReturnToOrigin = (id) =>
  lifecycleAction(API.INTERSTORE_RETURN.RETURN_TO_ORIGIN, id);

/** Receiving store only. PendingSettlement → Closed (receiving store absorbs). */
export const localAbsorbInterstoreReturn = (id) =>
  lifecycleAction(API.INTERSTORE_RETURN.LOCAL_ABSORPTION, id);

/**
 * Mirrors OrnaVerse's own `interstoreReturnStoreRole()` (chunk-GPEGMCP7.js) —
 * gating is by the caller's own company vs. the record's origin/receiving
 * company, never a request-body field.
 * @param {{ origin_company_id?: number, receiving_company_id?: number }} entity
 * @param {number} myCompanyId
 */
export function interstoreReturnStoreRole(entity, myCompanyId) {
  const me = myCompanyId != null ? Number(myCompanyId) : null;
  const org = entity?.origin_company_id != null ? Number(entity.origin_company_id) : null;
  const rcv = entity?.receiving_company_id != null ? Number(entity.receiving_company_id) : null;
  return {
    isOriginStore: me != null && org != null && me === org,
    isReceivingStore: me != null && rcv != null && me === rcv,
  };
}
