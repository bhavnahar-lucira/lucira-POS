// src/lib/ornaverse/session.js
// SERVER-ONLY. The app's one and only source of operator identity.
//
// ── WHY THIS REPLACED THE OAUTH BEARER-TOKEN FLOW ──────────────────────────
//
// This app used to authenticate every Services/* call with an OAuth bearer
// token (connect/token). That worked cleanly on UAT (a public client, real
// `password` grant) but not on LIVE (a confidential client, `client_credentials`
// only) — LIVE's token was always issued for ONE FIXED SERVICE IDENTITY,
// never the operator who actually signed in, no matter what they typed.
// Several OrnaVerse endpoints are deliberately scoped to "the authenticated
// identity's own home company/permissions"
// (Administration/Stores/GetUserCompanies, Order/List, Invoice/List, the
// InterstoreReturn workflow actions) — correct behaviour on OrnaVerse's
// side, but it broke for us on LIVE specifically because our identity
// there was never a real person: a single-store login always landed on
// "please select a store", a real order could go missing from our own
// Orders tab, and the InterstoreReturn approval workflow was unreachable
// for any real store operator.
//
// OrnaVerse's OWN client never hits any of this, because it never uses
// OAuth for its own users at all — it signs in via a real, per-operator
// ASP.NET cookie session (~/Account/Login), the exact same one this file
// already established for report printing alone. Confirmed live
// (2026-09-15) that this cookie session:
//   - logs in correctly with real credentials on BOTH UAT and LIVE
//   - authorizes arbitrary Services/* POST calls with no bearer token,
//     given the cookie + a required X-CSRF-TOKEN header
//   - resolves the REAL, correctly-scoped identity (GetUserCompanies
//     returned the real restricted company list for a single-store login,
//     identically on both environments)
//   - enforces the same permission model either way (a denied action was
//     denied identically under cookie vs bearer auth)
//
// So this is now the ONLY authentication this app performs. There is no
// OAuth client, no access/refresh token, nothing token-shaped in Redux or
// localStorage — just this httpOnly session cookie (or several, see
// CHUNKING below) on our own origin.
//
// ── NO DATABASE DEPENDENCY (2026-09-26) ─────────────────────────────────────
//
// This used to map an opaque id to the real OrnaVerse cookie jar via
// ornaverseSessions.js (Mongo-backed, so it'd survive across separate
// serverless invocations). Reported directly: a Mongo/DNS hiccup then took
// down LOGIN ITSELF — even though login only ever needs to talk to
// OrnaVerse, a transient failure persisting the result to an unrelated
// database surfaced as "wrong username or password". Login has no business
// depending on our own DB at all.
//
// Fix: skip the DB entirely — the real OrnaVerse cookie jar + CSRF token is
// stored DIRECTLY in this app's own httpOnly cookie(s), encoded as JSON.
// Every request already carries our cookies for free; a proxied call just
// reads the jar straight off the incoming request instead of looking it up
// anywhere. Zero DB dependency for authentication, ever, at any point.
//
// CHUNKING: a browser caps a single cookie at ~4KB. ASP.NET Core's own
// cookie-auth middleware anticipates exactly this — it automatically splits
// an oversized auth cookie into several numbered cookies. This mirrors that:
// the encoded payload is split across pos_orna_session_0, _1, _2, ... (see
// CHUNK_SIZE/MAX_CHUNKS below), so no single cookie risks the browser limit
// regardless of how large OrnaVerse's own cookie jar turns out to be.
//
// No signing/encryption layer: OrnaVerse itself is the sole authority that
// validates this cookie's authenticity on every upstream call (exactly as
// it already did when the jar lived in Mongo — we never re-validated it
// ourselves either way) — a tampered cookie just fails upstream, the same
// outcome tampering with the old opaque Mongo-lookup id would have had.
//
// ── WHY NO STORED PASSWORD ─────────────────────────────────────────────────
//
// The operator's own credentials pass through this server on their way to
// this login dance and are spent once, then discarded:
//   • nothing to store, rotate, or leak — no password on disk or in memory
//   • no shared robot account to create and maintain
//   • every action is attributed to the real operator, so OrnaVerse's own
//     audit trail is honest about who did what
//
// The login contract is taken from OrnaVerse's own LoginPage.js:
//     POST ~/Account/Login   (JSON)   { username, password }
//
// ── CONSEQUENCES, STATED PLAINLY ───────────────────────────────────────────
//
// • The account must have 2FA disabled: a non-interactive login cannot
//   answer the prompt OrnaVerse's own LoginPage handles interactively.
// • We cannot silently re-login when the cookie expires, because we never
//   kept the password — a rejected session surfaces "sign in again"
//   instead of failing obscurely, the same trade-off this file already
//   made when it only covered printing.

