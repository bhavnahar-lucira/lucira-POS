// Live per-item price calculation via Services/Helpers/SetSalesItems — the
// endpoint OrnaVerse's own UI calls to price a variant (not GetRate, which
// never fires there once a variant is selected).

import axiosInstance from '@/lib/axios/axiosInstance';
import { getStockPieces, getStockJournalBOM } from '@/services/inventoryService';
import API from '@/constants/apiEndpoints';
import APP_CONFIG from '@/constants/appConfig';

/**
 * Recomputes rate/labour/tax/net_amount for one or more items against
 * today's live metal/stone rates.
 *
 * @param {object[]} items — full item objects as returned by
 *   Style/Retrieve's style_variants[] or Items/Retrieve (send unmodified,
 *   including their placeholder item_rate:0/item_labour:0 and full
 *   item_components[] BOM — the server needs the whole shape to recompute).
 *   `pieces` is force-set to 1 here regardless of the input — see below.
 * @returns {Promise<object[]>} same item shape, with item_rate, item_labour,
 *   sub_total, tax_amount, net_amount, and item_components[].rate/amount
 *   all recomputed against today's rates.
 */
export async function calculateItemRates(items, documentId = 52) {
  if (!items?.length) return [];

  // `pieces` is overloaded in this codebase: elsewhere it's patched to the
  // real per-store stock count (0 for made-to-order) for display purposes,
  // but SetSalesItems expects it as the BOM recipe quantity ("cost of making
  // one piece"), not a stock count — sending pieces:0 reliably 500s the
  // server. Force it to 1 here so callers never have to remember to
  // un-patch it before pricing.
  const pricedItems = items.map((item) => ({ ...item, pieces: 1 }));

  const response = await axiosInstance.post(API.HELPERS.SET_SALES_ITEMS, {
    selected_products:    pricedItems,
    price_list_id:        0,
    calculate_rates:      true,
    document_date:        new Date().toUTCString(),
    // 52 = Estimation, the browse/preview default. An Order (53) prices its
    // catalog items through this same call with the same shape. Invoices do
    // NOT come through here; they price physical stock rows (see
    // priceStockPiecesForSale below).
    document_id:          documentId,
    exchange_rate:        1,
    generate_line_no:     false,
    generate_lot_no:      false,
    is_labour_applicable: true,
    is_purchase:          false,
    is_tax_applicable:    true,
  });

  return response.data?.Entities ?? [];
}

/**
 * Prices ONE item the way it will actually be SOLD — the single source of the
 * figure a customer is shown, from the catalog through to the posted document.
 *
 * The item MASTER is a nominal design spec (a fixed weight), while a
 * physical PIECE on the shelf can weigh meaningfully more or less, and metal
 * is charged per net gram — so pricing the master and pricing the piece can
 * disagree by a large margin, in either direction. Since the cart's
 * unitPrice is persisted and shown to the customer, and the real piece is
 * what gets billed, this prices the piece the counter would actually claim
 * when the shelf has one, and only falls back to the master when the item is
 * genuinely made-to-order (nothing on the shelf to sell).
 *
 * @param {{ item: object, companyId?: number }} params
 * @returns {Promise<object|null>} the priced row (its `sku` is set when a real
 *   piece was priced, absent for made-to-order)
 */
export async function priceItemAsSold({ item, companyId }) {
  if (!item?.item_id) return null;

  if (companyId) {
    // The first AVAILABLE row is the one claimStockPieces would take, so the
    // quote matches the piece that will actually be billed. "Available"
    // excludes is_allocated rows (already reserved by another transaction —
    // see claimStockPieces for why). take: 5, not 1 — with is_allocated
    // filtered client-side, take:1 could land exactly on an allocated row
    // and miss other genuinely-available stock one row further down.
    const response = await getStockPieces({ itemId: item.item_id, companyId, take: 5 });
    const row = (response?.data?.Entities ?? []).find((r) => !r.is_allocated);
    if (row) {
      const [priced] = await priceStockPiecesForSale(
        [row], APP_CONFIG.DOCUMENT_TYPES.POS_INVOICE
      );
      if (priced) return priced;
    }
  }

  return priceItemAsMaster(item);
}

