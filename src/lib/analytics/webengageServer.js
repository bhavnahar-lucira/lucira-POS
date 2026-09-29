// src/lib/analytics/webengageServer.js
//
// SERVER-ONLY WebEngage sender — the app's real transport for every tracked
// event as of 2026-09-28 (previously a client-side Web SDK call, see
// webengage.js — that path never reached the WebEngage panel because this
// tenant's domain isn't registered for the web SDK). Called from
// src/app/api/analytics/webengage/route.js, which every browser-side
// tracker.track()/trackAgent() call now POSTs to via webengageBridge.js —
// see that route/bridge for the client side of this.
//
// Kept server-only (never imported by client code) because
// WEBENGAGE_API_KEY is a real bearer secret, unlike the public license code
// the old client SDK used.
//
// WIRE FORMAT (per direction, 2026-09-28): every event, regardless of what
// actually happened, is sent under ONE WebEngage eventName — "POS_Event" —
// with the real action (e.g. "Order_Placed") as a top-level `event_type`
// attribute instead. This is a WebEngage-specific convention only:
// GA4 (gtag.js) is untouched and keeps receiving the real distinct event
// names as it always has — see tracker.js.
//
// API surface: WebEngage Data Platform REST API v1, Track Event
// (POST {WEBENGAGE_API_HOST}/v1/accounts/{licenseCode}/events).

import { formatWebEngageDateTime, formatWebEngageDateOnly, formatWebEngageTimeOnly } from './webengageDates';
import { toE164India } from './phoneFormat';

const API_HOST      = process.env.WEBENGAGE_API_HOST;
const LICENSE_CODE   = process.env.WEBENGAGE_LICENSE_CODE;
const API_KEY        = process.env.WEBENGAGE_API_KEY;

// Fixed per direction — never the raw action name. The real action lives in
// eventData.event_type instead (see toEventType below).
const WEBENGAGE_EVENT_NAME = 'POS_Event';

// One retry on a 5xx only — WebEngage's own outage, not our payload being
// wrong (a 4xx retrying the same body would just fail the same way again).
const MAX_ATTEMPTS = 2;

export function isWebEngageServerConfigured() {
  return !!(API_HOST && LICENSE_CODE && API_KEY);
}

// camelCase/PascalCase -> snake_case, strips anything not alnum/underscore,
// never starts with "we_" (WebEngage reserves that prefix), capped at 50
// chars — the one place this shaping happens, so every one of the app's 100+
// existing tracker.track() call sites gets a spec-compliant attribute name
// without any of them needing to change.
function toAttributeKey(key) {
  let snake = String(key)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .toLowerCase();
  if (snake.startsWith('we_')) snake = `pos_${snake}`;
  return snake.slice(0, 50) || 'attr';
}

// Recursively renames keys to WebEngage's naming rules and drops
// null/undefined/empty-string values ("omit null or empty values" — applied
// at every nesting level, not just the top).
function cleanDeep(value) {
  if (Array.isArray(value)) {
    return value.map(cleanDeep).filter((v) => v !== undefined);
  }
  if (value instanceof Date) return value;
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, v] of Object.entries(value)) {
      if (v === undefined || v === null || v === '') continue;
      const cleaned = cleanDeep(v);
      if (cleaned === undefined) continue;
      out[toAttributeKey(key)] = cleaned;
    }
    return out;
  }
  return value;
}

