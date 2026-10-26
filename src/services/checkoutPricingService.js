// Builds Invoice/Order Create line_items[] from the REAL STOCK PIECES being
// sold, captured from OrnaVerse's own UAT sales counter.
//
// Pricing the catalog record and handing the result to Create produces a
// payload the server accepts structurally but cannot fulfil, since it never
// names the physical piece leaving the shelf — every such attempt was
// rejected with "Not enough stock of <item_code> can not Save", which reads
// like the shelf is empty even when it isn't. The captured journey:
//
//   1. Inventory/StockJournal/List { item_id, company_id, has_sku: true }
//        → one row per physical piece, already carrying item_line_no, sku,
//          location_id, item_attribute_id and a real item_cost.
//   2. Helpers/SetSalesItems { selected_products: [...those rows...],
//                              document_id: 54 }
//        → prices them; every identity field above passes through untouched.
//   3. POS/Invoice/Create { line_items: [...priced rows + sales_person_id] }
//        → 200. sales_person_id is the only field added after pricing.
//
// item_line_no (the STOCK LINE of the physical piece, not a 1..n counter),
// sku (the piece's own stock SKU, not the item code) and item_cost (its real
// purchase cost, not 0 or derived) all arrive on the stock row rather than
// being fabricated.
//
// Re-pricing happens at SUBMISSION time rather than trusting whatever was
// computed at add-to-cart, since metal rates move intraday.
//
// An ORDER (document 53) is a different path entirely — a booking, usually
// for a piece not on the shelf ("MTO", made to order). It does not check
// stock for CLAIMING purposes, but CONFIRMED live 2026-09-30 (OrnaVerse's
// own Order tab, F3): it still looks up a real stock piece of the same
// item_id if one exists ANYWHERE (any store — no company_id filter, unlike
// claiming), fetches that ONE piece's real Bill of Materials
// (StockJournalBOM/List, keyed by its own item_line_no), and substitutes
// those real raw-material rows into the item MASTER's own item_components[]
// before pricing — so an MTO booking's diamond/stone cost reflects a real
// piece's actual measured composition, not the master's generic default BOM,
// whenever a real piece exists to copy from. Only falls back to the
// master's own unmodified components when no stock piece exists anywhere.
// buildPricedLineItems branches on which path (Invoice/Order) applies; see
// buildOrderLineItems for both of the above.

import { getStockPieces } from '@/services/inventoryService';
import { getItemDetail, getDesignVariants } from '@/services/itemService';
import { priceStockPiecesForSale, calculateItemRates, findRealBomComponents, scalePricedRowToQuantity } from '@/services/pricingService';
import { applyPromotions } from '@/services/promotionService';
import { sumRealGst } from '@/lib/gst';
import APP_CONFIG from '@/constants/appConfig';

/**
 * Applies every selected promotion to already-priced lines, through
 * OrnaVerse's own calculator.
 *
 * A promotion's value is not something this client can work out — the
 * percentage applies to a COMPONENT of the item chosen by
 * `discount_calc_on` (diamond / making charges / whole value), and the
 * server re-taxes the line afterwards. See promotionService.applyPromotions
 * for the captured contract.
 *
 * Promotions fold in sequence: each round is handed the previous round's
 * lines and the promotion rows raised so far, exactly as their POS does it.
 * Only the newest row comes back each time, so they are accumulated here.
 *
 * @param {{
 *   lineItems: object[],
 *   appliedPromos: {promoCode: string, promoDetails: object}[],
 *   documentId: number,
 *   exchangeRate?: number,
 * }} params
 * @returns {Promise<{ lineItems: object[], promotionDetails: object[] }>}
 */
