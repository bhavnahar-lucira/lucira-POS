// Facet filters for the catalog page (Diamond Shape, Carat, Weight,
// Material, Price) — added 2026-09-28, Color removed same day (explicit
// direction). All derived from fields CONFIRMED LIVE on ProductCatalog/List's
// own response (shape_code, diamond_weight, weight/net_weight, metal_id,
// karat_code) — ProductCatalog/List does NOT accept any of these as request
// filters (confirmed live: passing e.g. shape_code in the request body
// 500s), so every facet here is applied client-side against the full store
// sweep (useAllCatalog), the same mechanism catalog search already uses.
// There is no ring-size field anywhere on this endpoint, so a Size filter
// isn't built — it would need a per-item detail call, infeasible at catalog
// scale.

import APP_CONFIG from '@/constants/appConfig';

// Only the standard, unambiguous GIA shape abbreviations are named — an
// unrecognized code still filters correctly, it just displays as its raw
// code instead of a guessed name (no live master list of shape names was
// found to confirm the rest against — see this file's header).
const SHAPE_LABELS = { RD: 'Round', OV: 'Oval', PE: 'Pear', PR: 'Princess', CU: 'Cushion', EM: 'Emerald', MQ: 'Marquise', HT: 'Heart', AS: 'Asscher', RA: 'Radiant' };
export function getShapeLabel(code) {
  return SHAPE_LABELS[code] ?? code;
}

const METAL_LABELS = Object.fromEntries(
  Object.entries(APP_CONFIG.METAL_TYPES).map(([name, id]) => [id, name.charAt(0) + name.slice(1).toLowerCase()])
);
export function getMaterialLabel(metal_id, karat_code) {
  const metal = METAL_LABELS[metal_id] ?? null;
  if (!metal) return null;
  return karat_code && karat_code !== 'NA' ? `${metal} ${karat_code}` : metal;
}
export function getMaterialKey(metal_id, karat_code) {
  return `${metal_id ?? ''}:${karat_code ?? ''}`;
}

// Carat buckets — diamond_weight is already in carats (standard jewelry
// convention: gem weight, unlike gross/net weight which are grams).
export const CARAT_BUCKETS = [
  { key: 'lt_025',  label: 'Below 0.25',   min: 0,    max: 0.25 },
  { key: '025_049', label: '0.25 - 0.49',  min: 0.25, max: 0.5 },
  { key: '050_099', label: '0.50 - 0.99',  min: 0.5,  max: 1 },
  { key: '100_149', label: '1.00 - 1.49',  min: 1,    max: 1.5 },
  { key: '150_199', label: '1.50 - 1.99',  min: 1.5,  max: 2 },
  { key: 'gte_200', label: '2.00 & Above', min: 2,    max: Infinity },
];

// Weight buckets — grams. Same shape reused for both Gold (net_weight) and
// Diamond (diamond_weight in grams, not carats — deliberately a different
// unit/granularity than the Carat filter above, which is the carat-specific
// one buyers actually think in) weight modes.
export const WEIGHT_BUCKETS = [
  { key: 'lt_2',    label: 'Below 2g',   min: 0,  max: 2 },
  { key: '2_5',     label: '2 - 5g',     min: 2,  max: 5 },
  { key: '5_10',    label: '5 - 10g',    min: 5,  max: 10 },
  { key: '10_20',   label: '10 - 20g',   min: 10, max: 20 },
  { key: 'gte_20',  label: '20g & Above', min: 20, max: Infinity },
];

function inBucket(value, bucket) {
  return value >= bucket.min && value < bucket.max;
}

/**
 * Scans a product array and returns every facet's available options, each
 * with a live count — so the panel only ever offers options that actually
 * exist in the current store/category, with real numbers (matches the
 * reference screenshot's "(1)" counts) rather than a static, possibly-empty list.
 */