import { UPSTREAM } from '@/lib/ornaverse/upstream';

/** Prefix for the httpOnly cookie(s) carrying the real OrnaVerse session
 *  jar on OUR origin — one cookie per chunk, see CHUNKING above. */
export const SESSION_COOKIE_PREFIX = 'pos_orna_session_';
// Encoded chars per cookie — conservative vs. the ~4096-byte browser limit
// (leaves headroom for the cookie's own name + attributes).
const CHUNK_SIZE = 3000;
// Ceiling against a corrupt/runaway payload (~24,000 encoded chars) — real
// OrnaVerse session jars are a handful of cookies, nowhere near this.
export const MAX_CHUNKS = 8;
const isProd = process.env.NODE_ENV === 'production';

function cookieHeader(name, value, { clear = false } = {}) {
  const attrs = `Path=/; HttpOnly; SameSite=Lax${isProd ? '; Secure' : ''}`;
  return clear ? `${name}=; ${attrs}; Max-Age=0` : `${name}=${value}; ${attrs}`;
}

/**
 * Builds the Set-Cookie header values for a freshly-created session —
 * chunks the encoded {cookie, csrf, username} payload across as many
 * pos_orna_session_N cookies as it takes, and explicitly clears any
 * higher-index chunk a PREVIOUS, larger session might have left behind.
 * @param {{ cookie: string, csrf: string|null, username: string }} session
 * @returns {string[]}
 */
export function buildSessionCookieHeaders(session) {
  const encoded = encodeURIComponent(JSON.stringify(session));
  const chunks = [];
  for (let i = 0; i < encoded.length; i += CHUNK_SIZE) {
    chunks.push(encoded.slice(i, i + CHUNK_SIZE));
  }

  const headers = chunks.map((chunk, i) => cookieHeader(`${SESSION_COOKIE_PREFIX}${i}`, chunk));
  for (let i = chunks.length; i < MAX_CHUNKS; i++) {
    headers.push(cookieHeader(`${SESSION_COOKIE_PREFIX}${i}`, '', { clear: true }));
  }
  return headers;
}

/** Set-Cookie header values that clear every possible session chunk — logout. */
export function buildClearSessionCookieHeaders() {
  const headers = [];
  for (let i = 0; i < MAX_CHUNKS; i++) {
    headers.push(cookieHeader(`${SESSION_COOKIE_PREFIX}${i}`, '', { clear: true }));
  }
  return headers;
}

/**
 * Pulls the cookie pairs we need out of a Set-Cookie header list, keyed by
 * cookie name (so a later response's cookie of the same name can cleanly
 * override an earlier one — see createOrnaverseSession below).
 * Node's fetch exposes them via getSetCookie(); fall back to the raw header
 * for runtimes that don't.
 *
 * @returns {{ pairs: Map<string, string>, csrf: string|null }}
 */
export function parseCookies(response) {
  const raw = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie')].filter(Boolean);

  const pairs = new Map();
  let csrf = null;
  for (const entry of raw) {
    // A Set-Cookie value is "name=value; Path=/; HttpOnly; ..." — only the
    // first segment goes back on the wire. Split on commas that begin a new
    // cookie, not the ones inside Expires dates.
    for (const chunk of String(entry).split(/,(?=[^;=]+?=)/)) {
      const pair = chunk.split(';')[0].trim();
      if (!pair || !pair.includes('=')) continue;
      const [name, ...rest] = pair.split('=');
      pairs.set(name.trim(), pair);
      if (name.trim() === 'CSRF-TOKEN') csrf = rest.join('=');
    }
  }
  return { pairs, csrf };
}

