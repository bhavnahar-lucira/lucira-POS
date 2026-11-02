// Olocker.co "API V3" — jewellery insurance policy generation.
//
// ── WHY THE BASE URL IS NOT THE ONE IN THE DEVELOPER GUIDE ─────────────────
// The guide hands out `https://olocker.co/api_v3/<endpoint>.aspx`. Probed
// live 2026-10-31 with OUR access/secret pair, that host answers
// `{"result":"3","message":"Authentication Failed!"}` — the credentials
// belong to a different tenant, served from `apiv3.olocker.in`, where the
// two endpoints sit at the ROOT and NOT under an `/api_v3/` segment
// (`apiv3.olocker.in/api_v3/authenticate.aspx` is a plain 404). Pointing a
// correct payload at the documented base therefore fails authentication
// before it ever reaches policy generation, which is the most likely reason
// OrnaVerse's own `Services/POS/OLocker/GetInsurance` 500s rather than
// returning a policy.
//
// Kept an env var so switching tenants/environments never needs a code
// change; the fallback is the host our keys actually authenticate against.
export const OLOCKER_BASE_URL = (
  process.env.OLOCKER_BASE_URL || 'https://apiv3.olocker.in'
).replace(/\/+$/, '');

export const OLOCKER_PATHS = {
  AUTHENTICATE:      'authenticate.aspx',
  GENERATE_POLICIES: 'generatePolicies.aspx',
};

// ── RESPONSE CONTRACT (probed live, not documented) ───────────────────────
// `generatePolicies.aspx` answers HTTP **200 even when it fails**, with a
// JSON ARRAY whose rows are either `{policy, url}` (success) or
// `{result, message}` (failure, e.g. result "1" = "Token Expired OR Token
// Invalid !"). Status code alone tells you nothing — every caller here has
// to read the body. An empty `TagList` is the one shape that really does
// return HTTP 500, so a request is never sent without at least one tag.
export const OLOCKER_RESULT_OK = 'OK';
export const OLOCKER_TOKEN_INVALID_RESULT = '1';

// Authenticate is cheap and the guide gives no expiry, so a token is reused
// for a short window and re-fetched once on an explicit "token invalid".
export const OLOCKER_TOKEN_TTL_MS = 10 * 60 * 1000;

export const OLOCKER_TIMEOUT_MS = 25_000;

// Olocker takes stone weights in carats and everything else in grams; the
// gross/net reconciliation their guide asks for has to happen in one unit.
export const GRAMS_PER_CARAT = 0.2;

// Millesimal fineness per gold karat — the unit the current Postman
// collection uses for `metaldetails[].purity` ("916"), not the percentage
// form ("58.33") an older sample in the guide shows. OrnaVerse's own
// per-line `purity` (a 0–1 fraction) is preferred when the invoice carries
// it; this table is the fallback keyed off `karat_name`.
const FINENESS_BY_KARAT = { 9: 375, 14: 585, 18: 750, 22: 916, 24: 999 };

/**
 * Metal type + fineness for one invoice line, from its karat_name
 * ("22KT", "14KT", "Silver925", "Platinum950").
 * @param {string|null|undefined} karatName
 * @returns {{ type: string, fineness: number|null }}
 */
export function metalFromKaratName(karatName) {
  const name = String(karatName ?? '').trim();
  if (!name) return { type: 'GOLD', fineness: null };

  const digits = Number(name.match(/\d+/)?.[0]);

  if (/silver/i.test(name))   return { type: 'SILVER',   fineness: digits || 925 };
  if (/plat/i.test(name))     return { type: 'PLATINUM', fineness: digits || 950 };

  return { type: 'GOLD', fineness: FINENESS_BY_KARAT[digits] ?? null };
}
