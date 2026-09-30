// OrnaVerse Catalog + Items module.
// All functions are pure HTTP wrappers — no business logic.
//
// SCHEMA — Inventory.ProductCatalogRow key fields (confirmed v1.json):
//   item_id, item_code, item_name
//   price          — NOT populated on this environment; the app ignores it
//                    and prices live instead (see the PRICING note below)
//   compare_price  — stored "original/MRP" figure. Deliberately unused: it's
//                    another stale master value, and a strikethrough against
//                    a price that no longer matches what's charged misleads.
//   style_id       — links to StyleRow (which has external_product_id for Shopify)
//   has_stock      — boolean
//   current_company_pieces — stock count at active store
//   total_pieces   — stock count across all stores
//   image, image_1 … image_8 — OrnaVerse image paths (may be null on UAT)
//   type_id, sub_type_id, karat_id, metal_color_id, item_size_id
//   NO external_product_id here — only on StyleRow via Style/Retrieve

import axiosInstance from '@/lib/axios/axiosInstance';
import API from '@/constants/apiEndpoints';
import APP_CONFIG from '@/constants/appConfig';
import {
  calculateItemRates,
  priceStockPiecesForSale,
  priceItemAsSold,
} from '@/services/pricingService';
import { getStockPieces, getStockPieceBySku } from '@/services/inventoryService';

/**
 * Fetches featured items from the master items list.
 * @returns {Promise<object>} { Entities: ItemsRow[] }
 */
export async function getFeaturedItems() {
  const response = await axiosInstance.post(API.ITEMS.LIST, {
    is_featured: true,
    Take:        APP_CONFIG.PAGINATION.DEFAULT_TAKE,
  });
  return response.data;
}

/**
 * Fetches new-arrival items from the master items list.
 * @returns {Promise<object>} { Entities: ItemsRow[] }
 */
export async function getNewItems() {
  const response = await axiosInstance.post(API.ITEMS.LIST, {
    is_new: true,
    Take:   APP_CONFIG.PAGINATION.DEFAULT_TAKE,
  });
  return response.data;
}

/**
 * Full-text + filter search via master items list.
 * NOTE: Server-side search is unreliable on UAT.
 * Prefer useAllCatalog + client-side filtering for the catalog page.
 * @param {object} params
 */
export async function searchItems(params) {
  const {
    item_search,
    item_group_ids,
    type_ids,
    sub_type_ids,
    from_weight,
    to_weight,
    from_diamond_weight,
    to_diamond_weight,
  } = params;

  const response = await axiosInstance.post(API.ITEMS.LIST, {
    item_search:         item_search         ?? '',
    item_group_ids:      item_group_ids      ?? [],
    type_ids:            type_ids            ?? [],
    sub_type_ids:        sub_type_ids        ?? [],
    brand_ids:           [],
    collection_ids:      [],
    super_type_ids:      [],
    from_weight:         from_weight         ?? null,
    to_weight:           to_weight           ?? null,
    from_diamond_weight: from_diamond_weight ?? null,
    to_diamond_weight:   to_diamond_weight   ?? null,
  });
  return response.data;
}

/**
 * Batch-fetches full item detail (including item_rate and item_components[]
 * BOM) for a set of item_ids via Items/List.
 *
 * This exists to feed the live price calculator, NOT to read item_rate off
 * the result — that rate is not a usable price, see the PRICING note below.
 *
 * Items/List supports filtering by `item_ids`, confirmed via direct testing
 * — but confirmed live 2026-07-22 it silently OMITS items with no
 * weight/karat/metal/components at all (genuinely incomplete master records
 * — e.g. a raw-stone entry never given real specs). Those items can't be
 * priced at all and simply stay priceless.
 *
 * @param {number[]} itemIds
 * @returns {Promise<Map<number, object>>} item_id -> full ItemRow
 */
async function getItemDetailsByIds(itemIds) {
  if (!itemIds.length) return new Map();

  const response = await axiosInstance.post(API.ITEMS.LIST, {
    item_ids: itemIds,
    // Exact count needed, not 0 — Take: 0 is not reliably "unlimited" on
    // every list endpoint (see getAllProducts below), so ask for precisely
    // as many rows as there are ids rather than trusting a 0 to mean "all".
    Take: itemIds.length,
  });
  const entities = response.data?.Entities ?? [];
  return new Map(entities.map((e) => [e.item_id, e]));
}

