// Service functions for inventory and stock operations.

import axiosInstance from '@/lib/axios/axiosInstance';
import API from '@/constants/apiEndpoints';
import { getClientActiveEnv } from '@/lib/ornaverse/activeEnvClient';

/**
 * Real-time stock check for a specific item SKU as of today.
 * @param {string} itemCode — item_code (SKU)
 */
export const getStock = (itemCode) =>
  axiosInstance.post(API.INVENTORY.GET_STOCK, {
    item_code: itemCode,
    to_date: new Date().toISOString().split('T')[0],
  });

/**
 * Cross-store stock breakdown for a specific item.
 * @param {number} itemId — item_id
 */
export const getStockByStores = (itemId) =>
  axiosInstance.post(API.CATALOG.GET_STOCK_BY_STORES, { item_id: itemId });

/**
 * The individual PHYSICAL PIECES of an item held at a store — one row per
 * piece, each with its own SKU, stock line number, location and cost.
 *
 * This is what OrnaVerse's own POS Invoice tab lists under "Browse Stock"
 * (captured from their UAT counter 2026-08-05). It is a different thing from
 * the product catalog: the catalog describes a PRODUCT, this returns the
 * actual items on the shelf. Billing needs the latter — see
 * checkoutPricingService for why.
 *
 * `has_sku: true` restricts to pieces that have been given a stock SKU, i.e.
 * real sellable inventory. `company_id` is essential: this table spans every
 * branch (1992 rows for HO alone), so omitting it can hand back a piece
 * sitting in another store.
 *
 * Accepts either a single `itemId` or an `itemIds` array — the plural filter
 * is honoured server-side (verified on UAT 2026-08-05: querying two ids where
 * only one has stock returns just that one's rows, in either order). That is
 * what lets the catalog price a whole page of products against real pieces in
 * ONE call instead of one call per card.
 *
 * @param {{ itemId: number, companyId: number, take?: number }} params
 * @returns {Promise<import('axios').AxiosResponse>} { Entities: StockJournalRow[] }
 */
export const getStockPieces = ({ itemId, itemIds, companyId, take = 50 }) =>
  axiosInstance.post(API.INVENTORY.STOCK_JOURNAL_LIST, {
    Skip:       0,
    Take:       take,
    ...(itemIds?.length ? { item_ids: itemIds } : { item_id: itemId }),
    company_id: companyId,
    has_sku:    true,
  });

/**
 * The real, per-piece Bill of Materials (raw-material rows: rm_id, rate,
 * pieces, weight) for ONE physical stock piece — CONFIRMED live 2026-09-30
 * via a network capture of OrnaVerse's own Order tab (F3): pricing a Made
 * to Order line calls this (keyed by a real stock piece's own item_line_no)
 * and substitutes the result into the item MASTER's own item_components[]
 * before SetSalesItems, instead of using the master's generic default BOM.
 * This is what makes an MTO booking's diamond/stone cost reflect a REAL
 * piece's actual measured composition when one exists anywhere, rather than
 * the master's nominal recipe — see checkoutPricingService.buildOrderLineItems.
 *
 * @param {{ itemId: number, itemLineNo: number, locationId: number,
 *   companyId: number, bagNo?: string, sku: string }} params
 * @returns {Promise<import('axios').AxiosResponse>} { Entities: BomRow[] }
 */
export const getStockJournalBOM = ({ itemId, itemLineNo, locationId, companyId, bagNo = '', sku }) =>
  axiosInstance.post(API.INVENTORY.STOCK_JOURNAL_BOM_LIST, {
    item_id:      itemId,
    item_line_no: itemLineNo,
    location_id:  locationId,
    company_id:   companyId,
    bag_no:       bagNo,
    sku,
  });

