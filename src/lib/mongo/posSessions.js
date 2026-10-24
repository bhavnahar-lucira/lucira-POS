// src/lib/mongo/posSessions.js
//
// SERVER-ONLY. One document per POS login session (plus one per FAILED login
// attempt, status 'failed', no session) — the admin panel's record of which
// store login was signed in, from where, when, for how long, and how it
// ended. Logins are per STORE (not per person), so the OrnaVerse username +
// the stores OrnaVerse itself says it may access is the "who".
//
// Every field here is server-derived: identity from the signed session,
// time from this server's clock, stores from a live GetUserStores call —
// never from anything the browser claims. The one client-supplied value is
// the logout `reason` label, validated to a fixed set.
//
// Callers wrap every write in next/server's after(): tracking runs once the
// response has gone out, so a slow or failing Mongo can never delay or break
// a login, a sale, or a logout.
//
// A session that never gets an explicit end (tab closed, device asleep,
// browser killed) stays status 'active' here — readers treat it as timed
// out once lastActivityAt + idleTimeoutMs has passed. lastActivityAt is
// only refreshed by real API traffic, at most once a minute (the same
// throttle as the session cookie's own touchSessionActivity).

import { getDb } from './client';
import { ACTIVE_ENV } from '@/lib/ornaverse/environment';

const COLLECTION = 'posSessions_POS';

export const END_REASONS = ['manual', 'idle_timeout'];

const clip = (v, max) => (v == null ? null : String(v).slice(0, max));

/**
 * @param {{ sid: string, username: string, isSuperAdmin: boolean, loginAt: number,
 *   idleTimeoutMs: number, ip: string, userAgent: string|null,
 *   stores: { company_id: number, company_name?: string, store_code?: string }[]|null }} params
 */
export async function recordLogin({ sid, username, isSuperAdmin, loginAt, idleTimeoutMs, ip, userAgent, stores }) {
  const db = await getDb();
  await db.collection(COLLECTION).insertOne({
    _id: sid,
    status: 'active',
    environment: ACTIVE_ENV,
    username,
    isSuperAdmin: !!isSuperAdmin,
    stores: stores?.map((s) => ({
      companyId: s.company_id,
      name: s.company_name ?? null,
      code: s.store_code ?? null,
    })) ?? null,
    loginAt: new Date(loginAt),
    lastActivityAt: new Date(loginAt),
    idleTimeoutMs,
    endedAt: null,
    endReason: null,
    ip: clip(ip, 64),
    userAgent: clip(userAgent, 300),
  });
}

/**
 * @param {{ username: string, code: string, ip: string, userAgent: string|null }} params
 */
export async function recordLoginFailed({ username, code, ip, userAgent }) {
  const db = await getDb();
  const now = new Date();
  await db.collection(COLLECTION).insertOne({
    status: 'failed',
    environment: ACTIVE_ENV,
    // Attacker-controlled input on a failed attempt — length-capped.
    username: clip(username, 100),
    failureCode: clip(code, 50),
    loginAt: now,
    endedAt: now,
    ip: clip(ip, 64),
    userAgent: clip(userAgent, 300),
  });
}

/** @param {string} sid @param {number} at */
export async function touchSession(sid, at) {
  const db = await getDb();
  await db.collection(COLLECTION).updateOne(
    { _id: sid, status: 'active' },
    { $set: { lastActivityAt: new Date(at) } },
  );
}

/**
 * Only ever closes a still-active session — a later duplicate signal (e.g.
 * the client's own idle logout arriving after the server already expired
 * it) can't overwrite the first, accurate end time/reason.
 *
 * @param {string} sid
 * @param {{ reason: 'manual'|'idle_timeout', endedAt: number }} params
 */
export async function endSession(sid, { reason, endedAt }) {
  const db = await getDb();
  await db.collection(COLLECTION).updateOne(
    { _id: sid, status: 'active' },
    { $set: { status: 'ended', endReason: reason, endedAt: new Date(endedAt) } },
  );
}