// ── PRICING: ONE SOURCE, NOT A TIER LIST ────────────────────────────────────
//
// Catalog rows leave here with `price: null`. Every price the app shows or
// charges comes from Helpers/SetSalesItems, filled in out-of-band by
// useLiveCatalogPrices → getLivePricesForItems below.
//
// There used to be an attachStaticPrice() tier in front of that, which took
// the item master's stored `item_rate` whenever it was non-zero. It is gone.
// That rate is stale and understates the piece, usually because it predates
// or omits the stone value — measured on UAT 2026-08-05 against what
// SetSalesItems actually charges:
//
//     ADJLR00826              48,704.82  ->  107,840.02   (2.21x)
//     LJ-BR0034-14YGLGD-2.4   54,924.49  ->  109,139.92   (1.99x)
//     LJ-BR0119-14YGLGD-7     13,268.91  ->   40,281.12   (3.04x)
//
// Most items carry item_rate 0 and were already priced live, so this stayed
// invisible until an item with a stale non-zero rate was sold: the counter
// quoted the stale figure, the invoice was raised at the real one, and
// OrnaVerse rejected the short-paid sale ("No credit facility is allowed for
// …"). Undercharging by ~57,000 on one bracelet is the failure mode.
//
// A stored rate that disagrees with the live calculator by 2-3x is not a
// usable price at any tier, so it is no longer offered as one anywhere —
// see also CustomizeSheet and the product detail page, which had the same
// fallback and lost it for the same reason.
//
// The cost is that every item now waits on the background fill-in. That path
// is debounced, chunked and concurrent precisely because SetSalesItems takes
// 6-7+ seconds per ~15-item batch (confirmed 2026-07-28); pages render
// immediately and prices arrive a moment later.

/**
 * Live-computes price for a set of item_ids via Services/Helpers/SetSalesItems
 * (see pricingService.calculateItemRates). This is now the ONLY price source
 * for the catalog — see the PRICING note above for why the stored item_rate
 * was retired.
 *
 * Returns `sub_total` (pre-tax) deliberately: the cart adds GST itself, so a
 * pre-tax unit price makes the cart total land on the invoice's net_amount
 * rather than taxing an already-taxed figure. Confirmed on ADJLR00826 —
 * sub_total 104,699.04 + 3% = 107,840, exactly the invoice's net_amount.
 *
 * A returned 0 is treated as "cannot be priced", not "free", and is left out
 * of the Map. That is the existing contract for uncosted items, and it also
 * keeps Silver925 stock — which OrnaVerse currently prices at 0 in their own
 * POS too — from being displayed, and sold, at nothing.
 *
 * Best-effort: if SetSalesItems has a transient failure (confirmed live
 * 2026-07-22 it can occasionally throw a generic 500), callers get back
 * whatever did resolve rather than an exception — a background price fill-in
 * failing silently is far preferable to it taking down the catalog.
 *
 * @param {number[]} itemIds
 * @returns {Promise<Map<number, number>>} item_id -> live price
 */
