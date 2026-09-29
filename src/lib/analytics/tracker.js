// src/lib/analytics/tracker.js
//
// Lightweight analytics tracker for Lucira POS.
// Session = customer session (NOT agent session). Agent login is a
// standalone event, not a session.
//
// Session lifecycle:
//   tracker.startSession(customer, agent, store)  → customer attached
//   tracker.track(event, props)                    → during session
//   tracker.endSession(reason)                     → customer detached / idle
//
// Every event goes to four places: sessionStorage (local debug/QA buffer —
// see getEvents()/getAgentEvents()), GA4 via sendToGA(), WebEngage via
// sendToWebEngage(), and the browser console (filter devtools by
// "[POS Analytics]" to watch events fire live). GA4/WebEngage fire from the
// same call with the same event name and properties (EVENTS from events.js)
// so they can never drift apart — see docs/analytics-integration.md for the
// full architecture writeup.
//
// trackEcommerce() is for the checkout funnel — fires both the GA4-reserved
// name (view_item/add_to_cart/purchase/...) so GA4's automatic
// Monetization/Ecommerce reports populate, and the POS_-prefixed equivalent
// for custom analysis. See events.js.
//
// SOURCE TAGGING — every event carries utm_source: 'pos' (SOURCE_PROPS
// below) so POS traffic stays filterable if this GA4/WebEngage account ever
// also receives traffic from elsewhere (e.g. the Shopify storefront). GA4
// also gets this as a user_property set once in layout.js's init script, to
// cover its own automatically-collected events.
//
// PII — GA4's terms prohibit sending personally identifiable information
// (name, email, full phone). The full customerName/customerMobile stay in
// the LOCAL sessionStorage session object only; sendToGA() only ever gets
// the opaque customerId plus a masked mobile (last 4 digits). Never add
// customerName/customerEmail to a sendToGA() payload.
//
// WebEngage is the deliberate OPPOSITE — it's a CRM platform whose purpose
// IS identifying real people (see upsertWebEngageUserServer() in
// startSession() below, which sends full name/phone GA4 never gets).

import { sendToGA } from './gtag';
// As of 2026-09-28, WebEngage identity AND events both go through the REST
// API bridge — the old client Web SDK (webengage.js, now deleted) never
// worked on this tenant's domain at all: it console-errored
// ("incorrectly configured") on every single page load, independent of
// whether any event ever fired. See webengageServer.js's header for the
// full why and webengageBridge.js for the browser-side half of both calls.
import { sendToWebEngageServer, upsertWebEngageUserServer } from './webengageBridge';
import { toE164India } from './phoneFormat';
import EVENTS from './events';

// Applied to EVERY event sent to GA4/WebEngage — see "SOURCE TAGGING" above.
// Not applied to the sessionStorage buffer or the console log: those are
// for on-device debugging, where every event is already known to be from
// this app, so the tag would be pure noise.
const SOURCE_PROPS = { utm_source: 'pos' };

// Sent explicitly for any event fired before a customer is attached (e.g.
// browsing the catalog), instead of omitting customer_id — so segmenting by
// customer_id (a real POS-internal id, or this literal string) always
// works, and "guest" is distinguishable from "id failed to reach this call".
const GUEST_ID = 'guest';

// Session-derived fields (session_id/customer_id/customer_mobile) are
// legitimately absent before a customer is attached. An object literal with
// a key explicitly set to `undefined` still HAS that key — gtag() tolerates
// this silently, but WebEngage's SDK does strict per-attribute type-checking
// and logs "unsupported type undefined" for each one. Strip them before
// either destination sees the object.
function omitUndefined(obj) {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) result[key] = value;
  }
  return result;
}

// Drops null AND undefined — stricter than omitUndefined() above, and used
// ONLY on the optional `webengageExtra` bag, which callers build by
// spreading raw objects full of legitimately-null fields (e.g. a piece with
// no diamond has diamond_amount: null). WebEngage's SDK only accepts
// string/number/boolean/Date per attribute, and a stray null triggers the
// same "unsupported type" warning undefined does. properties/params (the
// GA4-shared payload) keep their own looser omitUndefined() — changing that
// risks changing what GA4 receives.
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

