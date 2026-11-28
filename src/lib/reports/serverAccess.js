// SERVER-ONLY helpers shared by the /api/reports/* routes.
import { UPSTREAM } from '@/lib/ornaverse/upstream';
import { getUserStoresCached } from '@/lib/ornaverse/authorizedStores';

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidCompanyIds(companyIds) {
  return Array.isArray(companyIds)
    && companyIds.length > 0
    && companyIds.length <= 50
    && companyIds.every((id) => Number.isInteger(id) && id > 0);
}

export { getUserStoresCached };

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

const REPORT_TTL_TODAY_MS = 2 * 60 * 1000;
const REPORT_TTL_PAST_MS = 15 * 60 * 1000;
const reportCache = new Map();

/** Shares one OrnaVerse run of a report between everyone asking for the same thing within a short window. */
export function cachedReport(session, name, { companyIds, fromDate, toDate }, run) {
  const key = [session.env, session.companyId ?? '', name, [...companyIds].sort((a, b) => a - b).join(','), fromDate, toDate].join('|');
  const now = Date.now();
  const hit = reportCache.get(key);
  if (hit && hit.expiresAt > now) return hit.promise;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const ttl = toDate >= today ? REPORT_TTL_TODAY_MS : REPORT_TTL_PAST_MS;
  const promise = run();
  reportCache.set(key, { promise, expiresAt: now + ttl });
  promise.catch(() => reportCache.delete(key));
  if (reportCache.size > 500) {
    for (const [k, v] of reportCache) if (v.expiresAt <= now) reportCache.delete(k);
  }
  return promise;
}