export async function getLivePricesForItems(itemIds, companyId) {
  const empty = { prices: new Map(), answered: new Set() };
  if (!itemIds?.length) return empty;

  // getItemDetailsByIds and getStockPieces are independent of each other —
  // each only needs itemIds/companyId, neither needs the other's result —
  // but were previously awaited one after another. FIXED (2026-09-30,
  // reported: "fetching pricing takes a lot of time"): timed live at
  // ~300-900ms each, so awaiting them in series added a full extra real
  // round trip's worth of pure latency to every batch, including the
  // pricing epoch's own canary check (usePricingEpoch calls this same
  // function first and gates ALL real per-card pricing behind it) — the
  // canary alone measured ~2.1s end to end before any visible price could
  // even start fetching. Running them concurrently removes that.
  const detailsPromise = getItemDetailsByIds(itemIds).catch((err) => {
    console.error('[catalogService] getLivePricesForItems: item lookup failed', err);
    return null;
  });
  // One extra call for the whole batch, not one per card: StockJournal's
  // `item_ids` plural filter is honoured (verified on UAT 2026-08-05). Uses
  // the full itemIds, not toPrice's (Items/List-filtered) subset, since that
  // subset isn't known until detailsPromise resolves — a superset here is
  // harmless, just possibly one or two extra rows that go unused below.
  const stockPromise = companyId
    ? getStockPieces({ itemIds, companyId, take: 200 }).catch((err) => {
        // Best-effort: fall back to master pricing rather than blanking the grid.
        console.error('[catalogService] stock lookup failed, pricing masters', err);
        return null;
      })
    : Promise.resolve(null);

  const [detailById, stockResponse] = await Promise.all([detailsPromise, stockPromise]);
  if (!detailById) return empty;
  // Every item that came back with a usable master record goes to the
  // calculator. The old filter here (item_rate 0 AND has components) is
  // what let stale non-zero rates through unchecked.
  const toPrice = [...detailById.values()];

  // Items/List omits records with no weight/karat/metal at all. Those can
  // never be priced, so count them as answered rather than retrying forever.
  const returnedIds = new Set(toPrice.map((d) => d.item_id));
  const answered = new Set(itemIds.filter((id) => !returnedIds.has(id)));
  if (!toPrice.length) return { prices: new Map(), answered };

  const prices = new Map();
  const collect = (rows) => {
    for (const r of rows ?? []) {
      // The server ANSWERED for this item even when it priced it at 0 — that
      // is a real "cannot be sold" verdict (currently every Silver925 item),
      // not a failure, so it must not be retried. Distinguishing the two is
      // the point of returning `answered` separately from `prices`.
      answered.add(r.item_id);
      if ((r.sub_total ?? 0) > 0) prices.set(r.item_id, r.sub_total);
    }
  };

  // Price against the PHYSICAL PIECE wherever the shelf has one, so a card
  // shows the figure the customer will actually be charged. The master is a
  // nominal spec and routinely differs — the same bracelet is 2.030g net on
  // the master and 1.349g in the case, ₹30,877.20 vs ₹23,507.56. Showing the
  // master here and the piece at checkout is the inconsistency this closes.
  const stockRowByItemId = new Map();
  for (const row of stockResponse?.data?.Entities ?? []) {
    // First AVAILABLE row per item — the one claimStockPieces would take.
    // is_allocated (2026-08-27) excluded here too, matching that function's
    // own filter — a card must never quote a piece that's already reserved
    // by another transaction and would be skipped at actual checkout time.
    // See claimStockPieces' header for the source.
    if (row.is_allocated) continue;
    if (!stockRowByItemId.has(row.item_id)) stockRowByItemId.set(row.item_id, row);
  }

  const stockRows = [...stockRowByItemId.values()];
  const masters   = toPrice.filter((d) => !stockRowByItemId.has(d.item_id));

  try {
    const [pricedPieces, pricedMasters] = await Promise.all([
      stockRows.length
        ? priceStockPiecesForSale(stockRows, APP_CONFIG.DOCUMENT_TYPES.POS_INVOICE)
        : [],
      masters.length
        ? calculateItemRates(masters, APP_CONFIG.DOCUMENT_TYPES.POS_ORDER)
        : [],
    ]);
    collect(pricedPieces);
    collect(pricedMasters);
    return { prices, answered };
  } catch (err) {
    // SetSalesItems can 500 on a single malformed master record (confirmed
    // live 2026-07-22) and it prices the batch as a unit, so one bad item
    // costs the whole batch. Survivable when only BOM items came here; now
    // that every item does, it would blank a whole screen. Re-price
    // individually, in small waves, so the damage is limited to the item
    // that actually fails and we don't fire 24 parallel heavy calls.
    console.error('[catalogService] batch pricing failed, retrying individually', err);

    const WAVE = 4;
    for (let i = 0; i < toPrice.length; i += WAVE) {
      const settled = await Promise.allSettled(
        // Same rule as the batch path — piece first, master only if the shelf
        // has nothing — so a card that falls back here still can't disagree
        // with the price checkout will charge for it.
        toPrice.slice(i, i + WAVE).map((item) => priceItemAsSold({ item, companyId }))
      );
      for (const r of settled) {
        if (r.status === 'fulfilled' && r.value) collect([r.value]);
      }
    }
    return { prices, answered };
  }
}

/**
 * Paginated store-scoped product catalog with live stock.
 * Always send current_company_id = activeStoreId.
 *
 * @param {object}  params
 * @param {number}  params.current_company_id   — required
 * @param {number}  [params.Take]
 * @param {number}  [params.Skip]
 * @param {boolean} [params.show_out_of_stock]
 * @param {number[]}[params.type_ids]
 * @returns {Promise<object>} { Entities: ProductCatalogRow[], TotalCount }
 */
