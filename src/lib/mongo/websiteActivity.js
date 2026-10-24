import { getWebsiteDb } from './websiteClient';
import { normalizeMobileKey } from './normalizeMobile';
import { getVariantSkusByIds, getProductDefaultSkusByIds } from '@/lib/shopify/variantSku';

// Read-only — never writes to the website's database. A slow/unreachable
// website DB must never block or break a POS profile page, so every query
// here is guarded by the same fail-fast timeout catalogPriceCache.js uses.
const DB_TIMEOUT_MS = 2500;

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('websiteActivity: DB timed out')), ms)),
  ]);
}

async function findSessionIdentities(db, { mobile, email }) {
  const key = normalizeMobileKey(mobile);
  const or = [];
  if (key) or.push({ 'customer.phone': { $regex: `${key}$` } });
  if (email) or.push({ 'customer.email': email });
  if (!or.length) return [];

  return db.collection('session_identities')
    .find({ $or: or })
    .sort({ updatedAt: -1 })
    .limit(50)
    .toArray();
}

function shopifyUserIdVariants(numericId) {
  return [numericId, `gid://shopify/Customer/${numericId}`];
}

// The same phone/email can be tied to several Shopify customer accounts over
// time (re-registration, guest-to-account merges, reused test data) — each
// with its own wishlist/cart document. Merge across all of them rather than
// picking only the most recently updated one, so an older account's items
// are never silently dropped.
function dedupeBy(items, keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = keyFn(item);
    if (key != null && seen.has(key)) continue;
    if (key != null) seen.add(key);
    out.push(item);
  }
  return out;
}

// Many website wishlist/cart entries never got a sku written into their own
// tracking document, even though the underlying Shopify variant always has
// one (confirmed live: it matches OrnaVerse's own item_code exactly) — so a
// missing sku here doesn't mean an unmatchable item, just an under-recorded
// one. Filling it in from Shopify directly lets these resolve through the
// exact same sku-match path as items that already had it, with no separate
// "style-level" fallback needed.
const SHOPIFY_TIMEOUT_MS = 2500;

async function enrichWithSkus(items) {
  const missingVariant = items.filter((item) => !item.sku?.trim() && item.variantId);

  let skuByVariantId = new Map();
  if (missingVariant.length) {
    try {
      skuByVariantId = await withTimeout(
        getVariantSkusByIds(missingVariant.map((item) => item.variantId)),
        SHOPIFY_TIMEOUT_MS,
      );
    } catch (err) {
      console.warn('[websiteActivity] variant sku enrichment failed:', err?.message);
    }
  }

  const afterVariantPass = items.map((item) => {
    if (item.sku?.trim()) return item;
    const sku = skuByVariantId.get(item.variantId);
    return sku ? { ...item, sku } : item;
  });

  // Still-unresolved items never had a variant selected at all (only a
  // productId) — fall back to that product's own default variant.
  const missingProduct = afterVariantPass.filter((item) => !item.sku?.trim() && !item.variantId && item.productId);
  if (!missingProduct.length) return afterVariantPass;

  let skuByProductId = new Map();
  try {
    skuByProductId = await withTimeout(
      getProductDefaultSkusByIds(missingProduct.map((item) => item.productId)),
      SHOPIFY_TIMEOUT_MS,
    );
  } catch (err) {
    console.warn('[websiteActivity] product sku enrichment failed:', err?.message);
    return afterVariantPass;
  }

  return afterVariantPass.map((item) => {
    if (item.sku?.trim()) return item;
    const sku = skuByProductId.get(item.productId);
    return sku ? { ...item, sku } : item;
  });
}

/**
 * Best-effort snapshot of a customer's website activity — wishlist, current
 * cart, latest abandoned cart, and recently-viewed products — resolved via
 * the website's own session_identities (mobile/email -> Shopify customer).
 * Never throws; any failure (including no matching website identity at all)
 * degrades to empty arrays.
 *
 * @param {{ mobile?: string, email?: string }} params
 */
export async function getWebsiteActivity({ mobile, email }) {
  const empty = { wishlist: [], cart: [], abandonedCart: [], recentlyViewed: [] };
  if (!mobile && !email) return empty;

  try {
    const db = await getWebsiteDb();
    const sessions = await withTimeout(findSessionIdentities(db, { mobile, email }), DB_TIMEOUT_MS);
    if (!sessions.length) return empty;

    const sessionIds = [...new Set(sessions.map((s) => s.sessionId).filter(Boolean))];
    const numericUserIds = [...new Set(
      sessions.map((s) => String(s.userId ?? '').match(/\d+$/)?.[0]).filter(Boolean)
    )];
    const userIdVariants = numericUserIds.flatMap(shopifyUserIdVariants);

    const [wishlistDocs, cartDocs, abandonedCartDocs, viewEvents] = await withTimeout(Promise.all([
      userIdVariants.length
        ? db.collection('wishlists').find({ userId: { $in: userIdVariants } }).sort({ updatedAt: -1 }).toArray()
        : Promise.resolve([]),
      userIdVariants.length
        ? db.collection('carts').find({ userId: { $in: userIdVariants } }).sort({ updatedAt: -1 }).toArray()
        : Promise.resolve([]),
      sessionIds.length
        ? db.collection('abandoned_carts').find({ sessionId: { $in: sessionIds } }).sort({ updatedAt: -1 }).toArray()
        : Promise.resolve([]),
      sessionIds.length
        ? db.collection('user_tracking').find({ sessionId: { $in: sessionIds }, type: 'product_view' }).sort({ timestamp: -1 }).limit(20).toArray()
        : Promise.resolve([]),
    ]), DB_TIMEOUT_MS);

    const wishlist = dedupeBy(
      wishlistDocs.flatMap((doc) => doc.items ?? []),
      (item) => item.variantId ?? item.productId,
    );
    const cart = dedupeBy(
      cartDocs.flatMap((doc) => doc.items ?? []),
      (item) => item.variantId ?? item.sku ?? item.id,
    );
    const abandonedCart = dedupeBy(
      abandonedCartDocs.flatMap((doc) => doc.items ?? []),
      (item) => item.variantId ?? item.sku ?? item.id,
    );

    const [enrichedWishlist, enrichedCart, enrichedAbandonedCart] = await Promise.all([
      enrichWithSkus(wishlist),
      enrichWithSkus(cart),
      enrichWithSkus(abandonedCart),
    ]);

    return {
      wishlist:      enrichedWishlist,
      cart:          enrichedCart,
      abandonedCart: enrichedAbandonedCart,
      recentlyViewed: viewEvents.map((e) => ({
        title:      e.product,
        variantId:  e.variantId,
        sourcePage: e.sourcePage,
        timestamp:  e.timestamp,
      })),
    };
  } catch (err) {
    console.warn('[websiteActivity] getWebsiteActivity failed:', err?.message);
    return empty;
  }
}
