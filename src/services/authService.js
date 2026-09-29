// Authenticates an operator against OrnaVerse's own login (~/Account/Login),
// via our /api/auth/session route — see lib/ornaverse/session.js for the
// full mechanism and why this replaced the old OAuth bearer-token flow.
// The session id comes back as an httpOnly cookie on our own origin; the
// browser attaches it automatically to every subsequent request, so nothing
// token-shaped needs to be stored or forwarded from here on.

/**
 * @param {string} username
 * @param {string} password
 * @returns {Promise<{ username: string, isSuperAdmin: boolean }>}
 */
export async function login(username, password) {
  const response = await fetch('/api/auth/session', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ username, password }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data?.ok) {
    const err = new Error(
      data?.code === 'TWO_FACTOR_REQUIRED'
        ? 'This account requires a login code OrnaVerse can only ask for interactively — sign in on OrnaVerse directly to disable it, or use an account without 2FA.'
        : data?.error_description ?? 'Invalid username or password.'
    );
    err.code = data?.code ?? data?.error ?? 'LOGIN_FAILED';
    err.status = response.status;
    throw err;
  }

  return { username: data.username ?? username, isSuperAdmin: !!data.isSuperAdmin };
}

/** Tears down the operator's OrnaVerse session. Best-effort, never throws. */
export async function logout() {
  try {
    await fetch('/api/auth/session', { method: 'DELETE' });
  } catch { /* signing out locally matters more than the server-side sweep */ }
}
