// Client-side service for Shopify data used in Lucira POS.
//
// Media (images + video) AND the product's own description are fetched from
// Shopify's GraphQL Admin API via our proxy route, in one request — if
// OrnaVerse ever starts returning image URLs (or a real per-product story)
// natively, only this file needs to change — no hooks, components, or pages
// depend on the source.
//
// MEDIA SHAPE returned by getShopifyProductMedia:
//   {
//     images: { id, src, alt, width, height, position }[],
//     videos: { id, src, poster, alt, position }[],
//     description: string | null,
//   }

/**
 * Fetches product media (images + video) and description from Shopify via
 * our server-side proxy route. The proxy hides SHOPIFY_ADMIN_TOKEN from the
 * browser and returns `description` as plain text (see that route's
 * htmlToPlainText — never raw HTML, so nothing here needs to sanitize it).
 *
 * Never throws — returns empty arrays/null on any error so callers can
 * always safely destructure without a try/catch.
 *
 * @param {string|number} externalProductId - Shopify product ID from
 *   OrnaVerse Style/Retrieve → Entity.external_product_id
 *
 * @returns {Promise<{
 *   images: Array<{ id: number|string, src: string, alt: string|null, width: number|null, height: number|null, position: number }>,
 *   videos: Array<{ id: string, src: string, poster: string|null, alt: string|null, position: number }>,
 *   description: string | null,
 * }>}
 */
export async function getShopifyProductMedia(externalProductId) {
  if (!externalProductId) return { images: [], videos: [], description: null };

  try {
    const res = await fetch(
      `/api/shopify/product-media/${externalProductId}`,
      {
        method:  'GET',
        headers: { 'Content-Type': 'application/json' },
      }
    );

    if (!res.ok) {
      console.warn(
        `[shopifyService] product-media returned ${res.status} for product ${externalProductId}`
      );
      return { images: [], videos: [], description: null };
    }

    const data = await res.json();
    return {
      images: Array.isArray(data.images) ? data.images : [],
      videos: Array.isArray(data.videos) ? data.videos : [],
      description: typeof data.description === 'string' ? data.description : null,
      handle: typeof data.handle === 'string' ? data.handle : null,
      variants: Array.isArray(data.variants) ? data.variants : [],
    };

  } catch (err) {
    console.warn('[shopifyService] getShopifyProductMedia failed:', err);
    return { images: [], videos: [], description: null };
  }
}
