// Small in-memory TTL cache for a hand-picked allowlist of read-only,
// tenant-wide OrnaVerse reference endpoints (payment modes, sales persons,
// document numbering, today's metal-rate check) — the same answer for
// every operator at a given store, called identically and repeatedly per
// session. Keyed on (path, body) rather than relying on Next's own
// fetch/route caching, since these are POST reads whose body (company_id)
// Next's cache key doesn't account for. Same "single warm process,
// in-memory Map, lazy expiry" shape as rateLimit.js —
// resets on a cold start, fine for a short-lived performance cache.
//
// Never applied to anything that creates or mutates a document — only a
// small, explicit allowlist of List/Retrieve-style reads.

// Payment modes, document numbering and sales persons were removed (2026-11-05): checkout must always read them live.
const CACHEABLE_PATHS = new Map([
  ['Services/Common/Common/CheckMetalRateForToday',   2 * 60 * 1000],
]);

const cache = new Map(); // key -> { bytes, status, contentType, expiresAt }

/** @param {string} path — the resolved upstream path (no query string) */
export function isCacheableReadPath(path) {
  return CACHEABLE_PATHS.has(path);
}

/** @param {string} key */
export function getCachedRead(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry;
}

/**
 * @param {string} key
 * @param {{ bytes: ArrayBuffer, status: number, contentType: string }} value
 */
export function setCachedRead(key, { bytes, status, contentType }) {
  const path = key.split('::')[0];
  const ttlMs = CACHEABLE_PATHS.get(path) ?? 60 * 1000;
  cache.set(key, { bytes, status, contentType, expiresAt: Date.now() + ttlMs });
}