export async function applyPromotionsToLines({
  lineItems, appliedPromos, documentId, exchangeRate = 1,
}) {
  if (!appliedPromos?.length) return { lineItems, promotionDetails: [] };

  let lines = lineItems;
  let promotionDetails = [];

  for (const promo of appliedPromos) {
    if (!promo?.promoDetails) continue;

    // A component-scoped promotion ("20% Off Diamond") on an item with zero
    // diamond value gets a normal 200 with the basket unchanged (handled by
    // the empty-items check below). But a flat/whole-value promotion applied
    // to an item ineligible for that promotion class (e.g. a gold coin) gets
    // an outright 400 "No items match the promotion criteria" — a genuine
    // server-side eligibility rule, not a bug to route around. Left uncaught,
    // that 400 fails pricing for the ENTIRE cart and disables Place Order for
    // every line, not just the ineligible one, with no indication why — so
    // it's caught here and folded into the same "declined to price" path,
    // reaching the operator via DiscountSection's "Doesn't apply to these
    // items" message instead of silently blocking the sale.
    let response;
    try {
      response = await applyPromotions({
        selected_products: lines,
        promotion:         promo.promoDetails,
        promotions:        promotionDetails,
        document_id:       documentId,
        exchange_rate:     exchangeRate,
        override_amount:   promo.overrideAmount ?? null,
      });
    } catch (err) {
      console.warn(
        `[checkoutPricingService] promotion "${promo.promoCode}" rejected by server`,
        err?.serverMessage ?? err?.message ?? err,
      );
      continue;
    }

    let items = response?.data?.items;
    const rows  = response?.data?.invoice_promotions ?? [];

    // OrnaVerse's own ApplyPromotions schema carries a top-level `warning`
    // string we'd never read otherwise — confirmed live (2026-10-12) it's
    // simply absent (not even null) on an ordinary clean success, so it's
    // only ever sent when there's something worth flagging (a capped
    // quantity, a partial match). Logged rather than silently dropped, so a
    // future occurrence is at least visible instead of invisible.
    if (response?.data?.warning) {
      console.warn(`[checkoutPricingService] promotion "${promo.promoCode}" warning`, response.data.warning);
    }

    // A promotion the server declines to price (not applicable to anything in
    // the basket) comes back with no items. Leave the lines as they were
    // rather than dropping the basket on the floor.
    if (!Array.isArray(items)) continue;

    // A free-gift item has no standalone price, so an "excess, should be
    // charged" row still prices at net_amount 0 — identical to a genuinely
    // free one. Confirmed live 2026-10-25: all 25 speculative gold-coin rows
    // came back instead of OrnaVerse omitting the excess (the case the
    // "fewer rows" handling below expects); the real count (2) was only in
    // this warning string. Trim it off manually to the same effect.
    const freeItemId = promo.promoDetails?.free_item_id;
    const coveredMatch = typeof response?.data?.warning === 'string'
      ? response.data.warning.match(/covers\s+(\d+)\s*pcs?/i)
      : null;
    if (freeItemId != null && coveredMatch) {
      const covered = Number(coveredMatch[1]);
      let kept = 0;
      items = items.filter((row) => {
        if (row.item_id !== freeItemId) return true;
        kept += 1;
        return kept <= covered;
      });
    }

    if (items.length > lines.length) {
      // MORE rows back than sent — never observed, genuinely unexplained if
      // it happens. Logged so a real instance of this is visible instead of
      // reading as "nothing happened" with a 200 in the network tab.
      console.warn(
        `[checkoutPricingService] promotion "${promo.promoCode}" returned ${items.length} priced rows, expected ${lines.length} (more than sent) — discarding this promotion's effect`,
      );
      continue;
    }

    // FEWER rows back than sent is a LEGITIMATE signal, not an error —
    // CONFIRMED LIVE 2026-10-22. A "Spend X Get Y Free" promo's free-gift
    // line sends MORE candidate units than the real entitlement (Y is never
    // exposed up front — see useGoldCoinPromoManager's own quantity-
    // discovery probe, which deliberately over-asks to find it). This
    // observed directly: 26 rows sent (1 real item + 25 speculative
    // free-gift candidates), 3 came back (the 1 real item + exactly 2 real
    // free rows) — ApplyPromotions doesn't echo the un-entitled excess at
    // all, it just omits them. The OLD strict-equality check treated this
    // as "declined" and discarded the WHOLE promotion's effect every time
    // the probe (deliberately) overshot the real entitlement — which is
    // most of the time — reproducing live as "applied, then removed
    // automatically" moments later. Accepting the shorter result directly
    // is what lets the free-gift quantity settle down to the real
    // entitlement instead.
    if (items.length < lines.length) {
      console.info(
        `[checkoutPricingService] promotion "${promo.promoCode}" returned fewer rows than sent (${items.length} of ${lines.length}) — accepting as the real (trimmed) entitlement`,
      );
    }

    lines = items;
    promotionDetails = [...promotionDetails, ...rows];
  }

  return { lineItems: lines, promotionDetails };
}

/**
 * Fetches every stock candidate for ALL distinct item_ids in the cart in ONE
 * batched call, instead of one network round trip per distinct item.
 *
 * The only thing that genuinely needs per-item sequencing is the `claimed`
 * Set (stopping two lines claiming the same physical piece), which only
 * matters between lines sharing an item_id — getStockPieces' rows are
 * already scoped by item_id server-side, so the fetch itself is safe to
 * batch. getStockPieces' `itemIds` (plural) filter is already used the same
 * way to price a whole catalog page in one call.
 *
 * `take` is a SHARED ceiling across every distinct item_id in one flat,
 * Take-capped result set — not a guaranteed per-item page. A high-volume
 * item could in principle fill the whole shared cap and crowd a genuinely
 * in-stock low-volume item out of this batch entirely; claimStockPieces
 * below re-fetches (scoped to just that item) whenever this batch looks
 * insufficient, so that scenario still resolves correctly at the cost of one
 * extra call in that specific, uncommon case.
 *
 * @param {{itemId:number}[]} items
 * @param {number} activeStoreId
 * @returns {Promise<Map<number, object[]>>} item_id → its stock rows
 */
async function fetchStockCandidatesByItemId({ items, activeStoreId }) {
  const distinctItemIds = [...new Set(items.map((item) => item.itemId))];
  if (distinctItemIds.length === 0) return new Map();

  const response = await getStockPieces({
    itemIds:   distinctItemIds,
    companyId: activeStoreId,
    take:      distinctItemIds.length * 50,
  });
  const rows = response?.data?.Entities ?? [];

  const byItemId = new Map();
  for (const row of rows) {
    const bucket = byItemId.get(row.item_id);
    if (bucket) bucket.push(row);
    else byItemId.set(row.item_id, [row]);
  }
  return byItemId;
}