// ProductCatalog/List's `current_company_id` does NOT scope the result set
// at all — same confirmed-live quirk fetchEntireStoreCatalog documents for
// the full-sweep path (see its own header below), reconfirmed live
// 2026-09-18 for this normal PAGINATED browse call shape too: querying
// company 2 (Chembur) with a category filter returned 24 raw rows, only 1
// of which actually belonged to company 2 (the other 23 had zero stock
// there and real company_ids pointing elsewhere entirely) — visible on
// PAGE 1, not just once an operator scrolls past however many items the
// store genuinely stocks, as an earlier comment here assumed. Also
// reconfirmed the server clamps Take to a MAX of 24 per request (100
// requested, 24 echoed back) — same as the full sweep. CORRECTED
// 2026-09-30: this is a ceiling, not a forced value — OrnaVerse's own real
// client sends Take:16 and gets exactly 16 back, confirmed by cross-checking
// their live POS directly. Request the real cap (24) rather than an
// artificially larger Take; asking for more just clamps and wastes payload.
//
// FIX: getProducts now backfills — it walks the raw tenant-wide pages
// (fetched with concurrency, same idiom as fetchEntireStoreCatalog) and
// only counts a row toward the caller's requested Take once
// belongsToStore() confirms it's real for THIS store, continuing until
// either Take real matches are found or the raw tenant-wide pool named by
// this filter is exhausted. `Skip` is therefore no longer a simple
// display-position offset — it's an opaque RAW cursor this function hands
// back as `NextRawSkip`; callers (useCatalogProducts.js) must always pass
// back exactly that value, never a locally-computed one.
const RAW_PAGE_SIZE = 24; // server's real hard cap — see above and fetchEntireStoreCatalog's own note
const BACKFILL_CONCURRENCY = 6;
// Ceiling on raw pages walked per call (~1,440 raw rows) — bounds worst-case
// latency for a store whose real stock is a small fraction of a large
// unfiltered tenant pool. Coming up short of Take within this budget isn't
// an error: the grid still has empty room on screen since nothing new
// rendered, so its own infinite-scroll sentinel asks again immediately —
// forward progress happens a few raw pages at a time rather than one giant
// blocking wait.
const BACKFILL_SAFETY_MAX_RAW_PAGES = 60;

export async function getProducts(params) {
  const {
    current_company_id,
    Take              = APP_CONFIG.PAGINATION.CATALOG_TAKE,
    Skip: rawSkip     = 0,
    show_out_of_stock = false,
    ...rest
  } = params;

  const matched = [];
  const seenIds = new Set();
  let skip = rawSkip;
  let rawPagesFetched = 0;
  let tenantTotalCount = Infinity; // unknown until the first response answers
  let exhausted = false;

  while (matched.length < Take && rawPagesFetched < BACKFILL_SAFETY_MAX_RAW_PAGES) {
    const batchSkips = [];
    for (let i = 0; i < BACKFILL_CONCURRENCY; i++) {
      const s = skip + i * RAW_PAGE_SIZE;
      if (s >= tenantTotalCount) break;
      batchSkips.push(s);
    }
    if (batchSkips.length === 0) { exhausted = true; break; }

    const responses = await Promise.all(
      batchSkips.map((s) =>
        axiosInstance
          .post(API.CATALOG.GET_PRODUCTS, {
            current_company_id, Take, Skip: s, show_out_of_stock, ...rest,
          })
          .then((res) => res.data)
      )
    );

    let anyNonEmpty = false;
    for (const data of responses) {
      rawPagesFetched++;
      tenantTotalCount = data?.TotalCount ?? tenantTotalCount;
      const entities = data?.Entities ?? [];
      if (entities.length > 0) anyNonEmpty = true;
      for (const e of entities) {
        if (e.item_id != null) {
          if (seenIds.has(e.item_id)) continue;
          seenIds.add(e.item_id);
        }
        if (belongsToStore(e, current_company_id)) matched.push(e);
      }
    }
    skip += BACKFILL_CONCURRENCY * RAW_PAGE_SIZE;

    if (!anyNonEmpty) { exhausted = true; break; }
    if (skip >= tenantTotalCount) { exhausted = true; break; }
  }

  // Entities pass through unpriced — see the PRICING note above.
  return {
    Entities:     matched.slice(0, Take),
    TotalCount:   tenantTotalCount === Infinity ? 0 : tenantTotalCount, // still tenant-wide — used only to detect exhaustion, never shown as this store's own count
    NextRawSkip:  exhausted ? null : skip,
    Exhausted:    exhausted,
  };
}

