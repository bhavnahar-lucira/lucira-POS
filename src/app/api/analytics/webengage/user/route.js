// src/app/api/analytics/webengage/user/route.js
//
// Server-side relay for WebEngage user-profile upserts (2026-09-28) — the
// replacement for the client SDK's user.login()/setAttribute() calls, which
// console-errored on every page load (this tenant's domain isn't registered
// for the WebEngage Web SDK — see webengageServer.js's header). Same
// same-origin-relay shape as the sibling events route.
//
// Requires an authenticated operator session — same reasoning as the events
// route (see its own header).

import { getSessionFromRequest } from '@/lib/ornaverse/session';
import { upsertWebEngageUser } from '@/lib/analytics/webengageServer';

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

  const { userId, anonymousId } = payload ?? {};
  if (!userId && !anonymousId) {
    return Response.json({ ok: false, error: 'identity_required' }, { status: 400 });
  }

  const result = await upsertWebEngageUser(payload);
  return Response.json(result, { status: result.ok ? 200 : 502 });
}
