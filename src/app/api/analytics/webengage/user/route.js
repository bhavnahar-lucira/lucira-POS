import { getSessionFromRequest } from '@/lib/ornaverse/session';
import { upsertWebEngageUser } from '@/lib/analytics/webengageServer';
import { checkRateLimit } from '@/lib/security/rateLimit';

// SECURITY (2026-10-19): no limit on how many distinct userIds one session
// could overwrite a WebEngage profile (name/phone/email) for — companion fix
// to the sibling events route; see that file's comment for the full
// rationale. This one has no fixed-value allowlist to check against (unlike
// eventName), so rate limiting is the mitigation here.
const RATE_LIMIT = { limit: 120, windowMs: 60 * 1000 };

export async function POST(request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return Response.json({ ok: false, error: 'not_authenticated' }, { status: 401 });
  }

  const limit = checkRateLimit(`webengage-user:${session.cookie}`, RATE_LIMIT);
  if (!limit.allowed) {
    return Response.json(
      { ok: false, error: 'too_many_requests' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
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
