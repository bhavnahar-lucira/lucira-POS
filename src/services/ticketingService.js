// CAD request tickets — served by our own /api/ticketing routes (website DB + POS file store).

async function request(path, options) {
  const res = await fetch(path, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed: HTTP ${res.status}`);
  return data;
}

const withParty = (path, partyId) => (partyId ? `${path}?partyId=${partyId}` : path);

export async function listTickets({ partyId } = {}) {
  return (await request(withParty('/api/ticketing', partyId))).tickets ?? [];
}

export async function getTicket(ticketNumber, { partyId } = {}) {
  return (await request(withParty(`/api/ticketing/${encodeURIComponent(ticketNumber)}`, partyId))).ticket;
}

export async function createTicket(payload) {
  return (await request('/api/ticketing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })).ticket;
}

export async function runTicketAction(ticketNumber, payload, { partyId } = {}) {
  return (await request(withParty(`/api/ticketing/${encodeURIComponent(ticketNumber)}`, partyId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })).ticket;
}

export async function getTicketNotifications() {
  return request('/api/ticketing/notifications');
}

/** @returns {Promise<{ id: string, url: string, file_name: string, type: string }>} */
export async function uploadTicketFile(file) {
  const form = new FormData();
  form.append('file', file);
  return request('/api/ticketing/files', { method: 'POST', body: form });
}
