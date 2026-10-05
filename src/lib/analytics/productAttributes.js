import { resolveMetalColorName } from '@/lib/metalColor';

const GEMSTONE_GROUP_ID = 113;
const GEMSTONE_GROUP_NAME = 'Color Stone';

function firstGemstoneComponent(components) {
  if (!Array.isArray(components)) return null;
  return components.find(
    (c) => c.item_group_id === GEMSTONE_GROUP_ID || c.item_group_name === GEMSTONE_GROUP_NAME
  ) ?? null;
}

function parseGemstoneAttribute(attribute) {
  if (!attribute || typeof attribute !== 'string') return {};
  const [shape, color, , size] = attribute.split('/');
  const na = (v) => (v && v !== 'NA' ? v : null);
  return { shape: na(shape), color: na(color), size: na(size) };
}

function isLoopbackUrl(url) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(url);
}

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
    metal_color: resolveMetalColorName(item) ?? null,

    // Size
    size_id:   selectedSizeId   ?? item.item_size_id   ?? null,
    size_name: selectedSizeName ?? item.item_size_name ?? null,
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
