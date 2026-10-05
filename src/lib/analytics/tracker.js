import { sendToGA } from './gtag';
import { sendToWebEngageServer, upsertWebEngageUserServer } from './webengageBridge';
import { toE164India } from './phoneFormat';
import EVENTS from './events';

const SOURCE_PROPS = { utm_source: 'pos' };
const GUEST_ID = 'guest';

function omitUndefined(obj) {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) result[key] = value;
  }
  return result;
}

function omitNullish(obj) {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined && value !== null) result[key] = value;
  }
  return result;
}

const SESSION_KEY = 'lucira_session';
const EVENTS_KEY  = 'lucira_events';
const AGENT_KEY   = 'lucira_agent_events';
const MAX_EVENTS  = 500;
const eventCaches = new Map(); // key -> array

function getEventCache(key) {
  let cache = eventCaches.get(key);
  if (!cache) {
    cache = safeGet(key) ?? [];
    eventCaches.set(key, cache);
  }
  return cache;
}

function setEventCache(key, events) {
  eventCaches.set(key, events);
  safeSet(key, events);
}

function safeGet(key) {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function safeSet(key, value) {
  try { sessionStorage.setItem(key, JSON.stringify(value)); }
  catch {} // sessionStorage full — silently drop
}

function safeRemove(key) {
  try { sessionStorage.removeItem(key); }
  catch {} // matches safeGet/safeSet's own silent-fail convention
}

// Last 4 digits only. Never send the full number to GA.
function maskMobile(mobile) {
  if (!mobile) return null;
  const digits = String(mobile).replace(/\D/g, '');
  if (digits.length <= 4) return digits;
  return `${'*'.repeat(digits.length - 4)}${digits.slice(-4)}`;
}

const ANON_ID_KEY = 'lucira_anon_id';

function getOrCreateAnonymousId() {
  if (typeof window === 'undefined') return 'anon';
  try {
    let id = localStorage.getItem(ANON_ID_KEY);
    if (!id) {
      id = `anon_${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(ANON_ID_KEY, id);
    }
    return id;
  } catch {
    // Private-mode/blocked storage — same shared-bucket fallback as before,
    // strictly no worse than the old behavior.
    return 'anon';
  }
}

function logEvent(eventName, properties) {
  if (typeof window === 'undefined' || typeof console === 'undefined') return;
  console.log(
    `%c[POS Analytics] ${eventName}`,
    'color:#7c3aed;font-weight:600',
    properties,
  );
}

const tracker = {
  startSession({ customerId, customerName, customerMobile, agentUsername, storeId, storeName, storeCode }) {
    const webengageUserId = toE164India(customerMobile);

    const session = {
      sessionId:      `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      customerId,
      customerName,
      customerMobile,
      webengageUserId,
      agentUsername,
      storeId,
      storeName,
      storeCode,
      startedAt:      new Date().toISOString(),
      userAgent:      typeof navigator !== 'undefined' ? navigator.userAgent : '',
      screenSize:     typeof window !== 'undefined'
        ? `${window.innerWidth}x${window.innerHeight}`
        : '',
    };

    safeSet(SESSION_KEY, session);
    setEventCache(EVENTS_KEY, []);
    
    if (webengageUserId) {
      upsertWebEngageUserServer({ userId: webengageUserId, customerName, customerMobile });
    }

    this.track(EVENTS.SESSION_START, {
      customerId,
      customerMobileMasked: maskMobile(customerMobile),
      storeId,
      storeName,
    });
  },

  /**
   *
   * @param {object} webengageExtra 
   */
  track(eventName, properties = {}, webengageExtra = {}) {
    if (typeof window === 'undefined') return;

    const session = this.getSession();
    const timestamp = new Date().toISOString();
    // Full customerName is kept in this local, on-device event log only —
    // it never reaches sendToGA() below.
    const event = {
      event:          eventName,
      timestamp,
      sessionId:      session?.sessionId ?? null,
      customerName:   session?.customerName ?? null,
      customerId:     session?.customerId ?? null,
      properties,
    };

    const events = getEventCache(EVENTS_KEY);
    if (events.length >= MAX_EVENTS) {
      events.splice(0, events.length - MAX_EVENTS + 1);
    }
    events.push(event);
    safeSet(EVENTS_KEY, events);

    logEvent(eventName, properties);

    sendToGA(eventName, omitUndefined({
      timestamp,
      session_id:            session?.sessionId,
      customer_id:            session?.customerId ?? GUEST_ID,
      customer_mobile_masked: maskMobile(session?.customerMobile),
      store_id:               session?.storeId,
      ...SOURCE_PROPS,
      ...properties,
    }));
    
    sendToWebEngageServer(eventName, omitUndefined({
      timestamp,
      session_id:      session?.sessionId,
      customer_id:     session?.customerId ?? GUEST_ID,
      customer_mobile: session?.customerMobile,
      store_id:        session?.storeId,
      ...SOURCE_PROPS,
      ...properties,
      ...omitNullish(webengageExtra),
    }), {
      userId:      session?.webengageUserId ?? undefined,
      anonymousId: session?.webengageUserId ? undefined : getOrCreateAnonymousId(),
    });
  },

  trackAgent(eventName, properties = {}) {
    if (typeof window === 'undefined') return;
    const timestamp = new Date().toISOString();
    const event = {
      event:     eventName,
      timestamp,
      properties,
    };
    const events = getEventCache(AGENT_KEY);
    if (events.length >= MAX_EVENTS) events.splice(0, 1);
    events.push(event);
    safeSet(AGENT_KEY, events);

    logEvent(eventName, properties);

    sendToGA(eventName, omitUndefined({ timestamp, ...SOURCE_PROPS, ...properties }));
    const agentUsername = properties?.username ?? properties?.agentUsername ?? null;
    sendToWebEngageServer(eventName, omitUndefined({ timestamp, ...SOURCE_PROPS, ...properties }), {
      userId:      agentUsername ? `agent_${agentUsername}` : undefined,
      anonymousId: agentUsername ? undefined : getOrCreateAnonymousId(),
    });
  },

  /**
   *
   * @param {string} gaEventName  — exact GA4 reserved name, e.g. 'purchase'
   * @param {string} posEventName — POS_-prefixed equivalent, e.g. EVENTS.ORDER_PLACED
   * @param {object} params — GA4 ecommerce params (items[], value, currency, ...)
   * @param {object} webengageExtra — OPTIONAL, WebEngage-only detail, passed
   *   straight through to track() — see its jsdoc. Never reaches either GA4
   *   call below (the POS_-prefixed one is the bare-name one), by design.
   */
  trackEcommerce(gaEventName, posEventName, params = {}, webengageExtra = {}) {
    this.track(posEventName, params, webengageExtra);
    logEvent(gaEventName, params);
    const session = this.getSession();
    sendToGA(gaEventName, omitUndefined({
      timestamp: new Date().toISOString(),
      customer_id: session?.customerId ?? GUEST_ID,
      store_id: session?.storeId,
      ...SOURCE_PROPS,
      ...params,
    }));
  },

  isSessionActive() {
    const session = this.getSession();
    return !!session?.customerId;
  },

  getSession() {
    return safeGet(SESSION_KEY);
  },

  getEvents() {
    return getEventCache(EVENTS_KEY);
  },

  getAgentEvents() {
    return getEventCache(AGENT_KEY);
  },

  /**
   * End customer session.
   * @param {'manual' | 'idle_timeout' | 'agent_logout'} reason
   */
  endSession(reason = 'manual') {
    const session = this.getSession();
    if (session) {
      const duration = Date.now() - new Date(session.startedAt).getTime();
      this.track(EVENTS.SESSION_END, {
        reason,
        durationMs:  duration,
        durationMin: Math.round(duration / 60000),
        totalEvents: this.getEvents().length,
        customerId:  session.customerId,
      });
      safeRemove(SESSION_KEY);
    }
  },
  
  flush() {
    const events = this.getEvents();
    setEventCache(EVENTS_KEY, []);
    return events;
  },

  clear() {
    try {
      sessionStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(EVENTS_KEY);
    } catch {}
    eventCaches.delete(EVENTS_KEY);
  },
};

export default tracker;