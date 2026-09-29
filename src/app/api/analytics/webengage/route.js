// src/app/api/analytics/webengage/route.js
//
// Server-side relay every tracker.track()/trackAgent() call POSTs to (via
// webengageBridge.js) instead of the old client-side WebEngage Web SDK —
// this is what actually calls WebEngage's REST API (webengageServer.js),
// which holds the real API key server-only. See that file's own header for
// the full "why" of this migration.
//
// Requires an authenticated operator session — same as every other internal
// route in this app — so an anonymous caller who finds this URL can't spend
// this app's WebEngage event quota. Every real tracked action already
// happens during an authenticated session (including AGENT_LOGIN, which
// fires only after the login POST that sets this same session cookie has
// already resolved), so this is not a real restriction on anything that
// legitimately needs tracking.
//
// Best-effort throughout: never throws, always 2xx/4xx/5xx JSON, since a
// broken analytics relay must never surface as an app error to the caller
// (webengageBridge.js's fetch().catch() already treats any response short
// of network failure as "handled").

import { getSessionFromRequest } from '@/lib/ornaverse/session';
import { sendServerEventToWebEngage } from '@/lib/analytics/webengageServer';

export async function POST(request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return Response.json({ ok: false, error: 'not_authenticated' }, { status: 401 });
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const { eventName, properties, userId, anonymousId } = payload ?? {};
  if (!eventName) {
    return Response.json({ ok: false, error: 'eventName_required' }, { status: 400 });
  }

  const result = await sendServerEventToWebEngage({ userId, anonymousId, eventName, properties });
  return Response.json(result, { status: result.ok ? 200 : 502 });
}