/**
 * Claims the physical pieces a cart line will consume, from candidates
 * already fetched by fetchStockCandidatesByItemId — purely in-memory, no
 * network call of its own.
 *
 * One stock row IS one piece, so a cart line for 3 needs 3 distinct rows.
 * Claimed rows are tracked by stock_journal_id across the whole cart so the
 * same piece can never be billed twice — possible when the same product sits
 * in the cart under two lines (different size/style selections).
 *
 * Every StockJournal row carries `is_allocated`, a real flag meaning the row
 * may already be reserved by ANOTHER transaction. This is what "in stock"
 * actually means to OrnaVerse's own Invoice flow — not merely "a row exists
 * for this item" but "a row exists AND nothing else has already claimed it".
 * It's filtered out here alongside the in-session `claimed` set (`claimed`
 * stops double-claiming within THIS cart; `is_allocated` stops claiming a
 * piece some OTHER transaction already holds) — this filter is the actual
 * mechanism that decides whether a cart becomes an Invoice (stock-backed) or
 * an Order (made-to-order).
 *
 * `item.fulfillmentItemLineNo` (set by orderFulfillmentService's
 * mapFulfillmentLineToCartItem) steers this to claim the SAME physical piece
 * a source order already reserved, instead of an arbitrary one of the same
 * item_id — required for the source order to actually close out
 * server-side, and to stop two open orders on the same style from claiming
 * each other's piece.
 *
 * @param {{ item: object, activeStoreId: number, claimed: Set<number>, candidatesByItemId: Map<number, object[]> }} params
 * @returns {Promise<{row: object, piecesClaimed: number}[]>} claims totaling
 *   up to `item.quantity` units — PARTIAL (reported directly, 2026-09-30: a
 *   qty-2 line with only 1 free piece was tipping the WHOLE line into Made
 *   to Order instead of splitting into a 1-unit invoice portion + a 1-unit
 *   order portion) is expected and fine; never null — an empty array means
 *   nothing could be claimed at all. buildPricedLineItems is what turns a
 *   partial result into two separate line portions.
 *
 *   Most rows are exactly one physical piece (`row.pieces === 1`), so one
 *   claim there is one unit, same as always. A bulk/commodity row (confirmed
 *   live 2026-10-21: gold coin SKU LJ-GC0002-916YGPG, stocked as ONE
 *   StockJournal row holding many identical units — `pieces: 85` in a single
 *   bag) can alone satisfy several units of `wanted` through ONE claim, with
 *   `piecesClaimed` less than the row's own full `pieces` count whenever
 *   only part of that bag is being sold — mirrors OrnaVerse's own Invoice
 *   cart, which lets an operator edit a bulk line's "Pieces" down from the
 *   bag's full count and reprices purely proportionally (client-side, off
 *   the row's own full-quantity price — see scalePricedRowToQuantity for
 *   why this is derived rather than re-queried) rather than needing a
 *   separate row per unit.
 * @throws only on the fulfillment path, when the specific reserved piece is
 *   no longer available — that one has no "partial" concept (always qty 1).
 */
async function claimStockPieces({ item, activeStoreId, claimed, candidatesByItemId }) {
  let rows = candidatesByItemId.get(item.itemId) ?? [];
  let available = rows.filter((r) => !r.is_allocated && !claimed.has(r.stock_journal_id));

  // Only re-fetches (scoped to just THIS item_id) when the shared batch looks
  // insufficient for what THIS item needs — see this function's header for
  // why the shared batch can legitimately come up short for one item even
  // though it genuinely has stock. The common case (every item's fair share
  // already in the batch) never pays this extra call. Summed by each row's
  // OWN pieces count, not row count — a single bulk row can cover several
  // wanted units on its own.
  const neededForThisItem = item.fulfillmentItemLineNo != null ? 1 : (item.quantity ?? 1);
  const availablePieces = (rows) => rows.reduce((sum, r) => sum + (r.pieces > 0 ? r.pieces : 1), 0);
  if (availablePieces(available) < neededForThisItem) {
    const response = await getStockPieces({ itemId: item.itemId, companyId: activeStoreId });
    rows = response?.data?.Entities ?? [];
    available = rows.filter((r) => !r.is_allocated && !claimed.has(r.stock_journal_id));
  }

  if (item.fulfillmentItemLineNo != null) {
    // Fulfilling a specific order line — only the one piece it reserved will
    // do. Falling back to a different piece of the same item_id would still
    // complete A sale, but silently stop being "fulfillment" (the source
    // order would never close out, since correlation is keyed off this exact
    // item_line_no) — surfacing a clear error beats an operator believing
    // they fulfilled an order they didn't.
    const row = available.find((r) => r.item_line_no === item.fulfillmentItemLineNo);
    if (!row) {
      throw new Error(
        `"${item.itemName}" is no longer available to fulfill — the reserved piece may have just been claimed by another sale. Refresh "Fulfill from Order" and try again.`
      );
    }
    claimed.add(row.stock_journal_id);
    return [{ row, piecesClaimed: row.pieces > 0 ? row.pieces : 1 }];
  }

  const wanted = item.quantity ?? 1;

  // Short stock is NOT an error here — a basket the shelf can't fill simply
  // becomes an order instead of a dead end. Claims as many units as are
  // actually free, up to `wanted`, greedily across rows in order — may total
  // fewer than `wanted`, or zero; never rejects the whole line just because
  // it can't fill it completely (see this function's own @returns note on
  // why that changed). Once ANY pieces are taken from a row, the WHOLE row
  // is marked claimed — a second cart line can't also draw from its
  // remainder, but cartSlice.addItem already merges same item/size/style
  // lines into one, so two distinct lines competing for the same bulk row's
  // leftovers doesn't arise through normal use.
  const claims = [];
  let remaining = wanted;
  for (const row of available) {
    if (remaining <= 0) break;
    const rowPieces = row.pieces > 0 ? row.pieces : 1;
    const take = Math.min(rowPieces, remaining);
    claims.push({ row, piecesClaimed: take });
    claimed.add(row.stock_journal_id);
    remaining -= take;
  }
  return claims;
}


