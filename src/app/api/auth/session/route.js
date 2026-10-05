import {
  createOrnaverseSession,
  buildSessionCookieHeaders,
  buildClearSessionCookieHeaders,
} from '@/lib/ornaverse/session';
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
export async function DELETE() {
  const response = Response.json({ ok: true });
  for (const header of buildClearSessionCookieHeaders()) {
    response.headers.append('Set-Cookie', header);
  }
  return response;
}
