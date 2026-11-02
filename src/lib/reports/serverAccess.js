// SERVER-ONLY helpers shared by the /api/reports/* routes.
import { UPSTREAM } from '@/lib/ornaverse/upstream';
import { getUserStores } from '@/lib/ornaverse/authorizedStores';

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidCompanyIds(companyIds) {
  return Array.isArray(companyIds)
    && companyIds.length > 0
    && companyIds.length <= 50
    && companyIds.every((id) => Number.isInteger(id) && id > 0);
}

// A report page fires several report requests at once; one GetUserStores per user per few minutes is enough.
const STORES_TTL_MS = 5 * 60 * 1000;
const storesCache = new Map();

export async function getUserStoresCached(session) {
  const key = `${session.env}|${session.username}`;
  const hit = storesCache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.stores;
  const stores = await getUserStores(session);
  storesCache.set(key, { stores, expiresAt: Date.now() + STORES_TTL_MS });
  return stores;
}

/**
 * The requested stores, as OrnaVerse's GetUserStores returns them for this
 * operator, or null if not allowed. Super admins may request any of their
 * stores; everyone else only the store they're logged into (session.companyId,
 * recorded by the proxy on Account/SwitchCompany).
 */
export async function getAuthorizedStores(session, companyIds) {
  if (!session.isSuperAdmin && (companyIds.length !== 1 || companyIds[0] !== session.companyId)) {
    return null;
  }
  const stores = await getUserStoresCached(session);
  const byId = new Map(stores.map((s) => [s.company_id, s]));
  const selected = companyIds.map((id) => byId.get(id));
  return selected.every(Boolean) ? selected : null;
}

export async function postUpstream(session, path, body) {
  const headers = { 'Content-Type': 'application/json', Cookie: session.cookie };
  if (session.csrf) headers['X-CSRF-TOKEN'] = session.csrf;
  const res = await fetch(`${UPSTREAM}/${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    cache: 'no-store',
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) {
    const err = new Error(`${path} failed: HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export function toRfc1123(dateOnlyString) {
  return new Date(`${dateOnlyString}T00:00:00Z`).toUTCString();
}
