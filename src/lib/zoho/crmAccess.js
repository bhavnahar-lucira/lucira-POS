// SERVER-ONLY. What part of Zoho CRM the signed-in operator may see.
import { getUserStoresCached } from '@/lib/reports/serverAccess';
import { zohoMappingForStore } from './storeOwners';

/**
 * Super admins see everything. Store logins see their store's leads (by Zoho owner) and meetings
 * (by Zoho "Store Name") for the store they are logged into (session.companyId, set server-side on SwitchCompany).
 * @returns {Promise<{ all: boolean, ownerIds: string[], zohoStore: string|null, storeName: string|null }>}
 */
export async function getCrmScope(session) {
  if (session.isSuperAdmin) return { all: true, ownerIds: [], zohoStore: null, storeName: null };
  const stores = session.companyId ? await getUserStoresCached(session) : [];
  const store = stores.find((s) => s.company_id === session.companyId) ?? null;
  const mapping = zohoMappingForStore(store);
  return {
    all: false,
    ownerIds: (mapping?.owners ?? []).map((o) => o.id),
    zohoStore: mapping?.zohoStore ?? null,
    storeName: store?.mailing_name ?? store?.company_name ?? null,
  };
}

export const publicScope = (scope) => ({ all: scope.all, storeName: scope.storeName, mapped: scope.all || scope.ownerIds.length > 0 });