/**
 * Resolves a cart item back to its FULL master record — the Style variant
 * when we know the style, else the plain Items/Retrieve Entity. Both shapes
 * carry the item_components[] BOM that SetSalesItems recomputes against.
 */
async function resolveFullItem({ itemId, styleId }) {
  if (styleId) {
    const response = await getDesignVariants(styleId);
    const variants = response?.data?.Entity?.style_variants ?? [];
    const variant = variants.find((v) => v.item_id === itemId);
    if (variant) return variant;
    // Fall through rather than failing checkout outright for an item whose
    // style lookup didn't happen to include it.
  }
  const response = await getItemDetail(itemId);
  return response?.data?.Entity ?? null;
}

/**
 * Prices from the CATALOG ITEM MASTER — the made-to-order path.
 *
 * Used only when the shelf can't supply the basket ("(MTO)" on their own
 * counter). Doc 53 doesn't check stock for CLAIMING: the master goes to
 * SetSalesItems with document_id 53, no StockJournal call to CLAIM a piece.
 * It DOES still substitute a real piece's own BOM into that master when one
 * exists anywhere — see findRealBomComponents' own header and this file's
 * top comment for the confirmed-live mechanism this mirrors.
 *
 * @returns {Promise<object[]>} one priced line per piece
 */
async function buildOrderLineItems({ items, documentId }) {
  // No shared mutable state across items here (unlike claimStockPieces), so
  // this runs concurrently rather than one item at a time.
  //
  // allSettled, not Promise.all: Promise.all rejects on whichever promise
  // fails first CHRONOLOGICALLY, not first by cart order, so if two items'
  // lookups both fail the error could name whichever happened to reject
  // faster. allSettled always resolves, so the check below walks `items` in
  // cart order and reports the first genuine failure deterministically.
  const settled = await Promise.allSettled(
    items.map(async (item) => {
      const [master, bomComponents] = await Promise.all([
        resolveFullItem({ itemId: item.itemId, styleId: item.styleId }),
        findRealBomComponents(item.itemId),
      ]);
      if (!master) return null;
      return bomComponents ? { ...master, item_components: bomComponents } : master;
    })
  );

  const masters = [];
  items.forEach((item, i) => {
    const result = settled[i];
    if (result.status === 'rejected') throw result.reason;
    const master = result.value;
    if (!master) {
      throw new Error(`"${item.itemName}" could not be priced — its product record was not found.`);
    }
    // One line per piece, matching how the invoice path models a sale and
    // how the header's `pieces` aggregate is summed.
    for (let p = 0; p < (item.quantity ?? 1); p += 1) masters.push(master);
  });

  const priced = await calculateItemRates(masters, documentId);
  if (priced.length !== masters.length) {
    throw new Error('Live pricing failed — the server priced a different number of items than were sent.');
  }
  return priced;
}

/**
 * Prices the basket ONCE, and decides for the WHOLE CART whether it is an
 * Invoice or an Order — never both.
 *
 * REVERTED 2026-09-30 (explicit direction) — this used to partition PER
 * LINE, and even PER UNIT within a line (a qty-2 line with only 1 free piece
 * became a 1-unit invoice portion + a 1-unit order portion), raising two
 * separate real documents for one sale. That's gone: the moment ANY line in
 * the cart can't be fully claimed against real stock, the ENTIRE cart —
 * every line, including ones that individually had enough stock — is priced
 * as ONE Order (made-to-order) instead. Only when EVERY line's full
 * quantity is claimed does the cart become one Invoice. OrnaVerse's own POS
 * has no unified cart at all (an operator raises an Invoice or an Order by
 * hand, never both from one basket) — this matches that, one document per
 * checkout, same as before the per-line split existed.
 *
 * OrnaVerse's own server enforces, structurally, that an Invoice line must
 * always name a real physical piece — confirmed live (2026-09-29):
 * SetSalesItems refuses to even PRICE a master-only row against document_id
 * 54 ("Unable to load BOM for <code>"), the identical row prices fine
 * against 53.
 *
 * @param {{
 *   items: {itemId, itemName, styleId, quantity}[],
 *   activeStoreId: number,
 *   salesPersonId?: number,
 * }} params
 * @returns {Promise<{
 *   invoice: { cartItems: object[], lineItems: object[] } | null,
 *   order:   { cartItems: object[], lineItems: object[] } | null,
 * }>}
 *   Exactly one of invoice/order is non-null (or both null for an empty
 *   cart) — never both at once.
 */
