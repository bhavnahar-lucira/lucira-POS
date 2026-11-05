// Voice of Lucira — served by our own /api/voc routes (POS DB).

async function request(path, options) {
  const res = await fetch(path, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed: HTTP ${res.status}`);
  return data;
}

const jsonBody = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

/** Query string for the list/export filters: { from, to, storeId, jcId, purchased }. Empty values are left out. */
export function vocQuery(filters = {}, extra = {}) {
  const params = Object.entries({ ...filters, ...extra }).filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== 'all');
  return new URLSearchParams(params.map(([k, v]) => [k, String(v)])).toString();
}

export function listVoc(filters, { skip = 0, limit = 50, mobiles = false } = {}) {
  return request(`/api/voc?${vocQuery(filters, { skip, limit, mobiles: mobiles ? 1 : undefined })}`);
}

export async function getVoc(id) {
  return (await request(`/api/voc/${encodeURIComponent(id)}`)).response;
}

export async function createVoc(payload) {
  return (await request('/api/voc', jsonBody('POST', payload))).response;
}

export async function updateVoc(id, payload) {
  return (await request(`/api/voc/${encodeURIComponent(id)}`, jsonBody('PATCH', payload))).response;
}

export function deleteVoc(id) {
  return request(`/api/voc/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/** @returns {Promise<{ alreadyGiven: boolean, purchased: 'yes'|'no'|null }>} */
export function getVocToday(partyId) {
  return request(`/api/voc/today?partyId=${encodeURIComponent(partyId)}`);
}

export function listVocReferrals(filters) {
  return request(`/api/voc/referrals?${vocQuery(filters)}`);
}

export function listVocSkips(filters) {
  return request(`/api/voc/skips?${vocQuery(filters)}`);
}

/** @param {{ customer: { party_id, name, mobile }, stage: 'prompt'|'form' }} payload */
export function recordVocSkip(payload) {
  return request('/api/voc/skips', jsonBody('POST', payload));
}

export const vocExportUrl =(filters) => `/api/voc/export?${vocQuery(filters)}`;