/**
 * Resolves a scanned barcode to the physical piece it was printed on, and
 * the item/product it belongs to.
 *
 * The barcode printed on a physical piece encodes `sku` (this row's own
 * per-piece identifier, e.g. "LJ082611756") — NOT `item_code` (the catalog/
 * style code, e.g. "LJ-R00604-18YGLGD-10", shared across every piece of that
 * style). The catalog barcode-scan handler previously matched only against
 * `item_code`, which is why a real physical-piece scan could never resolve.
 *
 * REQUEST SHAPE — CONFIRMED TO DIVERGE BETWEEN ENVIRONMENTS:
 *   - UAT (confirmed 2026-08-09, live capture of OrnaVerse's own client):
 *     `{ sku, Take: 1 }` alone. Adding `company_id`/`has_sku`, or an
 *     `EqualityFilter` wrapper, OVER-filtered there — zero rows for a sku
 *     confirmed to exist.
 *   - LIVE (CONFIRMED 2026-09-09 by direct testing against 3 real stock
 *     pieces across 2 stores): the OPPOSITE. `{ sku, Take: 1 }` alone
 *     returns ZERO rows for skus confirmed to exist via a company_id-scoped
 *     StockJournal/List call — meaning "Scan Barcode" never resolved
 *     anything at all on LIVE before this fix, every scan hitting "No
 *     product found" unconditionally. Sending the CORRECT `company_id`
 *     returns the real row; sending the WRONG one correctly returns empty
 *     (genuine server-side scoping on LIVE, not a coincidence).
 * So: send `company_id` only on LIVE (gated on ACTIVE_ENV), preserving
 * UAT's own already-confirmed-working shape rather than regressing it.
 *
 * @param {{ sku: string, companyId?: number }} params — companyId required
 *   for a working lookup on LIVE; ignored on UAT (see above)
 * @returns {Promise<import('axios').AxiosResponse>} { Entities: StockJournalRow[] }
 */
export const getStockPieceBySku = async ({ sku, companyId }) => {
  // Asks the SERVER which environment it's currently pointed at, rather
  // than importing a build-time constant — see activeEnvClient.js's own
  // header. Runs in the browser (this function is called from barcode-scan
  // UI), so it can't just read environment.js's ACTIVE_ENV directly: that
  // would get permanently baked into the client bundle at the last
  // `next build`, defeating the whole point of a server restart being able
  // to flip environments without a rebuild.
  const activeEnv = await getClientActiveEnv();
  return axiosInstance.post(API.INVENTORY.STOCK_JOURNAL_LIST, {
    Skip: 0,
    Take: 1,
    sku,
    // FIXED 2026-09-30 (reported directly, confirmed live) — without this,
    // a real, confirmed-existing sku ("LJ02266943") returned zero rows on
    // UAT; adding it resolved instantly. Matches OrnaVerse's own real client,
    // per direct confirmation: it sends `sku` alongside `has_sku` in this
    // exact call for its own search.
    has_sku: true,
    ...(activeEnv === 'LIVE' ? { company_id: companyId } : {}),
  });
};

/**
 * Records an "item enquiry" — logs that this physical piece was looked up
 * (e.g. via barcode scan, or a SKU search on the sales counter). CONFIRMED
 * 2026-08-10 via a live network capture on lucira.uat.ornaverse.in/pos:
 * their own client fires this immediately after StockJournal/List resolves
 * the scanned sku, built entirely from fields already present on that same
 * row (item_id, item_attribute_id, company_id, item_line_no, sku, image)
 * plus a fresh timestamp in `Date.toUTCString()` format (e.g. "Mon, 10 Aug
 * 2026 10:47:41 GMT").
 *
 * `party_id` — CONFIRMED live 2026-09-30 (a second capture, this time from
 * the Estimation tab's own SKU search box, with a customer attached): their
 * payload also carries `party_id` (the attached customer), which the first
 * capture's flow never exercised (no customer attached at the time). Fires
 * again on a genuinely identical repeat search (same sku, same stock row) —
 * a new EntityId both times — confirming this is never dedup'd, purely a
 * log of "this was looked at," fired every time regardless of repetition.
 *
 * This is a logging/analytics side effect on OrnaVerse's side (presumably
 * feeding an "items enquired about" report), NOT part of the actual scan-
 * to-product resolution — StockJournal/List alone already answers that.
 * Callers should fire this best-effort and never let its failure block or
 * fail the scan itself.
 *
 * @param {{ itemId: number, itemAttributeId: number, companyId: number,
 *   itemLineNo: number, sku: string, partyId?: number|null, image?: string }} params
 * @returns {Promise<import('axios').AxiosResponse>}
 */
export const createItemEnquiry = ({
  itemId, itemAttributeId, companyId, itemLineNo, sku, partyId = null, image,
}) =>
  axiosInstance.post(API.INVENTORY.ITEM_ENQUIRIES_CREATE, {
    Entity: {
      item_id:           itemId,
      item_attribute_id: itemAttributeId,
      date:              new Date().toUTCString(),
      company_id:        companyId,
      item_line_no:      itemLineNo,
      sku,
      ...(partyId != null && { party_id: partyId }),
      image:             image ?? '',
    },
  });