/**
 * Fetches this store's ENTIRE product catalog for client-side search,
 * filter, and barcode lookup.
 *
 * Confirmed 2026-07-15: ProductCatalog/List clamps Take to a MAX of 24
 * records per request (Take:0, Take:5000 both echoed back as 24). CORRECTED
 * 2026-09-30: it's a ceiling, not a forced value regardless of Take — a
 * smaller Take (e.g. 16, confirmed against OrnaVerse's own real client) is
 * honoured exactly. This sweep still asks for PAGE_SIZE=24 per page (the
 * real max), so nothing here changes — noted for whoever tunes it next.
 * There's also no working server-side search on this endpoint at all
 * (item_search/item_code/search params are silently ignored), and the
 * global full-text search on a different endpoint (Items/List ContainsText)
 * can't be reliably scoped to one store's stock — its result ordering has
 * no awareness of which company carries what, so a store's real matches
 * can easily fall outside any practical candidate cap (verified: a genuine
 * "Tennis Bracelet" this store stocks was missed because it wasn't among
 * the first 200 of 756 global matches). So the only reliable option is to
 * paginate this store's own catalog directly, in chunks of the server's
 * real 24-per-request cap, fetched with modest concurrency for speed.
 *
 * TotalCount on this endpoint is NOT trustworthy either — it reports a
 * number far too close to the whole system's item count to be scoped to
 * one company — so completion is detected by an empty/partial page, not by
 * comparing against TotalCount.
 *
 * ROOT CAUSE OF THE "5-10 MINUTE" SEARCH DELAY — CONFIRMED LIVE 2026-09-09
 * against production (all 8 real stores). `current_company_id` does NOT
 * scope this endpoint's result set AT ALL — every company_id returns the
 * exact same TotalCount (106,130 with show_out_of_stock:true), and paging
 * deep (e.g. Skip 2000 for company 4/Pune) returns real, distinct items
 * whose own `company_ids`/`current_company_pieces` fields prove they
 * belong to OTHER stores entirely (company_ids:[8], current_company_pieces:0
 * — company 4 has none of it). The parameter only re-sorts results (a
 * company's own items surface first), it never restricts them — so
 * "this store's entire catalog" was, in practice, paginating through the
 * WHOLE TENANT's item master, all 8 stores combined, not this one store's
 * real assortment.
 *
 * `show_out_of_stock:true` is what made this catastrophic:
 * confirmed live that flag ALSO isn't company-scoped, but it IS a genuine,
 * tenant-wide filter — flipping it to `false` (matching getProducts' own
 * default just above, used for normal non-search browsing) cut the real,
 * confirmed TotalCount from 106,130 to 2,699 — a ~40x reduction, because
 * the ~103,000 excluded rows have literally zero stock at ANY of the 8
 * real stores (dead/incomplete master records — raw materials, discontinued
 * designs never given real stock — not orderable products). Measured live:
 * a full 8-concurrent round of pages takes ~1.1-1.4s either way, so this
 * alone turns the ~13-minute sweep (553 rounds) into ~15-20 seconds (15
 * rounds) — this is the fix for the reported slowness.
 *
 * The cross-store leakage (real items belonging to OTHER stores, mixed into
 * this raw response) is NOT filtered here any more — see the 2026-09-09
 * SHARED-FETCH note below for why, and belongsToStore (exported) for the
 * per-store filter callers now apply themselves. getProducts (normal
 * paginated browse, above) now does its own backfill-based store filtering
 * directly (fixed 2026-09-18 — see that function's own header) rather than
 * relying on this sweep, since browse mode needs fast incremental pages
 * long before a full tenant sweep would ever complete.
 *
 * SHARED FETCH (2026-09-09) — since `current_company_id` doesn't scope the
 * result set at all (confirmed above), this now returns the SAME raw
 * ~2,699-item tenant-wide pool no matter which `seedCompanyId` is passed —
 * that argument only seeds the request payload (the API requires SOME
 * company_id), it does not change what comes back once the sweep runs to
 * completion. Callers used to key their cache per store, which meant
 * switching stores (or searching again on a different store after
 * clearing) re-ran the entire ~15-round sweep from scratch even though the
 * identical data was already cached under a different store's key — that's
 * what made clearing the search bar feel like it "waited" on a fresh burst
 * of API calls. useAllCatalog now caches this under ONE shared, store-
 * agnostic key and applies belongsToStore per-consumer via `select`
 * instead, so this sweep runs at most once per staleTime window, ever — not
 * once per store.
 *
 * CONCURRENCY: 8 -> 4 (2026-09-09) alongside the shared-fetch change above —
 * with the sweep now running far less often, trading a bit more of its own
 * wall-clock time for leaving more of the browser's per-origin connection
 * pool free for whatever ELSE the operator is doing while it runs was the
 * better trade at the time; a saturated pool was part of why unrelated
 * requests (e.g. the normal browse view rendering after a search is
 * cleared) could appear to queue up behind this sweep.
 *
 * 4 -> 6 (2026-09-18): the original contention problem was compounded by
 * this running PER STORE (an operator touching multiple stores could have
 * several 8-way sweeps overlapping); it's now one shared sweep for the
 * whole session, so a moderate increase is materially lower-risk than the
 * original 8 was. This sweep is also now the confirmed long pole behind the
 * catalog grid's "View Similar" icon and full-catalog search readiness
 * (AppShell triggers it proactively — see that component's own comments) —
 * fewer, larger rounds directly shortens both. Also now staggered ~1.5s
 * behind whatever page the operator lands on, so it no longer competes with
 * that page's own first-paint fetch regardless of this number.
 *
 * @param {number} seedCompanyId — a company_id to send with each request;
 *   does not restrict the result (see above), any real store's id works.
 * @returns {Promise<object[]>} ProductCatalogRow[], UNFILTERED by store —
 *   callers apply belongsToStore(entity, storeId) themselves
 */