export async function buildPricedLineItems({ items, activeStoreId, salesPersonId }) {
  const claimed = new Set();

  // ONE network round trip for every distinct item_id in the cart — see
  // fetchStockCandidatesByItemId's header comment.
  const candidatesByItemId = await fetchStockCandidatesByItemId({ items, activeStoreId });

  // The CLAIMING itself stays sequential, in cart order — `claimed` is what
  // stops two cart lines claiming the same piece, and it only works if the
  // claims don't race. Usually pure in-memory bookkeeping (no network wait);
  // still `await`ed because claimStockPieces can fall back to a scoped
  // per-item re-fetch when the shared batch came up short for one item (see
  // its own header comment) — a rare path, not the common case.
  const claimsByItem = [];
  let fullyStocked = true;
  for (const item of items) {
    const claims = await claimStockPieces({ item, activeStoreId, claimed, candidatesByItemId });
    const wanted = item.quantity ?? 1;
    const claimedPieces = claims.reduce((sum, c) => sum + c.piecesClaimed, 0);
    if (claimedPieces < wanted) fullyStocked = false;
    claimsByItem.push(claims);
  }

  const applySalesPerson = (rows) => (salesPersonId == null
    ? rows
    : rows.map((row) => ({ ...row, sales_person_id: salesPersonId })));

  if (items.length === 0) return { invoice: null, order: null };

  if (fullyStocked) {
    const claims = claimsByItem.flat();
    // Every row goes to SetSalesItems at its own REAL, full, unmodified
    // pieces/weight — never pre-scaled down to a claim's smaller quantity.
    // Confirmed live 2026-10-21: asking the server to price a bulk row at a
    // SCALED-DOWN quantity can silently switch its making-charge calculation
    // to a different basis (a per-piece minimum instead of per-gram),
    // overcharging by a large, non-obvious factor — see
    // scalePricedRowToQuantity's own header for the exact figures. Pricing
    // the row's true full quantity and then deriving each claim's own
    // smaller share CLIENT-SIDE (below) is the only way to stay inside the
    // SAME pricing bracket the row was actually costed under.
    const stockRows = claims.map((c) => c.row);
    const pricedFullRows = await priceStockPiecesForSale(stockRows, APP_CONFIG.DOCUMENT_TYPES.POS_INVOICE);
    if (pricedFullRows.length !== stockRows.length) {
      throw new Error('Live pricing failed — the server priced a different number of items than were sent.');
    }
    // A no-op for every normal claim (piecesClaimed already equals the row's
    // own full pieces) — only a PARTIAL bulk claim actually scales here.
    const priced = pricedFullRows.map((fullPriced, i) => scalePricedRowToQuantity(fullPriced, claims[i].piecesClaimed));
    // One lineItems row per CLAIM, not per unit — a bulk row sold partially
    // is one row covering several units (mapPricedLinesToCart needs this
    // count explicitly; it can no longer assume item.quantity rows per item).
    const lineCounts = claimsByItem.map((itemClaims) => itemClaims.length);
    return {
      invoice: { cartItems: items, lineItems: applySalesPerson(priced), lineCounts },
      order: null,
    };
  }

  const priced = await buildOrderLineItems({ items, documentId: APP_CONFIG.DOCUMENT_TYPES.POS_ORDER });
  const expected = items.reduce((sum, item) => sum + (item.quantity ?? 1), 0);
  if (priced.length !== expected) {
    throw new Error('Live pricing failed — the server priced a different number of items than were sent.');
  }

  // OrnaVerse silently zeroes the price of any is_gift-flagged item (e.g.
  // the promotional gold coin) once it has to be priced as a Made-to-Order
  // booking instead of a real stock claim — confirmed live 2026-10-25: a
  // real rate sent to SetSalesItems still came back net_amount 0, with no
  // warning/error field at all. That's correct for an actual free-gift line
  // (freeGiftPromoCode set); for a genuine purchase that merely exceeded
  // real stock, it would otherwise look like a silent, unexplained freebie.
  let cursor = 0;
  for (const item of items) {
    const qty = item.quantity ?? 1;
    const rows = priced.slice(cursor, cursor + qty);
    cursor += qty;
    if (item.freeGiftPromoCode != null) continue;
    if (rows.some((r) => r.is_gift && (r.net_amount ?? 0) <= 0.01)) {
      throw new Error(
        `"${item.itemName}" can only be sold from what's currently in stock — reduce the quantity to continue. It can't be booked as a Made-to-Order item.`
      );
    }
  }

  return { invoice: null, order: { cartItems: items, lineItems: applySalesPerson(priced) } };
}

/**
 * Maps priced line items back onto the cart lines that produced them.
 *
 * Both pricing paths emit ONE ROW PER PIECE, in cart order, expanding a cart
 * line of N into N consecutive rows — so the rows for cart line i are a
 * contiguous slice. This is what lets the checkout screen show each line at
 * the price it is really being sold for, and name the physical piece.
 *
 * @param {object[]} items      — cart items, in order
 * @param {object[]} lineItems  — buildPricedLineItems output, AFTER
 *   applyPromotionsToLines has run if any promo is applied — that's what
 *   writes the per-row `discount` field this also surfaces (see
 *   summarizeLineItems for the same sum used in the header total).
 * @param {number[]} [lineCounts] — how many consecutive `lineItems` rows each
 *   cart item occupies, in order. Defaults to `item.quantity` (one row per
 *   unit — true for the Order/MTO path, and for any all-normal-rows invoice)
 *   when omitted. Required whenever an invoice includes a PARTIALLY-sold
 *   bulk stock row (see claimStockPieces in this file): that claim is ONE
 *   lineItems row covering several units, so the row count for that cart
 *   item is no longer equal to its quantity.
 * @returns {Map<number, {
 *   lineTotal: number, unitPrice: number, discount: number, skus: string[],
 *   breakdown: object,
 * }>}
 *   keyed by cart index; empty when the two don't line up (never guess a
 *   mapping — showing the cart's own figure is better than the wrong piece's)
 *
 *   lineTotal/unitPrice are TAX-INCLUSIVE (net_amount) — reported directly
 *   (2026-09-30): the cart's own "each" price stayed pre-tax after the PDP's
 *   headline/Price Breakdown were already switched to tax-inclusive, so the
 *   same real piece showed two different-looking numbers in two places and
 *   read as a pricing bug. breakdown.sub_total is unaffected — it's the
 *   PriceBreakdown card's own explicitly-labeled pre-tax figure, kept correct
 *   independently of this change.
 */
