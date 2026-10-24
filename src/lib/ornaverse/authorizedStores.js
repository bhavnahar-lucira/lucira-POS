// SERVER-ONLY. Which companies the CURRENT operator's real OrnaVerse account
// is actually allowed to see — the signed session itself carries no store
// information (see session.js), yet the Buyers module's routes take
// company_id directly from the client. Without this check, any authenticated
// operator could read or trigger a sync for a different store's buyer data
// just by changing a query/path param. isSuperAdmin sessions skip this
// entirely and may act on any company, same as elsewhere in the app.

import { UPSTREAM } from './upstream';
import API from '@/constants/apiEndpoints';

/**
 * The stores OrnaVerse says this session may access, as returned —
 * { company_id, company_name, store_code, ... }[]. Also used by login
 * session tracking (lib/mongo/posSessions.js) to record which store a
 * login belongs to without trusting the client's own store selection.
 */
export async function getUserStores(session) {
  const headers = { 'Content-Type': 'application/json', Cookie: session.cookie };
  if (session.csrf) headers['X-CSRF-TOKEN'] = session.csrf;

  const res = await fetch(`${UPSTREAM}/${API.STORES.GET_USER_STORES}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`GetUserStores failed: HTTP ${res.status}`);

  const data = await res.json();
  return Array.isArray(data) ? data : data?.Entities ?? data?.data ?? data?.result ?? [];
}

export async function getAuthorizedCompanyIds(session) {
  const stores = await getUserStores(session);
  return new Set(stores.map((s) => s.company_id));
}