// showOutOfStock (2026-09-23) — CONFIRMED LIVE: hardcoding false here made
// the "Show Out of Stock" toggle silently do nothing for text search (only
// category-CHIP browsing, via getProducts above, actually threads the
// toggle through) — an item with zero stock everywhere can never surface no
// matter what the operator does, since this pool never contains it in the
// first place. Kept `false` as the default (unaffected callers: AppShell's
// background warmup, useSimilarProducts) — only catalog/page.jsx's search
// passes `true`, and only once the operator has actually turned the toggle
// on, so the fast ~2,699-item path stays the default in every other case.
// ponytail: SAFETY_MAX_PAGES_OOS bounds this to the first ~48,000 tenant
// records (not the full ~106,130) — a real result can still be missed if
// it sits past that in the raw ordering; raise the ceiling if that's ever
// reported, trading more worst-case latency for completeness.
async function fetchEntireStoreCatalog(seedCompanyId, onProgress, showOutOfStock = false) {
  const PAGE_SIZE = 24; // the server's real hard cap, confirmed by direct testing
  const CONCURRENCY = 6;
  const SAFETY_MAX_PAGES = showOutOfStock ? 2000 : 500; // ~48,000 items (OOS) vs ~12,000 (default) — generous ceiling against a runaway loop

  const all = [];
  // Tracks item_ids already collected. A short/empty page is the expected
  // "end of data" signal, but confirmed 2026-08-09: this loop was hitting
  // SAFETY_MAX_PAGES on a store whose real catalog is nowhere near 12,000
  // items. Root cause — once ANY page in a batch came back short, `done`
  // was set but the loop kept pushing every OTHER page in that same batch
  // regardless of content (no `break`), and those pages sit at Skip values
  // past the true end of data. If the server clamps/wraps an out-of-range
  // Skip instead of returning empty (common for naive pagination, and
  // ProductCatalog/List is already documented above as having several other
  // quirks), those pages come back as full, non-empty — but DUPLICATE —
  // pages, so `entities.length < PAGE_SIZE` never trips again and the loop
  // has no way to know it's done short of the hard cap. Tracking seen ids
  // and stopping when a whole round contributes nothing new is a
  // duplicate-proof signal that doesn't depend on the server ever
  // returning a short page at all.
  const seenIds = new Set();
  let skip = 0;
  let done = false;
  let pagesFetched = 0;

  while (!done && pagesFetched < SAFETY_MAX_PAGES) {
    const batchSkips = Array.from({ length: CONCURRENCY }, (_, i) => skip + i * PAGE_SIZE);
    const pages = await Promise.all(
      batchSkips.map((s) =>
        axiosInstance
          .post(API.CATALOG.GET_PRODUCTS, {
            current_company_id: seedCompanyId,
            Take: PAGE_SIZE,
            Skip: s,
            // FIXED 2026-09-09 — was unconditionally `true`, then hardcoded
            // `false` (see this function's header for the confirmed-live
            // measurement: `false` cuts the real, tenant-wide TotalCount
            // from 106,130 to 2,699, ~40x, the actual fix for the reported
            // 5-10 minute search-indexing delay). Now the real toggle value
            // for the one caller that opts in (see this function's own
            // 2026-09-23 header note) — every other caller still gets the
            // fast `false` default, unchanged.
            show_out_of_stock: showOutOfStock,
          })
          .then((res) => res.data?.Entities ?? [])
      )
    );

    let newInRound = 0;
    for (const entities of pages) {
      pagesFetched++;

      const fresh = entities.filter((e) => e.item_id == null || !seenIds.has(e.item_id));
      for (const e of fresh) { if (e.item_id != null) seenIds.add(e.item_id); }
      all.push(...fresh);
      newInRound += fresh.length;

      if (entities.length < PAGE_SIZE) { done = true; break; } // partial/empty page = end of data — stop processing this round's later (out-of-range) pages
    }

    // A full round that added zero NEW ids means every page in it was
    // duplicate/wrapped data past the real end — treat that as done too,
    // even though no page was individually short.
    if (!done && newInRound === 0) done = true;

    onProgress?.(all.length);
    skip += CONCURRENCY * PAGE_SIZE;
  }

  if (pagesFetched >= SAFETY_MAX_PAGES) {
    console.error(
      `[catalogService] fetchEntireStoreCatalog: hit the safety cap of ${SAFETY_MAX_PAGES} pages ` +
      `(seed company ${seedCompanyId}) — the real tenant-wide catalog may be larger than what was fetched.`
    );
  }

  // UNFILTERED (2026-09-09) — see this function's own SHARED FETCH note.
  // Callers apply belongsToStore(entity, storeId) themselves, per-consumer,
  // so this same cached sweep can serve every store's search without
  // re-fetching.
  return all;
}

