import { formatWebEngageDateTime, formatEventDate12h, formatEventTime12h, formatEventDateTime12h } from './webengageDates';
import { toE164India } from './phoneFormat';
import { WEBENGAGE_EVENTS } from './events';
import { lookupShopifyBySku } from './shopifySkuLookup';

const API_HOST      = process.env.WEBENGAGE_API_HOST;
const LICENSE_CODE   = process.env.WEBENGAGE_LICENSE_CODE;
const API_KEY        = process.env.WEBENGAGE_API_KEY;
const WEBENGAGE_EVENT_NAME = 'POS_Event';
const MAX_ATTEMPTS = 2;
const WEBSITE_EVENT_NAMES = new Set(Object.values(WEBENGAGE_EVENTS));

// Fields each product event carries on the website (productId is STOPPED on productView).
const PRODUCT_EVENT_FIELDS = {
  [WEBENGAGE_EVENTS.PRODUCT_VIEW]:         ['thumbnailImage', 'productUrl', 'variantId'],
  [WEBENGAGE_EVENTS.PRODUCT_IMPRESSION]:   ['thumbnailImage', 'image', 'productId', 'variantId', 'productUrl'],
  [WEBENGAGE_EVENTS.PRODUCT_CLICK]:        ['thumbnailImage', 'productId', 'variantId', 'productUrl'],
  [WEBENGAGE_EVENTS.ADD_TO_CART]:          ['thumbnailImage', 'image', 'productId', 'variantId', 'productUrl'],
  [WEBENGAGE_EVENTS.REMOVE_FROM_CART]:     ['thumbnail_image', 'productId', 'variantId'],
  [WEBENGAGE_EVENTS.ADD_TO_WISHLIST]:      ['thumbnailImage', 'productId', 'variantId', 'productUrl'],
  [WEBENGAGE_EVENTS.REMOVE_FROM_WISHLIST]: ['thumbnailImage', 'productId', 'variantId', 'productUrl'],
};

const URL_FIELDS = new Set(['thumbnailImage', 'thumbnail_image', 'image', 'productUrl']);
const SHOPIFY_SOURCE = { image: 'thumbnailImage', thumbnail_image: 'thumbnailImage' };

const numericId = (value) => (value == null || value === '' ? undefined : Number(value) || undefined);
const stringId = (value) => (value == null || value === '' ? undefined : String(value));

// Item fields the website's own checkout code sends per event, filled from Shopify by the item's SKU.
const ITEM_FIELDS = {
  [WEBENGAGE_EVENTS.VIEW_CART]:         (s) => ({ id: stringId(s.productId), variant_id: stringId(s.variantId), thumbnail_image: s.thumbnailImage }),
  [WEBENGAGE_EVENTS.BEGIN_CHECKOUT]:    (s) => ({ item_id: numericId(s.productId), variant_id: stringId(s.variantId) }),
  [WEBENGAGE_EVENTS.ADD_SHIPPING_INFO]: (s) => ({ item_id: numericId(s.productId), image_url: s.thumbnailImage }),
  [WEBENGAGE_EVENTS.ADD_PAYMENT_INFO]:  (s) => ({ item_id: numericId(s.productId), variant_id: numericId(s.variantId) }),
  [WEBENGAGE_EVENTS.PURCHASE]:          (s) => ({ item_id: numericId(s.productId), variant_id: numericId(s.variantId) }),
  [WEBENGAGE_EVENTS.PAYMENT_FAILURE]:   (s) => ({ item_id: numericId(s.productId), variant_id: numericId(s.variantId) }),
};

function isPublicUrl(value) {
  return typeof value === 'string' && /^https:\/\//.test(value) && !/localhost|127\.0\.0\.1/.test(value);
}

async function fillItemsFromShopify(eventName, items) {
  const pick = ITEM_FIELDS[eventName];
  return Promise.all(items.map(async (item) => {
    if (!item || typeof item !== 'object') return item;
    const { _sku: sku, ...rest } = item;
    if (!pick || !sku) return rest;
    const shopify = await lookupShopifyBySku(sku);
    if (!shopify) return rest;
    const nameKey = 'product_name' in rest ? 'product_name' : 'item_name';
    return {
      ...rest,
      ...pick(shopify),
      [nameKey]: rest[nameKey] || shopify.productName || undefined,
    };
  }));
}

async function fillFromShopify(eventName, properties) {
  if (Array.isArray(properties?.items) && properties.items.length) {
    properties = { ...properties, items: await fillItemsFromShopify(eventName, properties.items) };
  }
  const fields = PRODUCT_EVENT_FIELDS[eventName];
  if (!fields || !properties?.sku) return properties;
  const needs = (key) => {
    const v = properties[key];
    if (URL_FIELDS.has(key)) return !isPublicUrl(v);
    return v === undefined || v === null || v === '';
  };
  if (!fields.some(needs) && properties.productName && properties.productType) return properties;

  const shopify = await lookupShopifyBySku(properties.sku);
  if (!shopify) return properties;

  const filled = { ...properties };
  for (const key of fields) {
    if (!needs(key)) continue;
    const value = shopify[SHOPIFY_SOURCE[key] ?? key];
    if (value) filled[key] = value;
  }
  if (!filled.productName && shopify.productName) filled.productName = shopify.productName;
  if (!filled.productType && shopify.productType) filled.productType = shopify.productType;
  return filled;
}

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

function stripEmpty(value) {
  if (Array.isArray(value)) {
    return value.map(stripEmpty).filter((v) => v !== undefined);
  }
  if (value instanceof Date) return value;
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, v] of Object.entries(value)) {
      if (v === undefined || v === null || v === '') continue;
      const cleaned = stripEmpty(v);
      if (cleaned !== undefined) out[key] = cleaned;
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
  userId = toE164India(userId);
  if (!userId) {
    console.warn('[webengageServer] missing or invalid mobile userId — dropping event', eventName);
    return { ok: false, reason: 'invalid_user_id' };
  }
  anonymousId = undefined;
  if (!eventName) return { ok: false, reason: 'no_event_name' };

  const now = eventTime instanceof Date ? eventTime : new Date();
  const isWebsiteEvent = WEBSITE_EVENT_NAMES.has(eventName);

  let eventData;
  if (isWebsiteEvent) {
    eventData = stripEmpty(await fillFromShopify(eventName, properties ?? {}));
  } else {
    const { topLevel, nested } = shapeEventData(properties);
    eventData = cleanDeep({
      event_type:     toEventType(eventName),
      event_datetime: formatEventDateTime12h(now),
      event_date:     formatEventDate12h(now),
      event_time:     formatEventTime12h(now),
      ...topLevel,
      ...(Object.keys(nested).length ? { details: nested } : {}),
    });
  }

  const body = {
    ...(userId ? { userId: String(userId) } : { anonymousId: String(anonymousId) }),
    eventName: isWebsiteEvent ? eventName : WEBENGAGE_EVENT_NAME,
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
        realEventName: eventName, eventType: eventData.event_type ?? eventName,
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
  userId = toE164India(userId);
  if (!userId) return { ok: false, reason: 'invalid_user_id' };
  anonymousId = undefined;

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
