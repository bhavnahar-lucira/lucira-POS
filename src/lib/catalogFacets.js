// Price range filter for the catalog page — the ONE facet still applied
// client-side (2026-09-30 redesign moved every other facet — Sub Category,
// Karat, Metal Color, Diamond Shape, Item Size, Collection, Weight, Diamond
// Weight — to real server-side ProductCatalog/List filters; see
// useCatalogFilters.js's own header for why). Price can't follow them
// server-side: ProductCatalog/List's own rows never carry a populated
// `price` field on this tenant (see catalogService.js's PRICING note) — our
// real price only exists after useLiveCatalogPrices merges it in, so this
// still narrows the already-loaded, already-priced result set instead.

/**
 * Live min/max across whatever's currently priced — the Price filter's own
 * slider bounds. Not a static/configured range: it reflects the real spread
 * of prices actually on screen right now, same as the pre-redesign facet
 * panel did. Returns null while nothing has priced yet (or everything priced
 * to the same figure), so the caller can hide the slider instead of showing
 * a useless 0-width one.
 */
export function getPriceBounds(products) {
  let min = null;
  let max = null;
  for (const p of products) {
    if (typeof p.price !== 'number') continue;
    min = min == null ? p.price : Math.min(min, p.price);
    max = max == null ? p.price : Math.max(max, p.price);
  }
  if (min == null || max == null || max <= min) return null;
  return { min: Math.floor(min), max: Math.ceil(max) };
}

export function applyPriceFilter(products, { priceMin = null, priceMax = null }) {
  if (priceMin == null && priceMax == null) return products;
  return products.filter((p) => {
    if (typeof p.price !== 'number') return false;
    if (priceMin != null && p.price < priceMin) return false;
    if (priceMax != null && p.price > priceMax) return false;
    return true;
  });
}

export function hasActiveFacets(facets) {
  return !!(
    facets.subTypeIds?.length || facets.karatIds?.length || facets.metalColorIds?.length
    || facets.shapeIds?.length || facets.itemSizeIds?.length || facets.collectionIds?.length
    || facets.weightFrom != null || facets.weightTo != null
    || facets.diamondWeightFrom != null || facets.diamondWeightTo != null
    || facets.priceMin != null || facets.priceMax != null
  );
}
