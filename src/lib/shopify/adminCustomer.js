// Shared Shopify Admin GraphQL helpers for resolving/writing a customer
// record by phone or email — used by api/customers/shopify-sync (push a
// POS-created customer to Shopify) and api/nector/[...path] (resolve the
// numeric Shopify customer id a Nector redemption call needs). Server-only:
// SHOPIFY_ADMIN_TOKEN must never reach the browser.

const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const SHOPIFY_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;
const API_VERSION   = '2025-10';

import { toE164India } from '@/lib/analytics/phoneFormat';

export { toE164India };

// Shopify's search query syntax is embedded as a literal string — escape
// single quotes so a stray apostrophe in an email's local part can't break
// the query syntax.
const escQuery = (value) => value.replace(/'/g, "\\'");

export async function shopifyGraphQL(query, variables) {
  const res = await fetch(`https://${SHOPIFY_STORE}/admin/api/${API_VERSION}/graphql.json`, {
    method:  'POST',
    headers: {
      'X-Shopify-Access-Token': SHOPIFY_TOKEN,
      'Content-Type':           'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

export function shopifyConfigured() {
  return Boolean(SHOPIFY_STORE && SHOPIFY_TOKEN);
}

const FIND_QUERY = `
  query FindCustomer($query: String!) {
    customers(first: 1, query: $query) {
      edges { node { id phone email } }
    }
  }
`;

/**
 * Finds a Shopify customer by phone (raw mobile, normalized to E.164) or
 * email — same lookup shopify-sync uses to avoid duplicating a customer
 * OrnaVerse's own push may have already created.
 *
 * @param {{ mobile?: string, email?: string }} params
 * @returns {Promise<{ id: string, numericId: string, phone: string|null, email: string|null } | null>}
 *   `id` is the full GID (gid://shopify/Customer/123), `numericId` just the
 *   trailing digits — Nector's customer_id wants "shopify-<numericId>".
 */
export async function findShopifyCustomer({ mobile, email } = {}) {
  const phone = toE164India(mobile);
  if (!phone && !email) return null;

  const queryParts = [];
  if (phone) queryParts.push(`phone:'${escQuery(phone)}'`);
  if (email) queryParts.push(`email:'${escQuery(email)}'`);

  const res = await shopifyGraphQL(FIND_QUERY, { query: queryParts.join(' OR ') });
  const node = res?.data?.customers?.edges?.[0]?.node ?? null;
  if (!node) return null;

  return {
    id:        node.id,
    numericId: String(node.id).match(/\d+$/)?.[0] ?? '',
    phone:     node.phone ?? null,
    email:     node.email ?? null,
  };
}
