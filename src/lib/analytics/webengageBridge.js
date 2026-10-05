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
      const style = data?.ok ? 'color:#16a34a;font-weight:600' : 'color:#dc2626;font-weight:600';
      const eventType = data?.eventData?.event_type ?? eventName;
      console.log(`%c[WebEngage] POS_Event -> ${eventType} (HTTP ${status})`, style, data?.eventData ?? data);
    })
    .catch((err) => {
      console.warn('[webengageBridge] send failed', eventName, err?.message);
    });
}

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
