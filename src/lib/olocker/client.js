// SERVER-ONLY. The only place that talks to Olocker.
//
// The access/secret pair never reaches the browser: every call goes through
// /api/insurance, the same shape as the Nector proxy — credentials in env,
// the client only ever names a transaction.

import {
  OLOCKER_BASE_URL,
  OLOCKER_PATHS,
  OLOCKER_RESULT_OK,
  OLOCKER_TOKEN_INVALID_RESULT,
  OLOCKER_TOKEN_TTL_MS,
  OLOCKER_TIMEOUT_MS,
  OLOCKER_GENERATE_TIMEOUT_MS,
} from './constants';

export class OlockerError extends Error {
  constructor(message, { code = null, cause = null } = {}) {
    super(message);
    this.name = 'OlockerError';
    this.code = code;
    this.cause = cause;
  }
}

function credentials() {
  const key   = process.env.OLOCKER_ACCESS_KEY;
  const value = process.env.OLOCKER_SECRET_KEY;
  if (!key || !value) {
    throw new OlockerError(
      'Olocker is not configured — set OLOCKER_ACCESS_KEY and OLOCKER_SECRET_KEY.',
      { code: 'NOT_CONFIGURED' },
    );
  }
  return { key, value };
}

/** The low-level reason a fetch failed — Node puts it on `err.cause`. */
function transportReason(err) {
  return err?.cause?.code || err?.cause?.message || err?.code || err?.message || 'unknown';
}

async function postOlocker(path, body, { timeoutMs = OLOCKER_TIMEOUT_MS } = {}) {
  let res;
  try {
    res = await fetch(`${OLOCKER_BASE_URL}/${path}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
      cache:   'no-store',
      signal:  AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    // A timeout is NOT the same as "unreachable": the request got there and
    // Olocker may still be issuing the policies after we stopped waiting.
    // Callers must treat the outcome as unknown (see the route).
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      throw new OlockerError(
        `Olocker did not answer within ${Math.round(timeoutMs / 1000)} seconds (${path}).`,
        { code: 'TIMEOUT', cause: err },
      );
    }
    const reason = transportReason(err);
    // Seen live 2026-11-06: apiv3.olocker.in served an expired certificate
    // and every call failed here with a message that hid why.
    const hint = /CERT/i.test(reason) ? " Olocker's security certificate is invalid or expired." : '';
    throw new OlockerError(`Could not reach Olocker (${path}): ${reason}.${hint}`, {
      code: 'UNREACHABLE', cause: err,
    });
  }

  const text = await res.text();

  // Their error pages are HTML with a 500 (an empty TagList is the known
  // trigger) — surface that as itself rather than a JSON parse failure.
  if (!res.ok) {
    throw new OlockerError(`Olocker ${path} failed: HTTP ${res.status}.`, {
      code: 'HTTP_ERROR',
    });
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new OlockerError(`Olocker ${path} returned a non-JSON response.`, {
      code: 'BAD_RESPONSE',
    });
  }
}

// Module-scoped so one warm server instance authenticates once per window
// rather than once per invoice. Nothing customer-specific is cached.
let cachedToken = null; // { token: string, expiresAt: number }

/**
 * A usable Olocker auth token.
 * @param {{ forceRefresh?: boolean }} [opts]
 * @returns {Promise<string>}
 */
export async function getOlockerToken({ forceRefresh = false } = {}) {
  if (!forceRefresh && cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token;
  }

  const data = await postOlocker(OLOCKER_PATHS.AUTHENTICATE, credentials());

  if (data?.result !== OLOCKER_RESULT_OK || !data?.token) {
    cachedToken = null;
    throw new OlockerError(
      data?.message || 'Olocker rejected these credentials.',
      { code: 'AUTH_FAILED' },
    );
  }

  cachedToken = { token: data.token, expiresAt: Date.now() + OLOCKER_TOKEN_TTL_MS };
  return cachedToken.token;
}

function isTokenRejection(rows) {
  return rows.some((row) => row?.result === OLOCKER_TOKEN_INVALID_RESULT);
}

/**
 * Generates one policy per tag.
 *
 * `buildTags(token)` is a callback rather than a ready-made array because
 * every tag embeds the token, so a retry on an expired token has to rebuild
 * the whole TagList around the new one.
 *
 * @param {(token: string) => object[]} buildTags
 * @returns {Promise<object[]>} the raw rows Olocker returned, in its own order
 * @throws {OlockerError} on auth failure, transport failure, or when every
 *   row came back as an error
 */
export async function generatePolicies(buildTags) {
  const attempt = async (forceRefresh) => {
    const token = await getOlockerToken({ forceRefresh });
    const tags  = buildTags(token);
    if (!tags.length) {
      // An empty TagList is the one input Olocker answers with a 500.
      throw new OlockerError('No items to insure.', { code: 'EMPTY_TAGLIST' });
    }
    const data = await postOlocker(
      OLOCKER_PATHS.GENERATE_POLICIES,
      { TagList: tags },
      { timeoutMs: OLOCKER_GENERATE_TIMEOUT_MS },
    );
    return Array.isArray(data) ? data : [data];
  };

  let rows = await attempt(false);

  // A cached token that expired early reads as a per-row error, not an HTTP
  // failure — one forced re-auth, then give up.
  if (isTokenRejection(rows)) {
    cachedToken = null;
    rows = await attempt(true);
    if (isTokenRejection(rows)) {
      throw new OlockerError('Olocker rejected the authentication token.', {
        code: 'AUTH_FAILED',
      });
    }
  }

  if (rows.length && rows.every((row) => !row?.policy)) {
    throw new OlockerError(
      rows.find((row) => row?.message)?.message || 'Olocker declined to issue a policy.',
      { code: 'DECLINED' },
    );
  }

  return rows;
}

/** Exported for tests/diagnostics — drops the cached token. */
export function resetOlockerToken() {
  cachedToken = null;
}