export function mapPricedLinesToCart(items, lineItems, lineCounts) {
  const byCartIndex = new Map();
  if (!items?.length || !lineItems?.length) return byCartIndex;

  const counts = lineCounts ?? items.map((item) => item.quantity ?? 1);
  const expected = counts.reduce((sum, n) => sum + n, 0);
  if (expected !== lineItems.length) return byCartIndex;

  // ONE traversal of `rows` accumulating every field this line needs, rather
  // than a separate .reduce() pass per field — this runs on every
  // cart/checkout render, for every cart line.
  const emptyTotals = () => ({
    sub_total: 0, discount: 0, metal_amount: 0, diamond_amount: 0,
    stone_amount: 0, color_stone_amount: 0, other_amount: 0,
    item_labour: 0, taxable_amount: 0, tax_amount: 0, net_amount: 0,
    // Piece counts/weights behind each amount above — the actual physical
    // composition (2026-09-30, for the cart page's own component-level
    // breakdown: "76 pcs, 1.93 ct" behind a diamond_amount, not just the
    // rupee figure). net_weight is the METAL's own net weight specifically
    // (diamond/stone carry their own weight fields) — same convention
    // SetSalesItems itself uses.
    net_weight: 0, diamond_pieces: 0, diamond_weight: 0,
    stone_pieces: 0, stone_weight: 0,
    color_stone_pieces: 0, color_stone_weight: 0,
    other_pieces: 0, other_weight: 0,
    skus: [],
  });
  const round2 = (n) => +n.toFixed(2);

  let cursor = 0;
  items.forEach((item, index) => {
    const quantity = item.quantity ?? 1;
    const rowCount = counts[index] ?? quantity;
    const rows = lineItems.slice(cursor, cursor + rowCount);
    cursor += rowCount;

    const totals = rows.reduce((acc, r) => {
      acc.sub_total          += r.sub_total ?? 0;
      acc.discount           += r.discount ?? 0;
      acc.metal_amount       += r.metal_amount ?? 0;
      acc.diamond_amount     += r.diamond_amount ?? 0;
      acc.stone_amount       += r.stone_amount ?? 0;
      acc.color_stone_amount += r.color_stone_amount ?? 0;
      acc.other_amount       += r.other_amount ?? 0;
      acc.item_labour        += r.item_labour ?? 0;
      acc.taxable_amount     += r.taxable_amount ?? 0;
      acc.tax_amount         += r.tax_amount ?? 0;
      acc.net_amount         += r.net_amount ?? 0;
      acc.net_weight         += r.net_weight ?? 0;
      acc.diamond_pieces     += r.diamond_pieces ?? 0;
      acc.diamond_weight     += r.diamond_weight ?? 0;
      acc.stone_pieces       += r.stone_pieces ?? 0;
      acc.stone_weight       += r.stone_weight ?? 0;
      acc.color_stone_pieces += r.color_stone_pieces ?? 0;
      acc.color_stone_weight += r.color_stone_weight ?? 0;
      acc.other_pieces       += r.other_pieces ?? 0;
      acc.other_weight       += r.other_weight ?? 0;
      if (r.sku) acc.skus.push(r.sku);
      return acc;
    }, emptyTotals());

    // Pre-tax (breakdown's own labeled "Subtotal") vs tax-inclusive (the
    // row's headline "each"/total) — kept as two distinct values now; see
    // this function's own JSDoc for why they must not collapse into one.
    const subTotal = round2(totals.sub_total);
    const netTotal = round2(totals.net_amount);
    byCartIndex.set(index, {
      lineTotal: netTotal,
      unitPrice: +(netTotal / quantity).toFixed(2),
      // How much of the cart-wide discount landed on THIS line specifically.
      // A component-scoped promo ("20% Off Diamond") can give ₹0 here on a
      // line with no diamond even while it discounts others — correct, not a
      // bug.
      discount: round2(totals.discount),
      // Only invoices claim stock rows, so this is empty for an order.
      skus: totals.skus,
      // Full per-product cost breakdown — same fields/shape components
      // already render on the product detail page (metal/diamond/stone/
      // colour-stone/other + making charges + subtotal/taxable/tax/total),
      // summed across every physical piece this line represents. Deliberately
      // the SAME snake_case field names SetSalesItems itself uses so this
      // object can be handed straight to <PriceBreakdown priced={...} /> with
      // no remapping.
      breakdown: {
        metal_amount:       round2(totals.metal_amount),
        diamond_amount:     round2(totals.diamond_amount),
        stone_amount:       round2(totals.stone_amount),
        color_stone_amount: round2(totals.color_stone_amount),
        other_amount:       round2(totals.other_amount),
        item_labour:        round2(totals.item_labour),
        // The physical composition behind each amount above — cart/checkout
        // display only (see PriceBreakdown's own showComponents prop).
        net_weight:         round2(totals.net_weight),
        diamond_pieces:     totals.diamond_pieces,
        diamond_weight:     round2(totals.diamond_weight),
        stone_pieces:       totals.stone_pieces,
        stone_weight:       round2(totals.stone_weight),
        color_stone_pieces: totals.color_stone_pieces,
        color_stone_weight: round2(totals.color_stone_weight),
        other_pieces:       totals.other_pieces,
        other_weight:       round2(totals.other_weight),
        sub_total:          subTotal,
        taxable_amount:     round2(totals.taxable_amount),
        tax_amount:         round2(totals.tax_amount),
        net_amount:         round2(totals.net_amount),
      },
    });
  });

  return byCartIndex;
}