/**
 * Finds ONE real stock piece of this item_id, anywhere — no company_id
 * filter, since this is for BOM REPLICATION only, never for claiming/
 * allocating a piece (a piece at a different store is just as valid a
 * template to copy real component rates from as one at the active store).
 *
 * THE SINGLE SHARED SOURCE for this lookup — every place in the app that
 * prices an item MASTER (this file's own priceItemAsMaster, and
 * checkoutPricingService.buildOrderLineItems) calls this SAME function
 * rather than each keeping its own copy. It used to live only inside
 * checkoutPricingService.js, which is exactly how this bug happened:
 * priceItemAsMaster (the product page's own live quote once a quantity
 * exceeds stock) priced the master's generic default components, while
 * checkout's buildOrderLineItems substituted a real piece's measured BOM —
 * two different prices for the same made-to-order line, reported directly
 * (2026-10-01, item LJ-E00043-14RGLGD: sticky footer total disagreed with
 * the mini cart for the identical quantity). One shared function closes
 * that gap at the ROOT rather than patching the one call site that happened
 * to get reported — any FUTURE caller that needs a master's real price
 * reaches for this same function instead of re-deriving its own copy.
 *
 * Returns null (never throws) whenever no piece exists anywhere, or the BOM
 * lookup itself fails — this is a best-effort accuracy improvement, not a
 * requirement; a genuinely un-stocked item still prices correctly from the
 * master's own default components, same as before this existed.
 *
 * @param {number} itemId
 * @returns {Promise<object[]|null>} real item_components rows, or null
 */
export async function findRealBomComponents(itemId) {
  try {
    const stockResponse = await getStockPieces({ itemId, take: 1 });
    const row = stockResponse?.data?.Entities?.[0];
    if (!row) return null;

    const bomResponse = await getStockJournalBOM({
      itemId:     row.item_id,
      itemLineNo: row.item_line_no,
      locationId: row.location_id,
      companyId:  row.company_id,
      bagNo:      row.bag_no,
      sku:        row.sku,
    });
    const components = bomResponse?.data?.Entities;
    return components?.length ? components : null;
  } catch {
    return null;
  }
}

/**
 * Prices the item MASTER (nominal spec, not a real piece) — what
 * buildOrderLineItems (checkoutPricingService.js) bills for every unit
 * beyond available shelf stock. Exposed on its own (not just as
 * priceItemAsSold's internal fallback) so a quantity that spans BOTH a real
 * piece and a Made to Order shortfall can be quoted as the actual blend of
 * the two, instead of one single-piece rate multiplied across the whole
 * quantity — reported directly (2026-09-30): adding qty 6 of a low-stock
 * item showed a Total nowhere near what checkout then billed, because the
 * product page's own live price only ever quoted ONE basis (piece OR
 * master), never both at once.
 *
 * Substitutes a real stock piece's own BOM (findRealBomComponents, above)
 * before pricing, same as buildOrderLineItems does — so this quote is always
 * the exact figure checkout will go on to bill, not a generic-master
 * approximation of it. See findRealBomComponents' own header for the bug
 * this fixes.
 * @param {object} item
 * @returns {Promise<object|null>}
 */
export async function priceItemAsMaster(item) {
  if (!item?.item_id) return null;
  const bomComponents = await findRealBomComponents(item.item_id);
  const itemToPrice = bomComponents ? { ...item, item_components: bomComponents } : item;
  const [priced] = await calculateItemRates([itemToPrice], APP_CONFIG.DOCUMENT_TYPES.POS_ORDER);
  return priced ?? null;
}

/**
 * Prices actual STOCK PIECES for a sale — the checkout counterpart of
 * calculateItemRates.
 *
 * Two things differ from the catalog-preview call above, and both matter:
 *
 *   • `selected_products` are StockJournal rows (real pieces), not item
 *     master records. SetSalesItems passes their identity fields straight
 *     through — item_line_no, sku, location_id, item_attribute_id and
 *     item_cost all survive into the response untouched, which is precisely
 *     how the Create payload comes to carry them. Feed it a master record
 *     instead and every one of those fields is absent or wrong.
 *   • `document_id` is the real document type (54 = POS Invoice), not the
 *     Estimation type 52 used for browsing. This call also omits
 *     is_labour_applicable/is_purchase entirely.
 *
 * `pieces` is NOT forced to 1 here (unlike calculateItemRates): a stock row
 * already describes exactly one physical piece.
 *
 * @param {object[]} stockRows — rows from inventoryService.getStockPieces,
 *   passed through unmodified.
 * @param {number} documentId — the document type being raised.
 * @returns {Promise<object[]>} priced rows, ready to become line_items.
 */
export async function priceStockPiecesForSale(stockRows, documentId) {
  if (!stockRows?.length) return [];

  const response = await axiosInstance.post(API.HELPERS.SET_SALES_ITEMS, {
    selected_products: stockRows,
    price_list_id:     0,
    calculate_rates:   true,
    document_date:     new Date().toUTCString(),
    document_id:       documentId,
    exchange_rate:     1,
    generate_line_no:  false,
    generate_lot_no:   false,
    is_tax_applicable: true,
  });

  return response.data?.Entities ?? [];
}
