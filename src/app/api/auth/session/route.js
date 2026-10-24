import {
  createOrnaverseSession,
  buildSessionCookieHeaders,
  buildClearSessionCookieHeaders,
  getSessionFromRequest,
  isSessionIdleExpired,
} from '@/lib/ornaverse/session';
import { UPSTREAM } from '@/lib/ornaverse/upstream';
import { checkRateLimit, getClientIp } from '@/lib/security/rateLimit';
import { getUserStores } from '@/lib/ornaverse/authorizedStores';
import { recordLogin, recordLoginFailed, endSession, END_REASONS } from '@/lib/mongo/posSessions';
import APP_CONFIG from '@/constants/appConfig';
import { randomUUID } from 'crypto';
import { after } from 'next/server';

const IDLE_TIMEOUT_MS = APP_CONFIG.SESSION.STAFF_IDLE_TIMEOUT_MS;

// Session tracking (lib/mongo/posSessions.js) runs after the response is
// sent and swallows its own failures — it must never block or break auth.
function trackInBackground(label, work) {
  after(() => work().catch((err) => console.error(`[posSessions] ${label}`, err?.message ?? err)));
}

// An idle-expired session really ended IDLE_TIMEOUT_MS after its last
// activity, not whenever we happened to notice — record that time.
function trackIdleExpiry(session) {
  if (!session?.sid) return;
  trackInBackground('idle expiry', () => endSession(session.sid, {
    reason: 'idle_timeout',
    endedAt: session.lastActivityAt + IDLE_TIMEOUT_MS,
  }));
}

// Lets the client reconcile its own (persisted, can go stale — e.g. idle
// timeout, cookie cleared, a cross-tab logout) `isAuthenticated` cache
// against the one real source of truth: this cookie. Mirrors OrnaVerse's own
// server-authoritative model instead of trusting a client-side flag that can
// outlive the real session — see RehydrationGuard, the only caller.
export async function GET(request) {
  const session = await getSessionFromRequest(request);
  if (!session) return Response.json({ ok: false }, { status: 401 });
  if (isSessionIdleExpired(session, IDLE_TIMEOUT_MS)) {
    trackIdleExpiry(session);
    return Response.json({ ok: false }, { status: 401 });
  }
  return Response.json({ ok: true, username: session.username, isSuperAdmin: !!session.isSuperAdmin });
}

export async function POST(request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { username, password } = payload ?? {};

  const ip = getClientIp(request);
  const userAgent = request.headers.get('user-agent');
  const normalizedUsername = String(username ?? '').trim().toLowerCase();
  const perAccount = checkRateLimit(`login:${ip}:${normalizedUsername}`, { limit: 5, windowMs: 5 * 60 * 1000 });
  const perIp = checkRateLimit(`login-ip:${ip}`, { limit: 20, windowMs: 5 * 60 * 1000 });

  if (!perAccount.allowed || !perIp.allowed) {
    trackInBackground('rate-limited login', () => recordLoginFailed({ username: normalizedUsername, code: 'too_many_attempts', ip, userAgent }));
    const retryAfterSeconds = Math.max(perAccount.retryAfterSeconds, perIp.retryAfterSeconds);
    return Response.json(
      { error: 'too_many_attempts', error_description: 'Too many login attempts. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
    );
  }

  try {
    const loginAt = Date.now();
    const session = { ...(await createOrnaverseSession({ username, password })), sid: randomUUID(), loginAt };
    trackInBackground('login', async () => {
      // Which store this login belongs to, per OrnaVerse itself. A lookup
      // failure still records the login, just without the store.
      const stores = await getUserStores(session).catch(() => null);
      await recordLogin({
        sid: session.sid, username: session.username, isSuperAdmin: session.isSuperAdmin,
        loginAt, idleTimeoutMs: IDLE_TIMEOUT_MS, ip, userAgent, stores,
      });
    });
    const response = Response.json({ ok: true, username: session.username, isSuperAdmin: session.isSuperAdmin });
    for (const header of buildSessionCookieHeaders(session)) {
      response.headers.append('Set-Cookie', header);
    }
    return response;
  } catch (err) {
    console.error('[auth/session]', err?.code ?? 'ERROR', err?.message);
    trackInBackground('failed login', () => recordLoginFailed({ username: normalizedUsername, code: err?.code ?? 'LOGIN_FAILED', ip, userAgent }));
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
  if (session?.sid) {
    // Label only (manual vs the client's own idle timer) — validated, and
    // endSession never overwrites a session the server already closed.
    const requested = new URL(request.url).searchParams.get('reason');
    const reason = END_REASONS.includes(requested) ? requested : 'manual';
    trackInBackground('logout', () => endSession(session.sid, { reason, endedAt: Date.now() }));
  }
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