/**
 * Exchanges the operator's credentials for a real OrnaVerse cookie session
 * and returns the raw {cookie, csrf, username} jar — the caller (see
 * api/auth/session/route.js) encodes it straight into this app's own
 * cookies via buildSessionCookieHeaders above. Nothing is persisted
 * anywhere server-side; the credentials are used here and discarded.
 *
 * Requires ASP.NET Core's antiforgery token: a bare POST with no prior GET
 * is rejected with an EMPTY 400 (no body, no cookie at all). The login
 * page's own GET response sets an antiforgery cookie + a CSRF-TOKEN cookie;
 * the POST must carry both the cookie and the token (as X-CSRF-TOKEN) back.
 * A correct login returns real .AspNetAuth/.AspNetCore.Session cookies; a
 * wrong password returns zero new cookies plus a proper
 * {"Error":{"Message":...}} body — that's the real success/failure signal,
 * checked against the POST's own cookies, not the merged jar (the GET's
 * antiforgery cookie is present either way and would otherwise mask a
 * genuine login failure).
 *
 * @param {{ username: string, password: string }} params
 * @returns {Promise<{ cookie: string, csrf: string|null, username: string }>}
 */
export async function createOrnaverseSession({ username, password }) {
  if (!username || !password) {
    const err = new Error('Username and password are required.');
    err.code = 'BAD_REQUEST';
    throw err;
  }

  const loginPage = await fetch(`${UPSTREAM}/Account/Login`, {
    method:   'GET',
    cache:    'no-store',
    redirect: 'manual',
  });
  const { pairs: pagePairs, csrf: pageCsrf } = parseCookies(loginPage);

  const response = await fetch(`${UPSTREAM}/Account/Login`, {
    method:   'POST',
    headers:  {
      'Content-Type': 'application/json',
      Cookie: [...pagePairs.values()].join('; '),
      ...(pageCsrf ? { 'X-CSRF-TOKEN': pageCsrf } : {}),
    },
    body:     JSON.stringify({ username, password }),
    cache:    'no-store',
    redirect: 'manual',
  });

  const { pairs: authPairs, csrf: authCsrf } = parseCookies(response);

  if (authPairs.size === 0) {
    let detail = '';
    try {
      const body = await response.json();
      detail = body?.Error?.Message || body?.Error?.Code || '';
    } catch { /* empty or non-JSON body */ }

    const err = new Error(
      detail
        ? `OrnaVerse did not grant a session: ${detail}`
        : 'OrnaVerse returned no session cookie.'
    );
    // OrnaVerse's own client treats this code as "prompt for a code"; we can't.
    err.code = /TwoFactor/i.test(detail) ? 'TWO_FACTOR_REQUIRED' : 'LOGIN_FAILED';
    throw err;
  }

  // Carry the full jar forward like a real browser would — the POST's own
  // cookies win by name, but anything the GET set that the POST didn't
  // reissue (the antiforgery cookie itself, typically) stays in.
  const merged = new Map(pagePairs);
  for (const [name, pair] of authPairs) merged.set(name, pair);

  // The PRE-login antiforgery/CSRF pair does not survive authentication —
  // ASP.NET Core's antiforgery cookie is bound to the identity active when
  // it was issued, and ours was issued before sign-in. One more GET, now
  // WITH the auth cookies attached, gets a fresh pair that's actually valid
  // for the authenticated session — without this, every subsequent
  // Services/*/Print/Render call 400s with no body.
  const authedPage = await fetch(`${UPSTREAM}/`, {
    method:   'GET',
    headers:  { Cookie: [...merged.values()].join('; ') },
    cache:    'no-store',
    redirect: 'manual',
  });
  const { pairs: authedPairs, csrf: authedCsrf } = parseCookies(authedPage);
  for (const [name, pair] of authedPairs) merged.set(name, pair);

  const finalCookie = [...merged.values()].join('; ');
  const finalCsrf = authedCsrf ?? authCsrf ?? pageCsrf;

  return {
    cookie: finalCookie,
    csrf: finalCsrf,
    username,
    isSuperAdmin: await checkIsSuperAdmin({ cookie: finalCookie, csrf: finalCsrf }, username),
  };
}