/**
 * CONFIRMED LIVE 2026-09-09 (see fetchEntireStoreCatalog's header) —
 * ProductCatalog/List's `current_company_id` doesn't restrict its result
 * set at all, so a full sweep genuinely contains other stores' exclusive
 * items. `company_ids` (falling back to parsing the `available_company_ids_raw`
 * CSV string, in case a future response ever omits the array form) is each
 * row's own honest record of which stores actually carry it — this is what
 * the request parameter should have filtered by server-side, done here
 * client-side instead. Exported so useAllCatalog.js can apply it per-store
 * via react-query's `select`, over the ONE shared raw fetch — see
 * fetchEntireStoreCatalog's SHARED FETCH note for why this moved out here
 * instead of being baked into the fetch itself.
 * @param {object} entity — ProductCatalogRow
 * @param {number} storeId
 * @returns {boolean}
 */
export function belongsToStore(entity, storeId) {
  if (Array.isArray(entity.company_ids)) return entity.company_ids.includes(storeId);
  if (typeof entity.available_company_ids_raw === 'string') {
    return entity.available_company_ids_raw
      .split(',')
      .map((id) => Number(id.trim()))
      .includes(storeId);
  }
  // Neither field present — fail OPEN (keep the row) rather than silently
  // dropping real products from search/browse just because this particular
  // response happened not to carry either scoping field.
  return true;
}

/**
 * The tenant-wide catalog (SHARED across every store — see
 * fetchEntireStoreCatalog's header for why `current_company_id` doesn't
 * actually scope this), enriched with price out-of-band, used for
 * client-side search/filter/barcode lookup on the catalog page. Callers
 * filter to their own store via belongsToStore(entity, storeId) — see
 * useAllCatalog.js. Can take a while on a cold cache — pass onProgress to
 * show a running count while it loads.
 *
 * @param {number} seedCompanyId — any real company_id; seeds the request
 *   payload only, does not scope the result (see above)
 * @param {(loaded: number) => void} [onProgress]
 * @param {boolean} [showOutOfStock] — see fetchEntireStoreCatalog's own
 *   header; default false keeps every existing caller on the fast path.
 * @returns {Promise<object[]>} ProductCatalogRow[], unfiltered by store
 */
export async function getAllProducts(seedCompanyId, onProgress, showOutOfStock = false) {
  // Unpriced — see the PRICING note above.
  return fetchEntireStoreCatalog(seedCompanyId, onProgress, showOutOfStock);
}

/**
 * Fast, live SKU search — works at any catalog size, unlike getAllProducts
 * (which has to page through the whole store and can take a while for a
 * large catalog). Items/List's `item_search` is confirmed to match on
 * item_code specifically; results are ENRICHED with this store's real stock
 * (has_stock/current_company_pieces), the same fields getAllProducts sets —
 * but, unlike getAllProducts' own server-side showOutOfStock filter, this
 * NEVER drops a real code/SKU match just because it's out of stock here.
 *
 * FIXED 2026-09-30 (reported directly: an exact item_code/SKU search for a
 * real item returned nothing) — this used to hard-filter to
 * `stockByItemId.has(item_id)`, i.e. "has a stock row at THIS store",
 * unconditionally, with no way to override it via the catalog's own
 * "Include out of stock" toggle (applyBasicFilterOnly downstream already
 * respects that toggle and would have shown it correctly, but the item
 * never even reached that filter). An operator typing a SPECIFIC, known
 * code/SKU has already identified a real piece and expects to find it
 * regardless of which store's shelf it's actually on — same as OrnaVerse's
 * own item search, which isn't scoped to one store's stock either — so
 * exclusion is now left entirely to the existing toggle, same as every
 * other catalog row.
 *
 * The candidate pool here is naturally small (a SKU search is specific), so
 * it stays fast and reliable — unlike a broad name search (e.g. "Tennis"),
 * which can return hundreds or thousands of system-wide matches with no
 * guarantee this store's real matches are among the first N.
 *
 * @param {{ query: string, storeId: number, signal?: AbortSignal }} params
 *   `signal` lets the caller (useSkuSearch) cancel this request in-flight —
 *   TanStack Query passes a fresh AbortSignal per query and aborts the
 *   previous one automatically when the debounced search text changes, so
 *   wiring it through here means a superseded keystroke's request is
 *   actually cancelled on the wire instead of completing uselessly.
 * @returns {Promise<object[]>} ProductCatalogRow-shaped results
 */