// PERF — in-memory mirror of each sessionStorage event buffer, so
// track()/trackAgent() don't pay a full JSON.parse of up to MAX_EVENTS
// entries on every single call. Lazily hydrated from sessionStorage on
// first access per key; every push still calls safeSet() to persist (so a
// reload or the console QA tools still see the latest buffer) — only the
// redundant re-parse is avoided.
//
// Every place that RESETS a buffer (flush(), clear(), a fresh
// startSession()) must go through setEventCache() below, never a bare
// safeSet() — otherwise the in-memory cache would keep pointing at the old
// array and the next track() call would append to stale data instead of
// noticing the reset.
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

// One stable pseudo-identity per BROWSER (localStorage, not sessionStorage —
// survives reloads and new tabs on the same device), used as WebEngage's
// anonymousId whenever there's no phone-derived webengageUserId (no customer
// attached yet, or a customer with no mobile on file). Without this, every
// such event fell back to the literal string 'anon' — meaning every agent on
// every device browsing before attaching a customer landed on ONE shared
// WebEngage profile (reported directly, confirmed a real gap, not by design).
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

// Prints every fired event to the browser console for manual QA — filter
// devtools by "[POS Analytics]". Always on — internal staff tool, not a
// public storefront, so console noise isn't a concern.
function logEvent(eventName, properties) {
  if (typeof window === 'undefined' || typeof console === 'undefined') return;
  console.log(
    `%c[POS Analytics] ${eventName}`,
    'color:#7c3aed;font-weight:600',
    properties,
  );
}

