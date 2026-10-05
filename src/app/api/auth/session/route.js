import {
  createOrnaverseSession,
  buildSessionCookieHeaders,
  buildClearSessionCookieHeaders,
  getSessionFromRequest,
} from '@/lib/ornaverse/session';
import { UPSTREAM } from '@/lib/ornaverse/upstream';
import { checkRateLimit, getClientIp } from '@/lib/security/rateLimit';

export async function POST(request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { username, password } = payload ?? {};

  const ip = getClientIp(request);
  const normalizedUsername = String(username ?? '').trim().toLowerCase();
  const perAccount = checkRateLimit(`login:${ip}:${normalizedUsername}`, { limit: 5, windowMs: 5 * 60 * 1000 });
  const perIp = checkRateLimit(`login-ip:${ip}`, { limit: 20, windowMs: 5 * 60 * 1000 });

  if (!perAccount.allowed || !perIp.allowed) {
    const retryAfterSeconds = Math.max(perAccount.retryAfterSeconds, perIp.retryAfterSeconds);
    return Response.json(
      { error: 'too_many_attempts', error_description: 'Too many login attempts. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
    );
  }

  try {
    const session = await createOrnaverseSession({ username, password });
    const response = Response.json({ ok: true, username: session.username, isSuperAdmin: session.isSuperAdmin });
    for (const header of buildSessionCookieHeaders(session)) {
      response.headers.append('Set-Cookie', header);
    }
    return response;
  } catch (err) {
    console.error('[auth/session]', err?.code ?? 'ERROR', err?.message);
    const status = err?.code === 'BAD_REQUEST' ? 400 : 401;
    return Response.json({ ok: false, code: err?.code ?? 'LOGIN_FAILED' }, { status });
  }
}
// Reported directly (2026-10-05): logout only ever cleared OUR OWN cookies,
// never followed OrnaVerse's own sign-out — unlike OrnaVerse's real client,
// which calls its own ~/Account/Signout (confirmed live via its IdleTimeout
// widget defaults: signoutUrl: "~/Account/Signout"). Calling it here for
// parity with that behavior. NOTE — this does NOT close the "stolen cookie
// still works" security gap: calling this endpoint with a replayed cookie
// was confirmed live to NOT revoke it server-side (standard ASP.NET Cookie
// Authentication has no server-side ticket store to invalidate unless
// specifically configured) — that's a separate, still-open finding from the
// security audit. This is best-effort and must never block our own logout:
// OrnaVerse being unreachable, or this call failing for any reason, still
// has to clear our cookies and sign the operator out locally.
export async function DELETE(request) {
  const session = await getSessionFromRequest(request);
  if (session?.cookie) {
    try {
      await fetch(`${UPSTREAM}/Account/Signout`, {
        method:   'POST',
        headers:  {
          Cookie: session.cookie,
          ...(session.csrf ? { 'X-CSRF-TOKEN': session.csrf } : {}),
        },
        cache:    'no-store',
        redirect: 'manual',
      });
    } catch {
      // best-effort — see note above
    }
  }

  const response = Response.json({ ok: true });
  for (const header of buildClearSessionCookieHeaders()) {
    response.headers.append('Set-Cookie', header);
  }
  return response;
}
