// src/lib/analytics/productAttributes.js
//
// Single source of truth for "everything we know about a product" as
// analytics attributes, so every product-related tracker.track() call site
// (AddToCartButton, product detail view_item, ...) reports the same field
// set with the same names instead of each hand-picking its own subset.
//
// SOURCES, most-specific first — pass whichever you have; earlier ones win
// for the fields they can answer:
//   pricedItem — a live-priced SetSalesItems row (real sub_total/net_amount/
//     per-component amounts, the only source with a genuine per-piece sku)
//   activeItem — the specific variant/customization currently selected
//   product    — the item master (Items/Retrieve or ProductCatalogRow),
//     fallback for identity/classification/hsn
//
// GEMSTONE DETAIL comes from item_components/components (the BOM array,
// filtered to item_group_id === 113 / 'Color Stone' — same filter
// ProductSpecifications.jsx uses), parsed from the row's composite
// `attribute` string ("{Shape}/{Color}/{Metal}/{Size}/{Quality}", e.g.
// "PR/RED/NA/4.5*4.5/NA") when resolved shape_name/stone_color_name are
// missing — a priced component row often only carries the composite string.
//
// EVERY field defaults to null, never omitted — a caller checking
// event.diamond_weight for "was there a diamond" can rely on null (not
// undefined/absent) meaning no.
//
// PII-SAFE — nothing here is customer data; the GA4/WebEngage PII split
// still belongs to each call site (see tracker.js's jsdoc).

import { resolveMetalColorName } from '@/lib/metalColor';

const GEMSTONE_GROUP_ID = 113;
const GEMSTONE_GROUP_NAME = 'Color Stone';

function firstGemstoneComponent(components) {
  if (!Array.isArray(components)) return null;
  return components.find(
    (c) => c.item_group_id === GEMSTONE_GROUP_ID || c.item_group_name === GEMSTONE_GROUP_NAME
  ) ?? null;
}

// Parses "{Shape}/{Color}/{Metal}/{Size}/{Quality}" — see this file's own
// header. "NA" segments (OrnaVerse's placeholder for "not applicable")
// resolve to null, same as every other "NA" field this app treats that way.
function parseGemstoneAttribute(attribute) {
  if (!attribute || typeof attribute !== 'string') return {};
  const [shape, color, , size] = attribute.split('/');
  const na = (v) => (v && v !== 'NA' ? v : null);
  return { shape: na(shape), color: na(color), size: na(size) };
}

// A loopback origin (dev server: http://localhost:3000 / 127.0.0.1) — confirmed
// live (2026-09-28) that WebEngage's own ingest endpoint 403s the ENTIRE
// event when any attribute value is a URL pointing at one (isolated via
// direct testing: a localhost/127.0.0.1 URL 403s, an identical https:// or
// even a private-LAN 192.168.x URL does not — a targeted anti-SSRF WAF rule,
// not a generic "URL in payload" or attribute-count block). Retrying doesn't
// help; this is deterministic. Only a real risk in local dev — a deployed
// origin is a real domain — but must be guarded here since dev IS where this
// gets tested. Returns null rather than sending an unreachable/blocked URL.
function isLoopbackUrl(url) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(url);
}

