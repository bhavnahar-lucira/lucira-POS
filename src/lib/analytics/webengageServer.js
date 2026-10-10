import { formatWebEngageDateTime, formatEventDate12h, formatEventTime12h, formatEventDateTime12h } from './webengageDates';
import { toE164India } from './phoneFormat';

const API_HOST      = process.env.WEBENGAGE_API_HOST;
const LICENSE_CODE   = process.env.WEBENGAGE_LICENSE_CODE;
const API_KEY        = process.env.WEBENGAGE_API_KEY;
const WEBENGAGE_EVENT_NAME = 'POS_Event';
const MAX_ATTEMPTS = 2;

export function isWebEngageServerConfigured() {
  return !!(API_HOST && LICENSE_CODE && API_KEY);
}

function toAttributeKey(key) {
  let snake = String(key)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .toLowerCase();
  if (snake.startsWith('we_')) snake = `pos_${snake}`;
  return snake.slice(0, 50) || 'attr';
}

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
    event_datetime: formatEventDateTime12h(now),
    event_date:     formatEventDate12h(now),
    event_time:     formatEventTime12h(now),
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
      if (response.ok) return { ok: true, status: response.status, eventData };

       
      const responseBody = await response.text().catch(() => '');
      console.error('[webengageServer] WebEngage rejected event', {
        realEventName: eventName, eventType: eventData.event_type,
        status: response.status, attempt, responseBody,
      });
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