export function buildFacetOptions(products) {
  const shapeCounts = new Map();
  const materialCounts = new Map();
  const caratCounts = new Map();
  const goldWeightCounts = new Map();
  const diamondWeightCounts = new Map();
  let priceMin = null;
  let priceMax = null;

  for (const p of products) {
    if (p.shape_code && p.shape_code !== 'NA') {
      shapeCounts.set(p.shape_code, (shapeCounts.get(p.shape_code) ?? 0) + 1);
    }

    const materialKey = getMaterialKey(p.metal_id, p.karat_code);
    if (getMaterialLabel(p.metal_id, p.karat_code)) {
      materialCounts.set(materialKey, (materialCounts.get(materialKey) ?? 0) + 1);
    }

    const carat = Number(p.diamond_weight) || 0;
    if (carat > 0) {
      const bucket = CARAT_BUCKETS.find((b) => inBucket(carat, b));
      if (bucket) caratCounts.set(bucket.key, (caratCounts.get(bucket.key) ?? 0) + 1);
    }

    const goldWeight = Number(p.net_weight ?? p.weight) || 0;
    if (goldWeight > 0) {
      const bucket = WEIGHT_BUCKETS.find((b) => inBucket(goldWeight, b));
      if (bucket) goldWeightCounts.set(bucket.key, (goldWeightCounts.get(bucket.key) ?? 0) + 1);
    }
    const diamondGrams = Number(p.diamond_weight) || 0;
    if (diamondGrams > 0) {
      const bucket = WEIGHT_BUCKETS.find((b) => inBucket(diamondGrams, b));
      if (bucket) diamondWeightCounts.set(bucket.key, (diamondWeightCounts.get(bucket.key) ?? 0) + 1);
    }

    if (typeof p.price === 'number') {
      priceMin = priceMin == null ? p.price : Math.min(priceMin, p.price);
      priceMax = priceMax == null ? p.price : Math.max(priceMax, p.price);
    }
  }

  return {
    shapes: [...shapeCounts.entries()].map(([code, count]) => ({ value: code, label: getShapeLabel(code), count })),
    materials: [...materialCounts.entries()].map(([key, count]) => {
      const [metal_id, karat_code] = key.split(':');
      return { value: key, label: getMaterialLabel(Number(metal_id), karat_code), count };
    }),
    caratBuckets: CARAT_BUCKETS
      .map((b) => ({ value: b.key, label: b.label, count: caratCounts.get(b.key) ?? 0 }))
      .filter((b) => b.count > 0),
    goldWeightBuckets: WEIGHT_BUCKETS
      .map((b) => ({ value: b.key, label: b.label, count: goldWeightCounts.get(b.key) ?? 0 }))
      .filter((b) => b.count > 0),
    diamondWeightBuckets: WEIGHT_BUCKETS
      .map((b) => ({ value: b.key, label: b.label, count: diamondWeightCounts.get(b.key) ?? 0 }))
      .filter((b) => b.count > 0),
    priceMin, priceMax,
  };
}

/**
 * @param {object[]} products
 * @param {{
 *   shapes?: string[], materials?: string[],
 *   caratBuckets?: string[], weightMode?: 'gold'|'diamond', weightBuckets?: string[],
 *   priceMin?: number|null, priceMax?: number|null,
 * }} facets
 */
export function applyFacetFilters(products, facets) {
  const {
    shapes = [], materials = [],
    caratBuckets = [], weightMode = 'gold', weightBuckets = [],
    priceMin = null, priceMax = null,
  } = facets;

  return products.filter((p) => {
    if (shapes.length && !shapes.includes(p.shape_code)) return false;
    if (materials.length && !materials.includes(getMaterialKey(p.metal_id, p.karat_code))) return false;

    if (caratBuckets.length) {
      const carat = Number(p.diamond_weight) || 0;
      const bucket = CARAT_BUCKETS.find((b) => inBucket(carat, b));
      if (!bucket || !caratBuckets.includes(bucket.key)) return false;
    }

    if (weightBuckets.length) {
      const grams = weightMode === 'diamond' ? Number(p.diamond_weight) || 0 : Number(p.net_weight ?? p.weight) || 0;
      const bucket = WEIGHT_BUCKETS.find((b) => inBucket(grams, b));
      if (!bucket || !weightBuckets.includes(bucket.key)) return false;
    }

    if (priceMin != null && (typeof p.price !== 'number' || p.price < priceMin)) return false;
    if (priceMax != null && (typeof p.price !== 'number' || p.price > priceMax)) return false;

    return true;
  });
}

export function hasActiveFacets(facets) {
  return !!(
    facets.shapes?.length || facets.materials?.length
    || facets.caratBuckets?.length || facets.weightBuckets?.length
    || facets.priceMin != null || facets.priceMax != null
  );
}
