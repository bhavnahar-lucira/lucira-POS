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
 * @returns {Promise<object|null>} the priced row, scaled to exactly ONE unit
 *   when the underlying stock piece is a bulk/commodity row (see
 *   scalePricedRowToQuantity) — its `sku` is set when a real piece was
 *   priced, absent for made-to-order
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
      // Price the row AS-IS first (whatever its own pieces count is) — the
      // server prices a bulk row's real rates off its real weight, so this
      // must not be pre-scaled before the request. Only the RESPONSE needs
      // scaling down to a per-unit figure, for display here — checkout's own
      // claiming (checkoutPricingService.js) scales independently, to
      // whatever quantity is actually being sold, not always 1.
      const [priced] = await priceStockPiecesForSale(
        [row], APP_CONFIG.DOCUMENT_TYPES.POS_INVOICE
      );
      if (priced) return scalePricedRowToQuantity(priced, 1);
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
 * A stock row is USUALLY exactly one physical piece, but some commodity/bulk
 * items (confirmed live 2026-10-21: gold coin SKU LJ-GC0002-916YGPG) are
 * stocked as ONE StockJournal row holding many identical units at once
 * (`pieces: 356`, a single bag) rather than one row per unit — e.g. selling
 * 3 coins out of an 85-coin bag.
 *
 * NEVER ask the server to re-price a SCALED-DOWN request for part of a bulk
 * row — confirmed live 2026-10-21 (same SKU/stock_journal_id, same making-
 * charge operation): priced at its real full quantity (356 pcs, 35.6g),
 * SetSalesItems charged labour per NET-WEIGHT GRAM (₹500/g × 35.6g = ₹17,800,
 * uoc_id 62); asked to price a pre-scaled 4 pcs/0.4g request for the SAME
 * item instead, it silently switched to a per-PIECE minimum-charge basis
 * (₹500/piece × 4 = ₹2,000, uoc_id 61) — ELEVEN TIMES the correct pro-rata
 * figure (₹200), not a rounding slip. Whatever bracket/threshold decides
 * that basis lives entirely server-side and isn't something a client can
 * predict or avoid by how it shapes the request.
 *
 * This is exactly why OrnaVerse's own Invoice cart — confirmed live, same
 * investigation — never re-queries the server when its own "Pieces" field is
 * edited down on a bulk line: it only ever prices the row ONCE, at its real
 * full quantity, then derives any smaller quantity's price by multiplying
 * that ONE response's own per-unit rate — client-side arithmetic, no second
 * round trip, and no risk of landing in a different pricing bracket. This
 * function is that same derivation: scales an ALREADY-PRICED row (the real
 * server response for the row's own full pieces/weight) down to exactly
 * `targetPieces` units, by dividing every genuine AGGREGATE total by the
 * row's own full piece count and multiplying by the target.
 *
 * Deliberately leaves `item_rate` (a ₹-per-GRAM metal rate, not a total) and
 * `item_labour` alone from the TOTALS treatment below — both are already a
 * rate/per-unit figure in the response, confirmed to read identically
 * (₹50) whether the row holds 85 or 356 pieces; scaling them again would
 * double-apply the ratio (the exact bug this header is warning about, just
 * on the client side instead of the server's).
 *
 * A no-op for the common case (`targetPieces` already equal to the row's own
 * `pieces`, e.g. 1-piece rows and a bulk row sold in full) — returns the row
 * unchanged.
 *
 * @param {object} priced — a SetSalesItems response row, priced at its own
 *   real, full, UNMODIFIED pieces/weight (never pre-scaled)
 * @param {number} targetPieces — how many of the row's own units this claim
 *   actually covers
 * @returns {object} the row, scaled to `targetPieces` units
 */
export function scalePricedRowToQuantity(priced, targetPieces) {
  const rowPieces = priced.pieces > 0 ? priced.pieces : 1;
  if (targetPieces === rowPieces) return priced;

  const ratio = targetPieces / rowPieces;
  const scale = (n) => (typeof n === 'number' ? +(n * ratio).toFixed(2) : n);
  const scaleWeight = (n) => (n != null ? +(n * ratio).toFixed(6) : n);
  const scaleCount  = (n) => (typeof n === 'number' ? Math.round(n * ratio) : n);
  return {
    ...priced,
    pieces:          targetPieces,
    weight:          scaleWeight(priced.weight),
    net_weight:      scaleWeight(priced.net_weight),
    pure_weight:     scaleWeight(priced.pure_weight),
    metal_amount:    scale(priced.metal_amount),
    diamond_amount:  scale(priced.diamond_amount),
    diamond_pieces:  scaleCount(priced.diamond_pieces),
    diamond_weight:  scaleWeight(priced.diamond_weight),
    stone_amount:    scale(priced.stone_amount),
    stone_pieces:    scaleCount(priced.stone_pieces),
    stone_weight:    scaleWeight(priced.stone_weight),
    color_stone_amount: scale(priced.color_stone_amount),
    color_stone_pieces: scaleCount(priced.color_stone_pieces),
    color_stone_weight: scaleWeight(priced.color_stone_weight),
    other_amount:    scale(priced.other_amount),
    other_pieces:    scaleCount(priced.other_pieces),
    other_weight:    scaleWeight(priced.other_weight),
    item_cost:       scale(priced.item_cost),
    sub_total:       scale(priced.sub_total),
    base_sub_total:  scale(priced.base_sub_total),
    taxable_amount:  scale(priced.taxable_amount),
    tax_amount:      scale(priced.tax_amount),
    base_tax_amount: scale(priced.base_tax_amount),
    net_amount:      scale(priced.net_amount),
    base_net_amount: scale(priced.base_net_amount),
    item_taxes: Array.isArray(priced.item_taxes)
      ? priced.item_taxes.map((t) => ({
          ...t,
          taxable_amount: scale(t.taxable_amount),
          tax_amount:     scale(t.tax_amount),
          base_tax_amount: scale(t.base_tax_amount),
        }))
      : priced.item_taxes,
  };
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
 * already describes exactly one physical piece, or, for a bulk/commodity
 * row, however many units are really in it — ALWAYS its own real, full
 * count. Never pre-scaled before this call (see scalePricedRowToQuantity's
 * own header for why asking the server to price anything other than a row's
 * real full quantity is unsafe); a partial claim is derived from this
 * function's own response afterward, client-side.
 *
 * @param {object[]} stockRows — rows from inventoryService.getStockPieces,
 *   passed through completely unmodified.
 * @param {number} documentId — the document type being raised.
 * @returns {Promise<object[]>} priced rows, ready to become line_items.
 */
export async function priceStockPiecesForSale(stockRows, documentId) {
  if (!stockRows?.length) return [];

  const post = (products, docId) => axiosInstance.post(API.HELPERS.SET_SALES_ITEMS, {
    selected_products: products,
    price_list_id:     0,
    calculate_rates:   true,
    document_date:     new Date().toUTCString(),
    document_id:       docId,
    exchange_rate:     1,
    generate_line_no:  false,
    generate_lot_no:   false,
    is_tax_applicable: true,
  });

  try {
    const response = await post(stockRows, documentId);
    return response.data?.Entities ?? [];
  } catch (err) {
    // OrnaVerse's own Invoice-costing path (document_id 54) can fail to
    // resolve a stock piece's BOM even though the piece itself is real and
    // genuinely available — confirmed live 2026-10-21, stock_journal_id
    // 93051 (LJ-GC0002-916YGPG at HO): "Unable to load BOM for <code>" at
    // document_id 54, while the IDENTICAL row prices fine (material
    // component silently dropped, priced labour-only) at document_id 52
    // (Estimation) — captured directly from OrnaVerse's own Estimation
    // screen's network call for this exact item, not something invented
    // here. Retried with that SAME fallback so a piece with this specific
    // OrnaVerse-side data gap still gets a real, sellable price instead of
    // hanging forever (the catalog/product-page symptom this was reported
    // as) — matching upstream's own observed behavior exactly.
    //
    // CAVEAT: this fixes PRICING only. Whether Invoice/Create itself still
    // accepts this exact stock piece at actual submission time is unverified
    // — its own internal costing may hit the same BOM gap independently of
    // what document_id this preview call used. Not tested against a real
    // Create call (deliberately — see this file's own standing practice of
    // never placing a real order during a live investigation).
    const message = err?.response?.data?.Error?.Message ?? '';
    if (documentId === APP_CONFIG.DOCUMENT_TYPES.POS_INVOICE && /Unable to load BOM/i.test(message)) {
      console.warn('[pricingService] priceStockPiecesForSale: BOM load failed at Invoice costing, retrying as Estimation', message);
      const response = await post(stockRows, APP_CONFIG.DOCUMENT_TYPES.ESTIMATION);
      return response.data?.Entities ?? [];
    }
    throw err;
  }
}