// resolveImageSrc() (src/lib/resolveImageSrc.js) can return a root-relative
// path ("/upload/..." or "/api/upload/...") — fine for a Next <Image> src,
// but WebEngage's own servers can't resolve that without our origin. Already
// an absolute http(s) URL (the NEXT_PUBLIC_ORNAVERSE_BASE_URL-prefixed case)
// passes through untouched. Also applied to productUrl below — see
// isLoopbackUrl's header for why a loopback result is dropped, not sent.
function toAbsoluteUrl(src) {
  if (!src) return null;
  if (/^https?:\/\//.test(src)) return isLoopbackUrl(src) ? null : src;
  if (typeof window === 'undefined') return src;
  const absolute = `${window.location.origin}${src.startsWith('/') ? '' : '/'}${src}`;
  return isLoopbackUrl(absolute) ? null : absolute;
}

/**
 * @param {{
 *   product?:    object|null, — item master (Items/Retrieve or ProductCatalogRow)
 *   activeItem?: object|null, — the currently-selected variant/customization, if any
 *   pricedItem?: object|null, — live-priced SetSalesItems row (useVariantPricing's
 *                               data) — real sub_total/net_amount/per-component
 *                               amounts + the genuine per-piece sku
 *   image?:            string|null, — resolved primary image URL; caller has
 *                                     already resolved any colour/customization-
 *                                     specific image (see AddToCartButton's own
 *                                     "MUST already be colour-matched" note)
 *   productUrl?:       string|null,
 *   selectedSizeId?:   number|null,
 *   selectedSizeName?: string|null,
 *   hasStock?:         boolean|null,
 * }} sources
 * @returns {object} flat attributes object — numbers/strings/booleans/null
 *   only, safe for both GA4's `properties` and WebEngage's `webengageExtra`.
 */
export function buildProductAttributes({
  product = null, activeItem = null, pricedItem = null,
  image = null, productUrl = null, selectedSizeId = null, selectedSizeName = null,
  hasStock = null,
} = {}) {
  const item   = activeItem ?? product ?? {};
  const priced = pricedItem ?? {};

  const components = item.item_components ?? item.components ?? priced.item_components ?? null;
  const gemstone = firstGemstoneComponent(components);
  const parsed   = parseGemstoneAttribute(gemstone?.attribute);

  return {
    // Identity / media
    item_id:     item.item_id ?? null,
    item_code:   item.item_code ?? null,
    item_name:   item.item_name ?? null,
    sku:         priced.sku ?? null, // per-piece SKU only ever lives on the priced row — see this file's header
    style_id:    item.style_id ?? null,
    image:       toAbsoluteUrl(image ?? item.image_url ?? item.image ?? null),
    product_url: toAbsoluteUrl(productUrl),
    has_stock:   hasStock,

    // Classification
    item_group_name: item.item_group_name ?? null,
    category:        item.type_name ?? null,
    sub_category:    item.sub_type_name ?? null,
    collection:      item.collection_name ?? null,
    brand:           item.brand_name ?? null,
    hsn:             item.hsn ?? null,

    // Metal
    metal:       item.metal_name ?? null,
    karat:       item.karat_name ?? null,
    // Use resolveMetalColorName rather than a bare item.metal_color_name —
    // ProductCatalogRow only carries the short code (metal_color_code), not
    // the full name (see resolveMetalColorName's own header).
    metal_color: resolveMetalColorName(item) ?? null,

    // Size
    size_id:   selectedSizeId   ?? item.item_size_id   ?? null,
    size_name: selectedSizeName ?? item.item_size_name ?? null,

    // Weight — gross (everything: metal + diamonds + gemstones + all
    // components, per ProductSpecifications.jsx's own static copy) vs net
    // (metal only) vs per-component.
    gross_weight: item.weight     ?? null,
    net_weight:   item.net_weight ?? null,
    stone_weight:       priced.stone_weight       ?? item.stone_weight       ?? null,
    diamond_weight:     priced.diamond_weight      ?? item.diamond_weight     ?? null,
    color_stone_weight: priced.color_stone_weight  ?? item.color_stone_weight ?? null,
    other_weight:       priced.other_weight        ?? item.other_weight       ?? null,
    diamond_pieces:     priced.diamond_pieces      ?? item.diamond_pieces     ?? null,
    stone_pieces:       priced.stone_pieces        ?? item.stone_pieces       ?? null,
    color_stone_pieces: priced.color_stone_pieces  ?? item.color_stone_pieces ?? null,
    other_pieces:       priced.other_pieces        ?? item.other_pieces       ?? null,

    // Dimensions — physical size beyond weight (rings/pendants/bangles)
    height: item.height ?? null,
    width:  item.width  ?? null,
    length: item.length ?? null,
    depth:  item.depth  ?? null,

    // Gemstone detail — the one Color Stone BOM component, when present.
    // See this file's header for why there's no flat field for this.
    gemstone_type:  gemstone?.type_name        ?? null,
    gemstone_shape: gemstone?.shape_name       ?? parsed.shape ?? null,
    gemstone_color: gemstone?.stone_color_name ?? parsed.color ?? null,
    gemstone_size:  parsed.size ?? null,

    // Price breakup — LIVE-priced entity only. The item master's own price
    // fields (item_rate/sale_price/price/mrp/rate/compare_price) are never
    // used as a fallback — they're stale and can understate a piece by 2-3x.
    price_metal_amount:       priced.metal_amount       ?? null,
    price_diamond_amount:     priced.diamond_amount      ?? null,
    price_stone_amount:       priced.stone_amount        ?? null,
    price_color_stone_amount: priced.color_stone_amount  ?? null,
    price_other_amount:       priced.other_amount        ?? null,
    price_making_charges:     priced.item_labour          ?? null,
    price_sub_total:          priced.sub_total            ?? null,
    price_taxable_amount:     priced.taxable_amount        ?? null,
    price_tax_amount:         priced.tax_amount            ?? null,
    price_net_amount:         priced.net_amount            ?? null,
  };
}