// Same identity keys cartSlice's own removeItem/updateQuantity reducers
// match a line on — the one thing that's stable across a clone
// buildPricedLineItems makes when it splits a line (same product/size/style,
// different quantity), so it's what buildCartDisplayRows below matches on
// instead of object reference (a split line's two portions are never the
// same object as the original cart item, or as each other).
//
// freeGiftPromoCode included (2026-10-12, a real React "duplicate key"
// warning led straight to this): a promo's free-gift line and a genuinely
// separate real purchase of the SAME item/size/style share every other
// field, so without this they produced identical keys here — React warned,
// and worse, the findIndex lookups below could resolve to the wrong one of
// the two, mispricing either row.
function cartLineKey(item) {
  return `${item.itemId}-${item.sizeId}-${item.styleId}-${item.freeGiftPromoCode ?? ''}`;
}

/**
 * Builds the rows a cart/checkout screen actually renders, expanding ONE
 * original cart line into TWO display rows when buildPricedLineItems had to
 * split it (part in stock, part not) — reported directly, 2026-09-30: a
 * qty-2 line with only 1 free piece was showing as a single row instead of
 * a 1-unit "In Stock" row + a 1-unit "Made to Order" row.
 *
 * Each row's `item` is always the REAL, original cart item (unmodified) —
 * needed so onRemove/onUpdateQuantity keep acting on the actual cart line,
 * not a display-only clone. `displayQuantity` carries the portion's own
 * count (equal to `item.quantity` for an unsplit line) for whatever the row
 * actually shows/prices; CartItemRow uses it for the visible count while
 * still driving its quantity stepper off the real `item.quantity`.
 *
 * ALWAYS emits one row per cart item at minimum, even when neither group has
 * priced it yet (pricing still loading, or the query failed outright — e.g.
 * a transient 502 from the upstream proxy, reported directly 2026-09-30) —
 * that row just falls back to the raw cart figures (priced: null), same as
 * this function's predecessor always did. Requiring pricing to have already
 * resolved before showing ANYTHING was the actual bug: the header's own item
 * count (a plain sum over cart state, no pricing involved) stayed correct
 * the whole time, while this function returned an empty list and the mini
 * cart looked totally empty — which then reads as "my add didn't work" and
 * invites exactly the repeated-click pattern that also inflates quantity.
 *
 * @param {object[]} items — the full cart, in original order
 * @param {{ invoice: {cartItems, lineItems}|null, order: {cartItems, lineItems}|null }} split
 * @returns {{ key: string, item: object, displayQuantity: number, documentType: 'invoice'|'order'|null, priced: object|null }[]}
 */
export function buildCartDisplayRows(items, { invoice, order }) {
  if (!items?.length) return [];

  const invoiceMap = invoice ? mapPricedLinesToCart(invoice.cartItems, invoice.lineItems, invoice.lineCounts) : null;
  const orderMap   = order   ? mapPricedLinesToCart(order.cartItems, order.lineItems)     : null;

  const rows = [];
  items.forEach((item) => {
    const key = cartLineKey(item);
    let matched = false;

    if (invoice) {
      const localIndex = invoice.cartItems.findIndex((ci) => cartLineKey(ci) === key);
      if (localIndex !== -1) {
        matched = true;
        const portion = invoice.cartItems[localIndex];
        const priced  = invoiceMap.get(localIndex);
        rows.push({
          key: `${key}-invoice`, item, displayQuantity: portion.quantity,
          documentType: 'invoice', priced: priced ? { ...priced, documentType: 'invoice' } : null,
        });
      }
    }
    if (order) {
      const localIndex = order.cartItems.findIndex((ci) => cartLineKey(ci) === key);
      if (localIndex !== -1) {
        matched = true;
        const portion = order.cartItems[localIndex];
        const priced  = orderMap.get(localIndex);
        rows.push({
          key: `${key}-order`, item, displayQuantity: portion.quantity,
          documentType: 'order', priced: priced ? { ...priced, documentType: 'order' } : null,
        });
      }
    }

    if (!matched) {
      rows.push({
        key: `${key}-unpriced`, item, displayQuantity: item.quantity,
        documentType: null, priced: null,
      });
    }
  });

  return rows;
}

/**
 * Sums the authoritative per-line totals (computed by SetSalesItems, not the
 * cart's display-only flat-3%-GST estimate) into header-level figures —
 * including the aggregate pieces/weight/net_weight the header itself
 * carries.
 * @param {object[]} lineItems — output of buildPricedLineItems
 */
