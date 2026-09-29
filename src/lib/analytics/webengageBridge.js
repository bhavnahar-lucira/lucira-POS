// src/lib/analytics/webengageBridge.js
//
// Browser-side half of the WebEngage REST migration (2026-09-28). Every
// tracker.track()/trackAgent() call now reaches WebEngage through THIS
// function instead of the old client-side Web SDK call (webengage.js) —
// this only ever POSTs to our own same-origin API route
// (/api/analytics/webengage), which holds the real WebEngage API key
// server-only (see webengageServer.js). Never talk to WebEngage's own API
// host from here; the key must never reach the browser.
//
// Fire-and-forget by design — tracking must never block or break the app
// (see tracker.js's own header). `keepalive: true` lets the request survive
// a navigation that happens right after (e.g. an order-success redirect, a
// forced logout) — without it, the browser can cancel an in-flight fetch
// the instant the page starts navigating away.

export function sendToWebEngageServer(eventName, properties, identity = {}) {
  if (typeof window === 'undefined' || typeof fetch === 'undefined') return;

  fetch('/api/analytics/webengage', {
    method:    'POST',
    headers:   { 'Content-Type': 'application/json' },
    body:      JSON.stringify({ eventName, properties, ...identity }),
    keepalive: true,
  })
    .then((res) => res.json().then((data) => ({ status: res.status, data })))
    .then(({ status, data }) => {
      // The one place the REAL shaped payload WebEngage received is visible
      // (eventData comes back from webengageServer.js — never the API key) —
      // filter devtools by "[WebEngage]" to check event_type/price/image
      // fields actually landed as expected.
      //
      // Label reads "POS_Event -> <event_type>" on purpose, NOT the raw local
      // eventName — every call, whatever the local action name, always POSTs
      // as ONE WebEngage eventName ("POS_Event", see webengageServer.js's
      // WEBENGAGE_EVENT_NAME); the real action only ever travels as
      // eventData.event_type. Logging the local name bare here made it look
      // like distinct events were reaching WebEngage (reported directly) —
      // they aren't; this is the single custom event WebEngage's dashboard
      // will ever show, filterable by its event_type attribute.
      const style = data?.ok ? 'color:#16a34a;font-weight:600' : 'color:#dc2626;font-weight:600';
      const eventType = data?.eventData?.event_type ?? eventName;
      console.log(`%c[WebEngage] POS_Event -> ${eventType} (HTTP ${status})`, style, data?.eventData ?? data);
    })
    .catch((err) => {
      // Never let a tracking failure surface anywhere the operator would see it.
      console.warn('[webengageBridge] send failed', eventName, err?.message);
    });
}

// Server-side replacement for the old client SDK's user.login()/
// setAttribute() calls — see /api/analytics/webengage/user/route.js and
// webengageServer.js's upsertWebEngageUser for the "why" (that SDK path
// console-errored on load on this tenant's domain, unrelated to whether any
// event ever fired). Fire-and-forget, same rationale as events above.
export function upsertWebEngageUserServer(params) {
  if (typeof window === 'undefined' || typeof fetch === 'undefined') return;

  fetch('/api/analytics/webengage/user', {
    method:    'POST',
    headers:   { 'Content-Type': 'application/json' },
    body:      JSON.stringify(params),
    keepalive: true,
  })
    .then((res) => res.json().then((data) => console.log(
      `%c[WebEngage] user upsert (HTTP ${res.status})`,
      data?.ok ? 'color:#16a34a;font-weight:600' : 'color:#dc2626;font-weight:600',
      { userId: params?.userId ?? params?.anonymousId, ...data },
    )))
    .catch((err) => {
      console.warn('[webengageBridge] user upsert failed', err?.message);
    });
}
