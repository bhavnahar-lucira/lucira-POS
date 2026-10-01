'use client';

// Client-side read of which OrnaVerse environment the SERVER is currently
// pointed at (ACTIVE_ENV) — fetched at runtime via /api/config/environment
// rather than imported, so a server restart after an env-var change is
// visible here immediately, with no client rebuild needed. See
// lib/ornaverse/environment.js's own header for the full reasoning.
//
// Cached as a Promise (not just the resolved value) so several near-
// simultaneous callers (e.g. a few barcode scans in a row before the first
// request lands) share one in-flight fetch instead of firing one each. A
// FAILED fetch is NOT cached (cleared back to null below) — a transient
// blip at app boot must not lock the whole session into one hardcoded
// answer forever; the next call just retries. Only ever falls back to
// 'LIVE' — this file's own previous hardcoded default — for the ONE call
// that actually hit the failure, so a flaky/offline request never breaks
// its caller.
let cachedPromise = null;

export function getClientActiveEnv() {
  if (!cachedPromise) {
    cachedPromise = fetch('/api/config/environment')
      .then((res) => res.json())
      .then((data) => (data?.activeEnv === 'UAT' ? 'UAT' : 'LIVE'))
      .catch(() => {
        cachedPromise = null;
        return 'LIVE';
      });
  }
  return cachedPromise;
}
