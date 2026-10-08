import { UPSTREAM } from '@/lib/ornaverse/upstream';
import {
  getSessionFromRequest, renewSessionFromUpstream, buildSessionCookieHeaders,
  buildClearSessionCookieHeaders, isSessionIdleExpired, touchSessionActivity,
} from '@/lib/ornaverse/session';
import { getCachedRead, setCachedRead, isCacheableReadPath } from '@/lib/security/proxyReadCache';
import { checkRateLimit } from '@/lib/security/rateLimit';
import APP_CONFIG from '@/constants/appConfig';

const PUBLIC_PATH_PREFIXES = ['upload/'];
const ADMIN_ONLY_PATHS = ['Services/POS/Customer/Update'];

// Security audit finding (Medium, 2026-10-05): this proxy forwarded ANY
// request body of ANY size/type to OrnaVerse with zero validation,
// unconditionally buffering the whole thing into memory first
// (request.arrayBuffer()) before ever looking at it — an unauthenticated
// Content-Length lie or a genuinely huge body could exhaust server memory
// on this single instance. `File/TemporaryUpload` (the one generic
// file-upload endpoint every photo/document field in this app funnels
// through — see fileUploadService.js) gets a larger cap sized for real
// phone photos; everything else is ordinary small JSON (this app never
// embeds raw file bytes/base64 into a JSON payload — confirmed by the
// upload service's own two-step contract) so it gets a much tighter one.
const UPLOAD_PATH = 'File/TemporaryUpload';
const MAX_UPLOAD_BYTES  = 15 * 1024 * 1024; // 15MB — generous for a phone photo
const MAX_REQUEST_BYTES =  5 * 1024 * 1024; //  5MB — no JSON call here is remotely this large

// Security audit finding (Medium, 2026-10-05): rate limiting only ever
// covered the login endpoint — this proxy, which every single Services/*
// call in the app goes through, had no limit at all, so a compromised
// session or a runaway/scripted client loop could hammer real OrnaVerse
// upstream without bound. Keyed by the session's own cookie (not IP): a
// real login is required to get a key at all, which sidesteps the
// x-forwarded-for spoofing concern that applies to the pre-login rate
// limiter in auth/session/route.js. Sized generously — real page loads in
// this app routinely fire a burst of a few dozen calls — so this only ever
// catches genuine runaway abuse, not normal usage.
const PROXY_RATE_LIMIT = { limit: 600, windowMs: 60 * 1000 };

function tooLarge(limitBytes) {
  return new Response(
    JSON.stringify({ error: 'payload_too_large', error_description: `Request body exceeds the ${Math.round(limitBytes / 1024 / 1024)}MB limit.` }),
    { status: 413, headers: { 'Content-Type': 'application/json' } },
  );
}

