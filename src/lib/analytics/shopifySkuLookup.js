const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const SHOPIFY_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;
const API_VERSION   = '2025-10';
const STOREFRONT_URL = 'https://www.lucirajewelry.com';
const CACHE_TTL_MS   = 6 * 60 * 60 * 1000;
const MISS_TTL_MS    = 30 * 60 * 1000;

const cache = new Map();

const QUERY = `
  query VariantBySku($q: String!) {
    productVariants(first: 1, query: $q) {
      nodes {
        id
        sku
        image { url }
        product { id title handle productType featuredImage { url } }
      }
    }
  }
`;

function numericId(gid) {
  return gid ? String(gid).split('/').pop() : null;
}

async function fetchVariant(sku) {
  const res = await fetch(`https://${SHOPIFY_STORE}/admin/api/${API_VERSION}/graphql.json`, {
    method:  'POST',
    headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ query: QUERY, variables: { q: `sku:"${sku.replace(/"/g, '')}"` } }),
  });
  if (!res.ok) throw new Error(`Shopify ${res.status}`);
  const json = await res.json();
  const node = json?.data?.productVariants?.nodes?.[0];
  if (!node || String(node.sku ?? '').toLowerCase() !== sku.toLowerCase()) return null;
  const variantId = numericId(node.id);
  return {
    productId:      numericId(node.product?.id),
    variantId,
    productName:    node.product?.title ?? null,
    productType:    node.product?.productType || null,
    thumbnailImage: node.image?.url ?? node.product?.featuredImage?.url ?? null,
    productUrl:     node.product?.handle
      ? `${STOREFRONT_URL}/products/${node.product.handle}?variant=${variantId}`
      : null,
  };
}

export async function lookupShopifyBySku(sku) {
  const key = String(sku ?? '').trim();
  if (!key || !SHOPIFY_STORE || !SHOPIFY_TOKEN) return null;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  try {
    const value = await fetchVariant(key);
    cache.set(key, { value, expires: Date.now() + (value ? CACHE_TTL_MS : MISS_TTL_MS) });
    return value;
  } catch (err) {
    console.warn('[shopifySkuLookup] lookup failed', key, err.message);
    return null;
  }
}
