import { UPSTREAM } from '@/lib/ornaverse/upstream';
import {
  getSessionFromRequest, renewSessionFromUpstream, buildSessionCookieHeaders,
  buildClearSessionCookieHeaders, isSessionIdleExpired, touchSessionActivity,
} from '@/lib/ornaverse/session';
import { getCachedRead, setCachedRead, isCacheableReadPath } from '@/lib/security/proxyReadCache';
import { checkRateLimit } from '@/lib/security/rateLimit';
import { touchSession, endSession } from '@/lib/mongo/posSessions';
import { getAuthorizedCompanyIds } from '@/lib/ornaverse/authorizedStores';
import APP_CONFIG from '@/constants/appConfig';
import { after } from 'next/server';

// Session tracking — after the response, failures swallowed, never in the
// request's own path (same contract as api/auth/session/route.js).
function trackInBackground(label, work) {
  after(() => work().catch((err) => console.error(`[posSessions] ${label}`, err?.message ?? err)));
}

const PUBLIC_PATH_PREFIXES = ['upload/'];

// OrnaVerse doesn't scope these to the operator's stores (confirmed live 2026-10-27:
// a store login got other stores' stock + cost), so they're only served via /api/reports/*.
const BLOCKED_REPORT_PATHS = new Set([
  'services/reports/stockreport/list',
  'services/reports/posdashbaord/list',
  'services/reports/categorywisesalesreport/list',
  'services/pos/salespersonwisesales/list',
  'services/analytics/skuvelocity',
  'services/reports/openposordersreport/list',
]);

// The store the operator is logged into, kept in the signed session so report
// routes can pin non-super-admins to it without trusting the client.
const SWITCH_COMPANY_PATH = 'account/switchcompany';

async function resolveSwitchedCompanyId(session, body) {
  try {
    const companyId = Number(JSON.parse(Buffer.from(body).toString('utf-8')).company_id);
    const authorized = await getAuthorizedCompanyIds(session);
    return authorized.has(companyId) ? companyId : null;
  } catch (err) {
    console.error('[api proxy] could not record switched company', err);
    return null;
  }
}

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

// A burst of concurrent calls to OrnaVerse (a full-catalog sweep, several
// parallel attribute-list lookups, etc. — all routine on a single page
// load) occasionally trips a connect-level stall confirmed live 2026-10-14:
// undici's ConnectTimeoutError (UND_ERR_CONNECT_TIMEOUT) — the TCP/TLS
// handshake itself never completes, as opposed to OrnaVerse responding
// slowly or with a real error. One retry is always safe here specifically
// BECAUSE the connection never completed: the request body was never
// transmitted, so OrnaVerse never saw it — no risk of double-processing a
// Create/Post call, unlike retrying after a response timeout would be.
const CONNECT_RETRY_DELAY_MS = 500;

// Performance/availability finding (2026-10-19): this fetch had NO bound at
// all — a hung or merely very slow OrnaVerse response held the serverless
// function open for its full platform timeout instead of failing fast, tying
// up a function instance (and, client-side, leaving the caller's own request
// hanging) for no good reason. `File/TemporaryUpload` gets a longer allowance
// since a real phone photo over a slow store Wi-Fi genuinely can take a
// while; every other call here is a small JSON RPC that should resolve in
// a few seconds normally. Each retry attempt below gets its own fresh
// timeout window — same per-attempt framing CONNECT_RETRY_DELAY_MS already
// uses, so a flaky connect doesn't eat into the following attempt's budget.
const REQUEST_TIMEOUT_MS = 25_000;
const UPLOAD_TIMEOUT_MS  = 60_000;

async function fetchWithConnectRetry(url, options, timeoutMs) {
  const withTimeout = { ...options, signal: AbortSignal.timeout(timeoutMs) };
  try {
    return await fetch(url, withTimeout);
  } catch (err) {
    if (err.cause?.code !== 'UND_ERR_CONNECT_TIMEOUT') throw err;
    await new Promise((resolve) => setTimeout(resolve, CONNECT_RETRY_DELAY_MS));
    return fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
  }
}

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

  if (BLOCKED_REPORT_PATHS.has(resolvedPath.toLowerCase().replace(/\/+$/, ''))) {
    return new Response(
      JSON.stringify({ error: 'forbidden', error_description: 'Use the Reports page for this report.' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } },
    );
  }

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
      if (session.sid) {
        // It really ended timeout-after-last-activity, not now.
        trackInBackground('idle expiry', () => endSession(session.sid, {
          reason: 'idle_timeout',
          endedAt: session.lastActivityAt + APP_CONFIG.SESSION.STAFF_IDLE_TIMEOUT_MS,
        }));
      }
      const res = new Response(
        JSON.stringify({ error: 'session_idle_timeout', error_description: 'Signed out due to inactivity. Sign in again.' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      );
      for (const header of buildClearSessionCookieHeaders()) res.headers.append('Set-Cookie', header);
      return res;
    }
    // Admin-only gate on Customer/Update REMOVED (2026-10-12, confirmed live
    // on OrnaVerse UAT's own native client, logged in as a regular non-admin
    // store operator): editing a customer — including PAN number and
    // PAN/Other Document upload — works there with no permission error for
    // a non-admin. The old gate here (2026-09-28) didn't match OrnaVerse's
    // own real authorization model; it blocked a routine, compliance-
    // mandatory billing action (PAN is legally required above a sale
    // threshold) that OrnaVerse itself lets any authorized operator do.
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
    upstreamRes = await fetchWithConnectRetry(targetUrl, {
      method: request.method,
      headers,
      body,
      cache: 'no-store',
    }, isUploadPath ? UPLOAD_TIMEOUT_MS : REQUEST_TIMEOUT_MS);
  } catch (err) {
    const isTimeout = err.name === 'TimeoutError' || err.name === 'AbortError';
    console.error('[api proxy] upstream fetch failed', targetUrl, isTimeout ? 'timeout' : err);
    return new Response(
      JSON.stringify(isTimeout
        ? {
            error: 'upstream_timeout',
            error_description: 'The OrnaVerse server took too long to respond. Please try again.',
          }
        : {
            error: 'upstream_unreachable',
            error_description: 'Could not reach the OrnaVerse server. Please check your connection and try again.',
          }),
      { status: isTimeout ? 504 : 502, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const responseContentType = upstreamRes.headers.get('content-type') ?? 'application/json';
  const touched = session ? touchSessionActivity(session) : null;
  // Same once-a-minute throttle as the cookie: only when it actually moved.
  if (touched?.sid) trackInBackground('touch', () => touchSession(touched.sid, touched.lastActivityAt));
  const renewed = session ? renewSessionFromUpstream(touched ?? session, upstreamRes) : null;
  let finalSession = renewed ?? touched;
  if (session && upstreamRes.ok && resolvedPath.toLowerCase() === SWITCH_COMPANY_PATH) {
    finalSession = { ...(finalSession ?? session), companyId: await resolveSwitchedCompanyId(session, body) };
  }
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
