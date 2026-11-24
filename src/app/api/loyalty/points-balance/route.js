// A customer's Lucira points via OrnaVerse's LoyaltyCheckout/Preview, server-side. OrnaVerse answers "no coins"
// and "no loyalty account" with HTTP 400; here those become a normal 0-points reply, so pages that look up many
// customers at once (dashboard, Buyers) don't fill the browser console with failed requests. Checkout calls
// Preview directly and is unaffected.
import { getSessionFromRequest } from '@/lib/ornaverse/session';
import { UPSTREAM } from '@/lib/ornaverse/upstream';
import API from '@/constants/apiEndpoints';

export const dynamic = 'force-dynamic';

const NO_POINTS = /insufficient balance|lead does not exist/i;

export async function POST(request) {
  const session = await getSessionFromRequest(request);
  if (!session) return Response.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body?.company_id || !body?.party_id || !body?.mobile) {
    return Response.json({ Entity: { success: false, coin_value: 0, error: 'Missing required fields.' } });
  }

  const headers = { 'Content-Type': 'application/json', Cookie: session.cookie };
  if (session.csrf) headers['X-CSRF-TOKEN'] = session.csrf;

  let res;
  try {
    res = await fetch(`${UPSTREAM}/${API.CRM.LOYALTY_CHECKOUT_PREVIEW}`, {
      method: 'POST', headers, body: JSON.stringify(body), cache: 'no-store', signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return Response.json({ error: 'Loyalty service unreachable' }, { status: 502 });
  }

  const json = await res.json().catch(() => null);
  if (res.ok) return Response.json({ Entity: json?.Entity ?? { success: false, coin_value: 0 } });

  const message = json?.Error?.Message ?? json?.error ?? null;
  if (res.status === 400 && message && NO_POINTS.test(message)) {
    return Response.json({ Entity: { success: false, coin_value: 0, error: message } });
  }
  return Response.json({ error: message || `Loyalty lookup failed (${res.status})` }, { status: res.status });
}