// Splits one flat properties object into top-level scalars (segmentable —
// WebEngage can't filter on a nested object) and everything else, nested
// under `details` (personalization-only, per direction). Callers pass one
// flat object (matching every existing tracker.track(name, properties)
// call site) rather than pre-splitting it themselves.
function shapeEventData(properties) {
  const topLevel = {};
  const nested = {};
  for (const [key, value] of Object.entries(properties ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    const isScalar = typeof value !== 'object' || value instanceof Date;
    if (isScalar) topLevel[key] = value;
    else nested[key] = value;
  }
  return { topLevel, nested };
}

// 'POS_order_placed' -> 'order_placed'. Derived from the app's real EVENTS
// constant VALUES (lowercase snake_case, POS_-prefixed — see events.js's
// RAW_EVENTS) so every one of the app's existing event constants maps to a
// WebEngage event_type automatically — no per-event mapping table to keep
// in sync.
//
// Deliberately lowercase (2026-09-29, explicit direction) — a brief attempt
// to Title_Case this (matching an earlier, inaccurate comment here) was
// reverted; lowercase is the preferred, intentional convention going forward.
function toEventType(eventName) {
  return String(eventName)
    .replace(/^POS_/, '')
    .split('_')
    .filter(Boolean)
    .map((word) => word.toLowerCase())
    .join('_') || 'unknown';
}

async function postEvent(body) {
  return fetch(`${API_HOST}/v1/accounts/${LICENSE_CODE}/events`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization:  `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(body),
  });
}

async function postUser(body) {
  return fetch(`${API_HOST}/v1/accounts/${LICENSE_CODE}/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization:  `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(body),
  });
}

/**
 * Sends one event to WebEngage via the REST API. Never throws — a tracking
 * failure must never surface as a request failure to whoever called the
 * /api/analytics/webengage route this backs.
 *
 * @param {{
 *   userId?: string|number,       — stable customer id; omit and pass
 *                                    anonymousId instead when there's no
 *                                    customer (see direction).
 *   anonymousId?: string,
 *   eventName: string,            — the app's real event name, e.g.
 *                                    EVENTS.ORDER_PLACED ("POS_ORDER_PLACED")
 *                                    — becomes eventData.event_type, NOT the
 *                                    WebEngage eventName (see file header).
 *   properties?: object,          — flat; split into top-level/nested here.
 *   eventTime?: Date,             — defaults to now.
 * }} params
 * @returns {Promise<{ ok: boolean, status?: number, body?: string, reason?: string }>}
 */
export async function sendServerEventToWebEngage({
  userId, anonymousId, eventName, properties = {}, eventTime,
}) {
  if (!isWebEngageServerConfigured()) {
    console.warn('[webengageServer] not configured (missing env vars) — dropping event', eventName);
    return { ok: false, reason: 'not_configured' };
  }
  if (!userId && !anonymousId) {
    console.warn('[webengageServer] no userId/anonymousId — dropping event', eventName);
    return { ok: false, reason: 'no_identity' };
  }
  if (!eventName) return { ok: false, reason: 'no_event_name' };

  const now = eventTime instanceof Date ? eventTime : new Date();
  const { topLevel, nested } = shapeEventData(properties);

  const eventData = cleanDeep({
    event_type:     toEventType(eventName),
    event_datetime: formatWebEngageDateTime(now),
    event_date:     formatWebEngageDateOnly(now),
    event_time:     formatWebEngageTimeOnly(now),
    ...topLevel,
    ...(Object.keys(nested).length ? { details: nested } : {}),
  });

  const body = {
    ...(userId ? { userId: String(userId) } : { anonymousId: String(anonymousId) }),
    eventName: WEBENGAGE_EVENT_NAME,
    eventTime: formatWebEngageDateTime(now),
    eventData,
  };

  let lastStatus;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
       
      const response = await postEvent(body);
      lastStatus = response.status;
      // eventData (never the API key/host) travels back to the browser so
      // webengageBridge.js can console.log exactly what WebEngage received —
      // the one place the real shaped payload (event_type, price, image, ...)
      // exists, since shaping happens server-side.
      if (response.ok) return { ok: true, status: response.status, eventData };

       
      const responseBody = await response.text().catch(() => '');
      console.error('[webengageServer] WebEngage rejected event', {
        realEventName: eventName, eventType: eventData.event_type,
        status: response.status, attempt, responseBody,
      });

      // Confirmed live (2026-09-28): identical/richer payloads that got a
      // raw-HTML 403 here succeed a moment later with no change at all — a
      // 44-attribute PRODUCT_VIEWED-shaped payload and a 10-request burst
      // both cleanly returned 201 in direct testing against this same
      // endpoint. WebEngage's real app-layer errors come back as JSON (see
      // the "Invalid date format" 400 above); a bare "<html>...403
      // Forbidden...</html>" body is a generic edge/WAF page, not
      // WebEngage's own rejection — so it's treated as transient and
      // retried, unlike a genuine (JSON-bodied) 403/4xx.
      const isEdgeGlitch = response.status === 403 && !responseBody.trim().startsWith('{');
      const isRetryable = (response.status >= 500 || isEdgeGlitch) && attempt < MAX_ATTEMPTS;
      if (!isRetryable) return { ok: false, status: response.status, body: responseBody, eventData };
    } catch (err) {
      console.error('[webengageServer] request failed', {
        realEventName: eventName, attempt, error: err.message,
      });
      if (attempt === MAX_ATTEMPTS) return { ok: false, reason: 'network_error', eventData };
    }
  }
  return { ok: false, status: lastStatus, eventData };
}

/**
 * Creates/updates a WebEngage user profile via the REST Users API — the
 * server-side replacement for the old client SDK's user.login()/
 * setAttribute() calls (see this file's header: that SDK never worked on
 * this tenant's domain at all, console-erroring on load). Never throws.
 *
 * @param {{
 *   userId?: string|number, anonymousId?: string, — one is required.
 *   customerName?: string|null, customerMobile?: string|null,
 *   email?: string|null, birthDate?: string|null, gender?: string|null,
 *   attributes?: object|null, — custom (non-reserved) attributes, key-cased
 *     the same way event properties are (see toAttributeKey above).
 * }} params
 * @returns {Promise<{ ok: boolean, status?: number, reason?: string }>}
 */
export async function upsertWebEngageUser({
  userId, anonymousId, customerName, customerMobile, email, birthDate, gender, attributes,
}) {
  if (!isWebEngageServerConfigured()) {
    return { ok: false, reason: 'not_configured' };
  }
  if (!userId && !anonymousId) return { ok: false, reason: 'no_identity' };

  const [firstName, ...rest] = (customerName ?? '').trim().split(/\s+/).filter(Boolean);

  // Top-level field names here are WebEngage's own fixed schema (firstName/
  // lastName/phone/...) — unlike event attributes, these must NOT go through
  // cleanDeep's key-renaming, only its null/undefined stripping. Only the
  // free-form `attributes` bag gets the snake_case/"we_"-guard treatment.
  const body = {
    ...(userId ? { userId: String(userId) } : { anonymousId: String(anonymousId) }),
    ...(firstName ? { firstName } : {}),
    ...(rest.length ? { lastName: rest.join(' ') } : {}),
    ...(toE164India(customerMobile) ? { phone: toE164India(customerMobile) } : {}),
    ...(email ? { email } : {}),
    ...(birthDate ? { birthDate } : {}),
    ...(gender ? { gender } : {}),
    ...(attributes && Object.keys(cleanDeep(attributes)).length ? { attributes: cleanDeep(attributes) } : {}),
  };

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await postUser(body);
      if (response.ok) return { ok: true, status: response.status };
      const responseBody = await response.text().catch(() => '');
      console.error('[webengageServer] WebEngage rejected user upsert', {
        userId, status: response.status, attempt, responseBody,
      });
      // Same transient-edge-glitch allowance as sendServerEventToWebEngage
      // above — see its comment for the live evidence.
      const isEdgeGlitch = response.status === 403 && !responseBody.trim().startsWith('{');
      const isRetryable = (response.status >= 500 || isEdgeGlitch) && attempt < MAX_ATTEMPTS;
      if (!isRetryable) return { ok: false, status: response.status, body: responseBody };
      continue;
    } catch (err) {
      console.error('[webengageServer] user upsert request failed', { userId, attempt, error: err.message });
      if (attempt === MAX_ATTEMPTS) return { ok: false, reason: 'network_error' };
    }
  }
  return { ok: false, reason: 'network_error' };
}