// Customer editing is admin-only (2026-09-28, explicit direction) —
// Administration/User/List is the only place OrnaVerse exposes
// is_super_admin, and it's itself gated behind the Administration:Security
// permission: confirmed live that a non-admin login (pune) gets a real
// AccessDenied trying to call it, even for its own row — there's no
// self-service "who am I" endpoint that works for every account. So this
// call, made with the session that was JUST created, doubles as the check
// itself: it only succeeds for an account that actually holds that
// permission, and any failure (denied or otherwise) is treated as "not an
// admin" rather than surfaced as a login error.
async function checkIsSuperAdmin({ cookie, csrf }, username) {
  try {
    const res = await fetch(`${UPSTREAM}/Services/Administration/User/List`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie,
        ...(csrf ? { 'X-CSRF-TOKEN': csrf } : {}),
      },
      body: JSON.stringify({ Take: 0 }),
      cache: 'no-store',
    });
    if (!res.ok) return false;
    const data = await res.json();
    const rows = data?.Entities ?? [];
    const own = rows.find((u) => u.username?.toLowerCase() === username.toLowerCase());
    return !!own?.is_super_admin;
  } catch {
    return false;
  }
}

/**
 * Resolves the current request's own session cookie chunks straight to the
 * real OrnaVerse cookie/CSRF pair — what every route that talks to
 * OrnaVerse (the Services/* proxy and the handful of internal routes that
 * call OrnaVerse directly, e.g. api/customers/sync) actually needs. No
 * lookup anywhere — the request already carries the whole thing.
 *
 * Declared async (even though the work itself is synchronous) so every
 * existing `await getSessionFromRequest(request)` call site keeps working
 * unchanged — awaiting a plain value just resolves immediately.
 *
 * @param {Request} request
 * @returns {Promise<{ cookie: string, csrf: string|null, username: string }|null>}
 */
export async function getSessionFromRequest(request) {
  const getCookie = (name) => request.cookies?.get?.(name)?.value
    ?? parseCookieHeader(request.headers.get('cookie'))[name];

  const parts = [];
  for (let i = 0; i < MAX_CHUNKS; i++) {
    const chunk = getCookie(`${SESSION_COOKIE_PREFIX}${i}`);
    if (chunk == null) break;
    parts.push(chunk);
  }
  if (!parts.length) return null;

  try {
    return JSON.parse(decodeURIComponent(parts.join('')));
  } catch {
    // Corrupt/truncated cookie (e.g. a stale set from a previous version of
    // this code) — treat exactly like no session at all.
    return null;
  }
}

/**
 * If OrnaVerse's response carried fresh Set-Cookie headers, folds them into
 * the session jar and returns an updated session to re-persist. Returns
 * null when upstream sent no cookies (the overwhelmingly common case), so
 * callers can skip re-issuing Set-Cookie on every single request.
 *
 * THE BUG THIS FIXES: every proxied call replayed the exact cookie captured
 * at login, forever. ASP.NET Core's auth cookie renews itself under sliding
 * expiration (a Set-Cookie on any request landing past roughly half its
 * remaining lifetime) — the proxy silently discarded every one of those
 * renewals, so a shift longer than the ORIGINAL cookie's lifetime hit a real
 * 401 from OrnaVerse itself even with continuous activity, often mid-
 * checkout. Reported directly (2026-09-29): "auto logouts... while placing
 * an order... breaks everything."
 *
 * @param {{cookie: string, csrf: string|null, username: string, isSuperAdmin?: boolean}} session
 * @param {Response} upstreamResponse
 * @returns {{cookie: string, csrf: string|null, username: string, isSuperAdmin?: boolean}|null}
 */
export function renewSessionFromUpstream(session, upstreamResponse) {
  const { pairs, csrf } = parseCookies(upstreamResponse);
  if (pairs.size === 0) return null;

  const existing = new Map();
  for (const part of session.cookie.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const [name] = trimmed.split('=');
    existing.set(name, trimmed);
  }

  let changed = false;
  for (const [name, pair] of pairs) {
    if (existing.get(name) !== pair) changed = true;
    existing.set(name, pair);
  }
  if (csrf && csrf !== session.csrf) changed = true;
  if (!changed) return null;

  return { ...session, cookie: [...existing.values()].join('; '), csrf: csrf ?? session.csrf };
}

function parseCookieHeader(header) {
  const out = {};
  for (const part of (header ?? '').split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name) out[name] = rest.join('=');
  }
  return out;
}
