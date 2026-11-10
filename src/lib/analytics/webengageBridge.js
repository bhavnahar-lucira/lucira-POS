// Security audit finding (Low, 2026-10-05): both debug traces below echo
// back real, UNMASKED customer PII (WebEngage's own payload deliberately
// carries the real mobile/name, unlike the GA-bound copy in tracker.js) to
// the console in every environment, including production on a shared POS
// terminal. Dev-only now.
const isDev = process.env.NODE_ENV !== 'production';

const FLUSH_DELAY_MS = 1000;
const MAX_BATCH = 20;
const queue = [];
let flushTimer = null;

function logResults(batch, status, data) {
  if (!isDev) return;
  const results = Array.isArray(data?.results) ? data.results : [];
  batch.forEach((event, i) => {
    const result = results[i] ?? data;
    const style = result?.ok ? 'color:#16a34a;font-weight:600' : 'color:#dc2626;font-weight:600';
    const label = result?.eventData?.event_type ? `POS_Event -> ${result.eventData.event_type}` : event.eventName;
    console.log(`%c[WebEngage] ${label} (HTTP ${status})`, style, result?.eventData ?? result);
  });
}

function flushQueue() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  while (queue.length) {
    const batch = queue.splice(0, MAX_BATCH);
    fetch('/api/analytics/webengage', {
      method:    'POST',
      headers:   { 'Content-Type': 'application/json' },
      body:      JSON.stringify({ events: batch }),
      keepalive: true,
    })
      .then((res) => res.json().then((data) => logResults(batch, res.status, data)))
      .catch((err) => {
        console.warn('[webengageBridge] send failed', batch.map((e) => e.eventName), err?.message);
      });
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushQueue);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushQueue();
  });
}

export function sendToWebEngageServer(eventName, properties, identity = {}) {
  if (typeof window === 'undefined' || typeof fetch === 'undefined') return;
  queue.push({ eventName, properties, ...identity });
  if (queue.length >= MAX_BATCH) {
    flushQueue();
    return;
  }
  if (!flushTimer) flushTimer = setTimeout(flushQueue, FLUSH_DELAY_MS);
}

export function upsertWebEngageUserServer(params) {
  if (typeof window === 'undefined' || typeof fetch === 'undefined') return;

  fetch('/api/analytics/webengage/user', {
    method:    'POST',
    headers:   { 'Content-Type': 'application/json' },
    body:      JSON.stringify(params),
    keepalive: true,
  })
    .then((res) => res.json().then((data) => {
      if (!isDev) return;
      console.log(
        `%c[WebEngage] user upsert (HTTP ${res.status})`,
        data?.ok ? 'color:#16a34a;font-weight:600' : 'color:#dc2626;font-weight:600',
        { userId: params?.userId ?? params?.anonymousId, ...data },
      );
    }))
    .catch((err) => {
      console.warn('[webengageBridge] user upsert failed', err?.message);
    });
}
