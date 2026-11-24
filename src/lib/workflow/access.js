// SERVER-ONLY. Which stores' workflow orders a login may see. Super admins see everything (null = no limit);
// a store login only its own store, identified by OrnaVerse's company_code (HO, PN1, BO1, …).
import { getUserStoresCached } from '@/lib/reports/serverAccess';

export async function getWorkflowStoreCodes(session) {
  if (session.isSuperAdmin) return null;
  const stores = await getUserStoresCached(session);
  const own = session.companyId ? stores.filter((s) => s.company_id === session.companyId) : stores;
  return own.map((s) => s.company_code).filter(Boolean);
}

/** The store codes to filter by: a super admin's optional choice, or the login's own store(s). */
export function effectiveStoreCodes(allowedCodes, requestedCode) {
  const requested = String(requestedCode || '').trim().toUpperCase();
  if (allowedCodes === null) return requested && requested !== 'ALL' ? [requested] : null;
  return requested && allowedCodes.includes(requested) ? [requested] : allowedCodes;
}

/** OrnaVerse document numbers start with the store code ("PN1-RPO-…"). */
export function documentInStores(docNo, codes) {
  if (codes === null) return true;
  return codes.some((c) => String(docNo || '').toUpperCase().startsWith(`${c}-`));
}