export function summarizeLineItems(lineItems) {
  // ONE traversal of `lineItems` (one row per physical piece in the whole
  // order) accumulating every header field, rather than a separate .reduce()
  // pass per field.
  const totals = lineItems.reduce((acc, li) => {
    acc.sub_total      += li.sub_total ?? 0;
    acc.discount        += li.discount ?? 0;
    acc.taxable_amount  += li.taxable_amount ?? 0;
    acc.tax_amount      += li.tax_amount ?? 0;
    acc.net_amount      += li.net_amount ?? 0;
    acc.pieces          += li.pieces ?? 0;
    acc.weight          += li.weight ?? 0;
    acc.net_weight      += li.net_weight ?? 0;
    return acc;
  }, {
    sub_total: 0, discount: 0, taxable_amount: 0, tax_amount: 0,
    net_amount: 0, pieces: 0, weight: 0, net_weight: 0,
  });

  const round2 = (n) => +n.toFixed(2);
  // Real per-line CGST/SGST (sumRealGst), not a 50/50 reconstruction off the
  // combined tax_amount — every line here already carries its own genuine
  // item_taxes[] rows from SetSalesItems, so there's nothing to guess.
  const gst = sumRealGst(lineItems);
  return {
    subTotal:      round2(totals.sub_total),
    // Post-promotion figures when ApplyPromotions has run: it writes the
    // discount onto each line and recomputes taxable_amount/tax_amount/
    // net_amount around it, leaving base_* holding the pre-discount values.
    // Summing what the lines actually carry is therefore correct either way,
    // matching what the real header does.
    discount:      round2(totals.discount),
    taxableAmount: round2(totals.taxable_amount),
    taxAmount:     round2(totals.tax_amount),
    cgstAmount:    gst?.cgst ?? 0,
    sgstAmount:    gst?.sgst ?? 0,
    netAmount:     round2(totals.net_amount),
    pieces:        round2(totals.pieces),
    weight:        round2(totals.weight),
    netWeight:     round2(totals.net_weight),
  };
}

/**
 * Combines the invoice group's and order group's totals (either may be null
 * — see buildPricedLineItems) into one set of figures, for screens that show
 * a single combined "what this cart comes to" summary rather than two
 * separate documents (the /cart page, DiscountSection). checkout/page.jsx
 * itself does NOT use this — it shows each group's own totals separately,
 * since that's the whole point of the split.
 * @param {object|null} invoiceTotals — a group's `summarizeLineItems` output
 * @param {object|null} orderTotals
 */
export function combineGroupTotals(invoiceTotals, orderTotals) {
  const zero = {
    subTotal: 0, discount: 0, taxableAmount: 0, taxAmount: 0,
    cgstAmount: 0, sgstAmount: 0, netAmount: 0, pieces: 0, weight: 0, netWeight: 0,
  };
  const a = invoiceTotals ?? zero;
  const b = orderTotals ?? zero;
  const round2 = (n) => +n.toFixed(2);
  return {
    subTotal:      round2(a.subTotal + b.subTotal),
    discount:      round2(a.discount + b.discount),
    taxableAmount: round2(a.taxableAmount + b.taxableAmount),
    taxAmount:     round2(a.taxAmount + b.taxAmount),
    cgstAmount:    round2((a.cgstAmount ?? 0) + (b.cgstAmount ?? 0)),
    sgstAmount:    round2((a.sgstAmount ?? 0) + (b.sgstAmount ?? 0)),
    netAmount:     round2(a.netAmount + b.netAmount),
    pieces:        round2(a.pieces + b.pieces),
    weight:        round2(a.weight + b.weight),
    netWeight:     round2(a.netWeight + b.netWeight),
  };
}

/**
 * Per-promo discount breakdown for display — the ONE place this is computed,
 * reused by DiscountSection's applied-promo tags AND CartSummary's own
 * itemized discount lines, so both surfaces always show the exact same
 * figure for the exact same code instead of two independently-summed
 * numbers that could drift apart.
 *
 * A promo can produce a SEPARATE promotion_details row in each group when it
 * applies to both (a genuinely mixed invoice/order cart) — confirmed live
 * 2026-09-30: "20% Off Diamond" on a real 2-item mixed cart produced one row
 * worth ₹2,064 on the invoice side and a second worth ₹206.40 on the order
 * side. Summing every matching row (not just the first) is what makes the
 * total match what each Order Summary section actually shows.
 *
 * @param {{promoCode: string, promoDetails?: {promotion_name?: string}}[]} appliedPromos
 * @param {object[]} promotionDetails — one group's own rows, or both groups'
 *   rows concatenated for a combined (unsplit) summary — caller's choice.
 * @returns {{promoCode: string, promoName: string, amount: number|null, hasEffect: boolean}[]}
 *   amount is null when this code produced no row at all in the given
 *   promotionDetails (e.g. it was declined, or only ever applied to the
 *   OTHER group) — hasEffect mirrors that for callers that just need a flag.
 */
export function getPromoBreakdown(appliedPromos, promotionDetails) {
  return appliedPromos.map((promo) => {
    const rows = promotionDetails.filter((row) => row.promotion_code === promo.promoCode);
    const amount = rows.length
      ? rows.reduce((sum, row) => sum + (Number(row.promotion_amount) || 0), 0)
      : null;
    return {
      promoCode: promo.promoCode,
      promoName: promo.promoDetails?.promotion_name ?? promo.promoCode,
      amount,
      hasEffect: amount != null,
    };
  });
}
