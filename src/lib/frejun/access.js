// SERVER-ONLY. Which FreJun stores the current login may see: super admins see every store,
// a store login only the store(s) OrnaVerse says it belongs to.
import { getUserStoresCached } from '@/lib/reports/serverAccess';
import { FREJUN_STORES, matchStoreByNameOrCode, identifyStoreForCall } from './storeMapping';

export async function getFrejunScope(session) {
  if (session.isSuperAdmin) return { isAdmin: true, stores: FREJUN_STORES };

  const userStores = await getUserStoresCached(session);
  const own = session.companyId ? userStores.filter((s) => s.company_id === session.companyId) : userStores;
  const matched = new Map();
  for (const s of own) {
    const store = matchStoreByNameOrCode(s.mailing_name) || matchStoreByNameOrCode(s.company_code);
    if (store) matched.set(store.key, store);
  }
  return { isAdmin: false, stores: [...matched.values()] };
}

export function scopeAllowsStore(scope, key) {
  return scope.isAdmin || scope.stores.some((s) => s.key === key);
}

export function scopeAllowsEmail(scope, email) {
  if (scope.isAdmin) return true;
  const e = String(email || '').toLowerCase();
  return scope.stores.some((s) => s.email.toLowerCase() === e);
}

/** Drops any call that doesn't belong to one of the scope's stores (no-op for admins). */
export function filterCallsToScope(scope, calls) {
  if (scope.isAdmin) return calls;
  const keys = new Set(scope.stores.map((s) => s.key));
  return calls.filter((c) => keys.has(identifyStoreForCall(c)?.key));
}