async function proxy(request, { params }) {
  const { path } = await params;
  const resolvedPath = path.join('/');
  const targetUrl = `${UPSTREAM}/${resolvedPath}${request.nextUrl.search}`;
  const isPublicPath = PUBLIC_PATH_PREFIXES.some((prefix) => resolvedPath.startsWith(prefix));

  const headers = new Headers();
  const contentType = request.headers.get('content-type');
  if (contentType) headers.set('Content-Type', contentType);

  let session = null;
  if (!isPublicPath) {
    session = await getSessionFromRequest(request);
    if (!session) {
      return new Response(
        JSON.stringify({ error: 'not_authenticated', error_description: 'Sign in again.' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      );
    }
    // Server-side backstop for the staff idle timer (SessionProvider's own
    // timer is pure client-side JS and never ran if the tab was closed, the
    // device slept, or JS was disabled) — see isSessionIdleExpired's own
    // comment for the full reasoning.
    if (isSessionIdleExpired(session, APP_CONFIG.SESSION.STAFF_IDLE_TIMEOUT_MS)) {
      const res = new Response(
        JSON.stringify({ error: 'session_idle_timeout', error_description: 'Signed out due to inactivity. Sign in again.' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      );
      for (const header of buildClearSessionCookieHeaders()) res.headers.append('Set-Cookie', header);
      return res;
    }
    if (ADMIN_ONLY_PATHS.includes(resolvedPath) && !session.isSuperAdmin) {
      return new Response(
        JSON.stringify({ error: 'admin_only', error_description: 'Only an admin can edit customer details.' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } },
      );
    }
    const proxyLimit = checkRateLimit(`proxy:${session.cookie}`, PROXY_RATE_LIMIT);
    if (!proxyLimit.allowed) {
      return new Response(
        JSON.stringify({ error: 'too_many_requests', error_description: 'Too many requests. Please slow down.' }),
        { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': String(proxyLimit.retryAfterSeconds) } },
      );
    }

    headers.set('Cookie', session.cookie);
    if (session.csrf) headers.set('X-CSRF-TOKEN', session.csrf);
  }
  
  const hasBody = !['GET', 'HEAD'].includes(request.method);
  const isUploadPath = resolvedPath === UPLOAD_PATH;
  const maxBytes = isUploadPath ? MAX_UPLOAD_BYTES : MAX_REQUEST_BYTES;

  if (hasBody) {
    const declaredLength = Number(request.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      return tooLarge(maxBytes);
    }
    if (isUploadPath && !contentType?.startsWith('multipart/form-data')) {
      return new Response(
        JSON.stringify({ error: 'unsupported_content_type', error_description: 'File uploads must be multipart/form-data.' }),
        { status: 415, headers: { 'Content-Type': 'application/json' } },
      );
    }
  }

  const body = hasBody ? await request.arrayBuffer() : undefined;
  // Content-Length can be absent or understated (chunked transfer, a
  // spoofed header) — this is the real backstop, checked against what was
  // actually buffered.
  if (body && body.byteLength > maxBytes) return tooLarge(maxBytes);

  const cacheKey = isCacheableReadPath(resolvedPath)
    ? `${resolvedPath}::${body ? Buffer.from(body).toString('utf-8') : ''}`
    : null;
  if (cacheKey) {
    const cached = getCachedRead(cacheKey);
    if (cached) {
      return new Response(cached.bytes, {
        status: cached.status,
        headers: { 'Content-Type': cached.contentType },
      });
    }
  }

  let upstreamRes;
  try {
    upstreamRes = await fetch(targetUrl, {
      method: request.method,
      headers,
      body,
      cache: 'no-store',
    });
  } catch (err) {
    console.error('[api proxy] upstream fetch failed', targetUrl, err);
    return new Response(
      JSON.stringify({
        error: 'upstream_unreachable',
        error_description: 'Could not reach the OrnaVerse server. Please check your connection and try again.',
      }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const responseContentType = upstreamRes.headers.get('content-type') ?? 'application/json';
  const touched = session ? touchSessionActivity(session) : null;
  const renewed = session ? renewSessionFromUpstream(touched ?? session, upstreamRes) : null;
  const finalSession = renewed ?? touched;
  const setCookieHeaders = finalSession ? buildSessionCookieHeaders(finalSession) : [];

  if (cacheKey && upstreamRes.ok) {
    const bytes = await upstreamRes.arrayBuffer();
    setCachedRead(cacheKey, { bytes, status: upstreamRes.status, contentType: responseContentType });
    const res = new Response(bytes, { status: upstreamRes.status, headers: { 'Content-Type': responseContentType } });
    for (const header of setCookieHeaders) res.headers.append('Set-Cookie', header);
    return res;
  }
  const res = new Response(upstreamRes.body, {
    status: upstreamRes.status,
    headers: { 'Content-Type': responseContentType },
  });
  for (const header of setCookieHeaders) res.headers.append('Set-Cookie', header);
  return res;
}

export {
  proxy as GET,
  proxy as POST,
  proxy as PUT,
  proxy as DELETE,
  proxy as PATCH,
};
