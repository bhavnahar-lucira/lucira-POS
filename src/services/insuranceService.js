// Client-side service for Olocker jewellery insurance.
//
// Unlike the rest of this folder these calls do NOT go through
// axiosInstance/the Services proxy — Olocker is a third-party insurer, not
// OrnaVerse, and its access/secret pair stays on the server. Same shape as
// nectorService's proxy calls: plain fetch against our own /api route.

const BASE = '/api/insurance';

async function readError(res, fallback) {
  const payload = await res.json().catch(() => null);
  const error = new Error(payload?.error || fallback);
  error.status = res.status;
  error.code = payload?.code ?? null;
  error.payload = payload;
  throw error;
}

/**
 * Policies already issued against one invoice.
 * @param {number} transactionId
 * @returns {Promise<{ items: object[], unattributed: boolean }>}
 */
export async function getInsurancePolicies(transactionId) {
  if (!transactionId) return { items: [], unattributed: false };
  const res = await fetch(`${BASE}?transactionId=${encodeURIComponent(transactionId)}`, {
    cache: 'no-store',
  });
  if (!res.ok) await readError(res, 'Failed to load insurance policies.');
  const json = await res.json();
  return { items: json?.items ?? [], unattributed: json?.unattributed === true };
}

/**
 * Issues policies for the opted-in lines of one invoice.
 * @param {{ transactionId: number, itemKeys?: string[] }} params
 * @returns {Promise<{ items: object[], issuedCount: number, unattributed: boolean, skipped: object[], failures: string[] }>}
 */
export async function generateInsurance({ transactionId, itemKeys }) {
  const res = await fetch(BASE, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ transactionId, itemKeys }),
  });
  if (!res.ok) await readError(res, 'Failed to generate insurance.');
  return res.json();
}