export async function searchBySku({ query, storeId, signal }) {
  if (!query || !storeId) return [];

  const searchResponse = await axiosInstance.post(API.ITEMS.LIST, {
    item_search: query,
    Take: 50,
  }, { signal });
  const candidates = searchResponse.data?.Entities ?? [];
  if (!candidates.length) return [];

  const itemIds = candidates.map((c) => c.item_id);
  const stockData = await getStockByStoresBatch(itemIds, signal);
  const stockRows = stockData?.Entities ?? [];

  const stockByItemId = new Map(
    stockRows.filter((row) => row.company_id === storeId)
             .map((row) => [row.item_id, row])
  );

  // No .filter() here anymore — every real code/SKU match survives; stock
  // just decides its has_stock/current_company_pieces (0/false when this
  // store genuinely has none), same as any other catalog row.
  return candidates.map((c) => {
    const stock = stockByItemId.get(c.item_id) ?? null;
    return {
      item_id:          c.item_id,
      item_code:        c.item_code,
      item_name:        c.item_name,
      type_id:          c.type_id,
      sub_type_id:      c.sub_type_id,
      metal_id:         c.metal_id,
      karat_id:         c.karat_id,
      karat_code:       c.karat_code,
      metal_color_code: c.metal_color_code,
      weight:           stock?.weight     ?? c.weight,
      net_weight:       stock?.net_weight ?? c.net_weight,
      image:            c.image,
      // null, never item_rate — the stored rate understates the piece by
      // 2-3x (see the PRICING note above). Leaving it null routes this list
      // through the same live tier as the main catalog.
      price:            null,
      has_stock:              (stock?.pieces ?? 0) > 0,
      current_company_pieces: stock?.pieces ?? 0,
    };
  });
}

/**
 * Exact real per-piece SKU lookup for the catalog search box — a SEPARATE
 * gap from searchBySku above. Confirmed live (2026-09-30): Items/List's
 * `item_search` (what searchBySku/the general search box calls) does NOT
 * match a physical piece's own SKU at all — searching "LJ02266943" (a real,
 * confirmed-existing per-piece SKU) returned TotalCount: 0, while the exact
 * same query against StockJournal/List (this function) finds it instantly.
 * Reported directly: typing a real SKU into search returned nothing.
 *
 * StockJournal rows already carry item_code/item_name/image/weight etc.
 * (same fields Items/List's own candidates carry), so this builds a
 * ProductCatalogRow-shaped result directly from the matched piece — no
 * second lookup needed. Scoped to `companyId` (the active store) same as
 * getStockPieceBySku itself — NOT a cross-store lookup (confirmed live
 * 2026-09-30 against OrnaVerse's own POS counter: their own "SKU / Barcode"
 * field returns nothing for a real sku sitting at a different store than
 * the one currently active, same as this). A typed exact sku for a piece
 * elsewhere correctly finds nothing, matching real OrnaVerse.
 *
 * @param {{ sku: string, companyId: number }} params
 * @returns {Promise<object[]>} 0 or 1 ProductCatalogRow-shaped result
 */
export async function searchByExactSku({ sku, companyId }) {
  if (!sku || !companyId) return [];

  let row;
  try {
    const response = await getStockPieceBySku({ sku, companyId });
    row = response?.data?.Entities?.[0];
  } catch {
    return [];
  }
  if (!row?.item_id) return [];

  const atThisStore = row.company_id == null || row.company_id === companyId;
  return [{
    item_id:          row.item_id,
    item_code:        row.item_code,
    item_name:        row.item_name,
    type_id:          row.type_id,
    sub_type_id:      row.sub_type_id,
    metal_id:         row.metal_id,
    karat_id:         row.karat_id,
    karat_code:       row.karat_code,
    metal_color_code: row.metal_color_code,
    weight:           row.weight,
    net_weight:       row.net_weight,
    image:            row.image,
    price:            null,
    has_stock:              atThisStore,
    current_company_pieces: atThisStore ? 1 : 0,
  }];
}

/**
 * Cross-store stock for a single item (product detail page).
 * @param {number} itemId — item_id
 * @returns {Promise<import('axios').AxiosResponse>}
 */
export async function getStockByStores(itemId) {
  const response = await axiosInstance.post(API.CATALOG.GET_STOCK_BY_STORES, {
    item_id: itemId,
  });
  return response.data;
}

/**
 * Cross-store stock for multiple items in a single call.
 * Use on catalog grid to show availability indicators without N+1 calls.
 * @param {number[]} itemIds — array of item_id values
 * @param {AbortSignal} [signal] — optional, cancels the request in-flight
 * @returns {Promise<object>} OrnaVerse batch stock response
 */
export async function getStockByStoresBatch(itemIds, signal) {
  const response = await axiosInstance.post(API.CATALOG.GET_STOCK_BY_STORES_BATCH, {
    item_ids: itemIds,
  }, { signal });
  return response.data;
}