import { getSessionFromRequest } from '@/lib/ornaverse/session';
import { sendServerEventToWebEngage } from '@/lib/analytics/webengageServer';
import { checkRateLimit } from '@/lib/security/rateLimit';
import EVENTS, { WEBENGAGE_EVENTS } from '@/lib/analytics/events';

// SECURITY (2026-10-19): this route trusted eventName/properties/userId
// verbatim from the client with no allowlist — any authenticated session
// (not just an anonymous attacker, since this does require real login) could
// inject an arbitrary event, under ANY customer's userId, with arbitrary
// properties. Worst case was spamming a real customer's WebEngage-driven
// journeys (emails/SMS), not a data breach, but worth closing cheaply: the
// app itself only EVER sends one of the fixed EVENTS.* values (see
// webengageBridge.js, the only caller) — a stray/forged eventName outside
// that set can only be someone bypassing the UI, so it's safe to reject.
const KNOWN_EVENT_NAMES = new Set([...Object.values(EVENTS), ...Object.values(WEBENGAGE_EVENTS)]);
const RATE_LIMIT = { limit: 120, windowMs: 60 * 1000 };
const MAX_BATCH = 25;

export async function POST(request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return Response.json({ ok: false, error: 'not_authenticated' }, { status: 401 });
  }

  const limit = checkRateLimit(`webengage-event:${session.cookie}`, RATE_LIMIT);
  if (!limit.allowed) {
    return Response.json(
      { ok: false, error: 'too_many_requests' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const events = Array.isArray(payload?.events) ? payload.events : [payload];
  if (!events.length || events.length > MAX_BATCH) {
    return Response.json({ ok: false, error: 'invalid_batch_size' }, { status: 400 });
  }

  const results = await Promise.all(events.map(async (event) => {
    const { eventName, properties, userId } = event ?? {};
    if (!eventName) return { ok: false, reason: 'eventName_required' };
    if (!KNOWN_EVENT_NAMES.has(eventName)) return { ok: false, reason: 'unknown_event_name', eventName };
    return sendServerEventToWebEngage({ userId, eventName, properties });
  }));

  const anyOk = results.some((r) => r.ok);
  return Response.json({ ok: results.every((r) => r.ok), results }, { status: anyOk ? 200 : 502 });
}
