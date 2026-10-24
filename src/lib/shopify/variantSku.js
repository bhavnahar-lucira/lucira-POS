import { shopifyGraphQL, shopifyConfigured } from './adminCustomer';

const CHUNK_SIZE = 100;

function toVariantGid(variantId) {
  const numeric = String(variantId ?? '').match(/\d+$/)?.[0];
  return numeric ? `gid://shopify/ProductVariant/${numeric}` : null;
}

function toProductGid(productId) {
  const numeric = String(productId ?? '').match(/\d+$/)?.[0];
  return numeric ? `gid://shopify/Product/${numeric}` : null;
}

const QUERY = `
  query GetVariantSkus($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on ProductVariant { id sku }
    }
  }
`;

// No variant was ever selected for this wishlist entry (no variantId at
// all) — picks that product's first variant's sku as a real, clickable
// stand-in. Same "lands on a representative variant, not necessarily the
// exact one" caveat as elsewhere, but still a real OrnaVerse item rather
// than a dead card.
const PRODUCT_QUERY = `
  query GetProductDefaultSkus($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Product {
        id
        variants(first: 1) { nodes { sku } }
      }
    }
  }
`;

/**
 * Resolves real Shopify variant SKUs for a batch of variant ids (bare
 * numeric or full gid, mixed) — these already match OrnaVerse's own
 * item_code format on this tenant. Best-effort: any failure (missing
 * credentials, network error, malformed response) degrades to an empty
 * map, never throws.
 *
 * @param {(string|number)[]} variantIds
 * @returns {Promise<Map<string, string>>} input variantId (as given) -> sku
 */
export async function getVariantSkusByIds(variantIds) {
  const result = new Map();
  if (!shopifyConfigured() || !variantIds?.length) return result;

  const gidByInput = new Map();
  for (const id of variantIds) {
    const gid = toVariantGid(id);
    if (gid) gidByInput.set(String(id), gid);
  }
  const uniqueGids = [...new Set(gidByInput.values())];
  if (!uniqueGids.length) return result;

  const skuByGid = new Map();
  try {
    for (let i = 0; i < uniqueGids.length; i += CHUNK_SIZE) {
      const chunk = uniqueGids.slice(i, i + CHUNK_SIZE);
      const res = await shopifyGraphQL(QUERY, { ids: chunk });
      const nodes = res?.data?.nodes ?? [];
      for (const node of nodes) {
        if (node?.id && node?.sku) skuByGid.set(node.id, node.sku);
      }
    }
  } catch (err) {
    console.warn('[variantSku] getVariantSkusByIds failed:', err?.message);
    return result;
  }

  for (const [input, gid] of gidByInput) {
    const sku = skuByGid.get(gid);
    if (sku) result.set(input, sku);
  }
  return result;
}

/**
 * Resolves a representative sku (the product's first variant) for a batch
 * of product ids that have no variant selected at all. Same resilience
 * contract as getVariantSkusByIds — never throws, degrades to empty.
 *
 * @param {(string|number)[]} productIds
 * @returns {Promise<Map<string, string>>} input productId (as given) -> sku
 */
export async function getProductDefaultSkusByIds(productIds) {
  const result = new Map();
  if (!shopifyConfigured() || !productIds?.length) return result;

  const gidByInput = new Map();
  for (const id of productIds) {
    const gid = toProductGid(id);
    if (gid) gidByInput.set(String(id), gid);
  }
  const uniqueGids = [...new Set(gidByInput.values())];
  if (!uniqueGids.length) return result;

  const skuByGid = new Map();
  try {
    for (let i = 0; i < uniqueGids.length; i += CHUNK_SIZE) {
      const chunk = uniqueGids.slice(i, i + CHUNK_SIZE);
      const res = await shopifyGraphQL(PRODUCT_QUERY, { ids: chunk });
      const nodes = res?.data?.nodes ?? [];
      for (const node of nodes) {
        const sku = node?.variants?.nodes?.[0]?.sku;
        if (node?.id && sku) skuByGid.set(node.id, sku);
      }
    }
  } catch (err) {
    console.warn('[variantSku] getProductDefaultSkusByIds failed:', err?.message);
    return result;
  }

  for (const [input, gid] of gidByInput) {
    const sku = skuByGid.get(gid);
    if (sku) result.set(input, sku);
  }
  return result;
}