const tracker = {

  /**
   * Start a new customer session.
   * Called when customer is attached to cart.
   */
  startSession({ customerId, customerName, customerMobile, agentUsername, storeId, storeName, storeCode }) {
    // WebEngage identity is the customer's E.164 MOBILE NUMBER, not our own
    // internal customerId (OrnaVerse's party_id) — confirmed live (2026-09-28)
    // that keying by party_id creates a SEPARATE WebEngage profile per
    // channel (this POS vs. the Shopify storefront's own integration), since
    // party_id only exists inside our ERP and neither system can derive the
    // other's internal id. Phone is the one identifier both channels can
    // independently arrive at for the same real person, so events now land
    // on whatever profile already exists for that number instead of forking
    // a new one. Stored on the session (not recomputed per-event) so every
    // event during this session agrees with the identity startSession()
    // already told WebEngage about.
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

    // Identify the customer to WebEngage BEFORE the SESSION_START event
    // fires, so that event (and everything after it) is already attached
    // to the right profile. GA4 never gets this call — see the PII note above.
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
   * Log an event — buffered locally AND sent to GA4 + WebEngage.
   * Includes session context (customer/store) when one is active; still
   * logs with nulls when it isn't, since tracking now runs from login
   * onward, not just during an attached customer session.
   *
   * @param {object} webengageExtra — OPTIONAL, additional properties sent
   *   ONLY to WebEngage, never GA4. For events that need to carry real
   *   detail — full product attributes, a price breakup, customer PII, the
   *   active store's company id/code — that GA4's PII terms forbid mixing
   *   into `properties` above (see the PII note at the top of this file).
   *   Kept as a separate argument rather than folded into `properties` so
   *   there is no way for a future edit to accidentally widen what GA4
   *   receives; see PRODUCT_VIEWED on the product detail page for the
   *   intended shape of this bag.
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
      // `...properties` below still wins when a caller passes its own
      // store_id (e.g. a cross-store lookup), same override rule as customer_id.
      store_id:               session?.storeId,
      ...SOURCE_PROPS,
      ...properties,
    }));

    // Same event, same properties, second destination — now via the REST
    // API bridge (see this file's top import comment), not the client SDK.
    // customer_id/mobile here are for filtering this event stream without a
    // profile join. No PII restriction on this destination, so the full
    // (unmasked) mobile is fine here even though GA above gets a masked one.
    // userId identifies the WebEngage profile server-side (the customer's
    // E.164 mobile — see startSession()) — falls back to a persistent
    // per-browser anonymousId (getOrCreateAnonymousId() above) before any
    // customer is attached, or for one with no mobile on file.
    sendToWebEngageServer(eventName, omitUndefined({
      timestamp,
      session_id:      session?.sessionId,
      customer_id:     session?.customerId ?? GUEST_ID,
      customer_mobile: session?.customerMobile,
      store_id:        session?.storeId,
      ...SOURCE_PROPS,
      ...properties,
      // Extra, WebEngage-only detail — see this method's jsdoc. Spread last
      // so a richer explicit value (e.g. a real customer_mobile from the
      // caller) wins over the session-derived default above, never the
      // other way round.
      ...omitNullish(webengageExtra),
    }), {
      userId:      session?.webengageUserId ?? undefined,
      anonymousId: session?.webengageUserId ? undefined : getOrCreateAnonymousId(),
    });
  },

  /**
   * Log an agent-level event (not tied to a customer session).
   * Stored in a separate key so it doesn't mix with customer events.
   */
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
    // Agent-level events have no customer session to derive an id from —
    // identified by username when the caller included one (AGENT_LOGIN/
    // AGENT_LOGOUT/AGENT_IDLE_LOGOUT all do), else an anonymous bucket
    // rather than dropping the event.
    const agentUsername = properties?.username ?? properties?.agentUsername ?? null;
    sendToWebEngageServer(eventName, omitUndefined({ timestamp, ...SOURCE_PROPS, ...properties }), {
      userId:      agentUsername ? `agent_${agentUsername}` : undefined,
      anonymousId: agentUsername ? undefined : getOrCreateAnonymousId(),
    });
  },

  /**
   * Checkout-funnel events — fires under BOTH the GA4-reserved ecommerce
   * name (so GA4's built-in Monetization/Ecommerce reports work) and the
   * POS_-prefixed custom name (so it's identifiable as POS traffic in your
   * own Explore reports). Use for view_item/add_to_cart/begin_checkout/
   * add_payment_info/purchase — see GA_ECOMMERCE_EVENTS in events.js.
   *
   * @param {string} gaEventName  — exact GA4 reserved name, e.g. 'purchase'
   * @param {string} posEventName — POS_-prefixed equivalent, e.g. EVENTS.ORDER_PLACED
   * @param {object} params — GA4 ecommerce params (items[], value, currency, ...)
   * @param {object} webengageExtra — OPTIONAL, WebEngage-only detail, passed
   *   straight through to track() — see its jsdoc. Never reaches either GA4
   *   call below (the POS_-prefixed one is the bare-name one), by design.
   */
  trackEcommerce(gaEventName, posEventName, params = {}, webengageExtra = {}) {
    // Fires the POS_-prefixed name to sessionStorage + GA4 + WebEngage +
    // console — see track() above. Only the bare GA4-reserved name below
    // needs its own extra call, since GA4 (not WebEngage) is the only
    // destination that treats that exact string specially.
    this.track(posEventName, params, webengageExtra);
    logEvent(gaEventName, params);     // also log the GA-reserved-name fire
    // Mirrors track()'s own session-or-guest logic so the reserved-name
    // event and its POS_-prefixed twin always agree on who viewed/bought.
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
      // No client-SDK "logout" call needed anymore — every REST event now
      // carries its own explicit userId/anonymousId per call (see track()),
      // so clearing the local session object below is what actually stops
      // the next customer at this shared counter from being misattributed;
      // there's no persisted client-side identity left to reset.
      // Removes the session object (customerId/name/mobile) from
      // sessionStorage on detach, not just on a full agent logout — a
      // shared counter must not leave a departing customer's data readable
      // until the next startSession() happens to overwrite it.
      safeRemove(SESSION_KEY);
    }
  },

  /**
   * Flush customer events — returns all and clears buffer.
   * Use when sending batch to WebEngage / GA.
   */
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
    // Keep the in-memory mirror consistent with the storage clear above —
    // otherwise the next track() call would keep appending to a stale
    // cache entry. Only EVENTS_KEY: clear() never touches AGENT_KEY.
    eventCaches.delete(EVENTS_KEY);
  },
};

export default tracker;