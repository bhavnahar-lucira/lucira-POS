// Store response timers: how long the store takes to forward a ticket once the CAD/workflow team hands it back.
// Only store opening hours count (IST), and time while the ticket is on hold is excluded.
import { TICKET_STATUS } from './constants';

export const RESPONSE_TARGET_MINUTES = 60;
export const STORE_OPEN_MINUTE = 11 * 60;
export const STORE_CLOSE_MINUTE = 22 * 60;

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const IST_OFFSET = 330 * MINUTE;

const ms = (value) => {
  if (value == null) return null;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : null;
};

function openingHours(from, to) {
  const out = [];
  for (let day = Math.floor((from + IST_OFFSET) / DAY) * DAY - IST_OFFSET; day < to; day += DAY) {
    const start = Math.max(from, day + STORE_OPEN_MINUTE * MINUTE);
    const end = Math.min(to, day + STORE_CLOSE_MINUTE * MINUTE);
    if (end > start) out.push([start, end]);
  }
  return out;
}

const holdIntervals = (holds = []) => holds
  .map((h) => [ms(h.held_at), ms(h.resumed_at) ?? Infinity])
  .filter(([s]) => s != null)
  .sort((a, b) => a[0] - b[0]);

function subtract(intervals, cuts) {
  let out = intervals;
  for (const [cs, ce] of cuts) {
    out = out.flatMap(([s, e]) => {
      if (ce <= s || cs >= e) return [[s, e]];
      return [[s, Math.min(e, cs)], [Math.max(s, ce), e]].filter(([a, b]) => b > a);
    });
  }
  return out;
}

const countedIntervals = (from, to, holds) => subtract(openingHours(from, to), holdIntervals(holds));
const total = (intervals) => intervals.reduce((t, [s, e]) => t + (e - s), 0);

export const isOpenNow = (now = Date.now()) => openingHours(now, now + 1).length > 0;
export const activeHold = (holds = []) => holds.find((h) => !h.resumed_at) ?? null;

/** Live figures for one step, `now` in ms. */
export function stepTiming(step, holds = [], now = Date.now()) {
  const start = ms(step.started_at);
  const end = ms(step.ended_at) ?? now;
  if (start == null || end < start) return null;
  const counted = countedIntervals(start, end, holds);
  const workingMs = total(counted);
  const targetMs = RESPONSE_TARGET_MINUTES * MINUTE;

  let delayStartedAt = null;
  let sum = 0;
  for (const [s, e] of counted) {
    if (sum + (e - s) >= targetMs) {
      delayStartedAt = s + (targetMs - sum);
      break;
    }
    sum += e - s;
  }

  const done = step.ended_at != null;
  const late = workingMs > targetMs;
  const onHold = !done && holdIntervals(holds).some(([s, e]) => s <= now && now < e);
  return {
    working_minutes: Math.floor(workingMs / MINUTE),
    delayed_minutes: late ? Math.floor((workingMs - targetMs) / MINUTE) : 0,
    remaining_minutes: late ? 0 : Math.ceil((targetMs - workingMs) / MINUTE),
    hold_minutes: Math.floor(total(subtract(openingHours(start, end), [])) / MINUTE) - Math.floor(workingMs / MINUTE),
    delay_started_at: delayStartedAt ? new Date(delayStartedAt).toISOString() : null,
    state: done ? (late ? 'done_late' : 'done') : onHold ? 'on_hold' : late ? 'delayed' : 'within',
    paused: !done && (onHold || !isOpenNow(now)),
  };
}

const STORE_DAY_MINUTES = STORE_CLOSE_MINUTE - STORE_OPEN_MINUTE;
const plural = (n, unit) => `${n} ${unit}${n === 1 ? '' : 's'}`;

/** Store time as text; a day is one full store day (11 AM – 10 PM) and a month is 30 store days. */
export function formatMinutes(minutes) {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  if (m < STORE_DAY_MINUTES) {
    const h = Math.floor(m / 60);
    return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
  }
  const days = Math.floor(m / STORE_DAY_MINUTES);
  const hours = Math.floor((m % STORE_DAY_MINUTES) / 60);
  if (days < 30) return hours ? `${plural(days, 'day')} ${hours}h` : plural(days, 'day');
  const months = Math.floor(days / 30);
  const rest = days % 30;
  return rest ? `${plural(months, 'month')} ${plural(rest, 'day')}` : plural(months, 'month');
}

const designsOldestFirst = (unit) => [...(unit.designs ?? [])].reverse();
const g2dOldestFirst = (unit) => [...(unit.g2d_estimates ?? [])].reverse();
const decisionLabel = (decision) => (decision === 'approved' ? 'Approved' : 'Changes requested');

function unitSteps(unit, { itemId = null, closedAt = null }) {
  const steps = [];
  const prefix = itemId ? `${itemId}:` : '';
  const product = itemId ? ` · ${itemId}` : '';

  const rounds = g2dOldestFirst(unit);
  rounds.forEach((e, i) => {
    if (!e.at) return;
    steps.push({
      key: `${prefix}g2d:${e.round}`,
      item_id: itemId,
      label: `Estimate round ${e.round}${product}`,
      started_at: e.at,
      ended_at: e.decided_at ?? rounds[i + 1]?.at ?? closedAt,
      outcome: e.decided_at ? decisionLabel(e.customer_decision) : null,
    });
  });

  const designs = designsOldestFirst(unit);
  designs.forEach((d, i) => {
    if (!d.uploaded_at) return;
    steps.push({
      key: `${prefix}design:${d.version}`,
      item_id: itemId,
      label: `Design ${d.label}${product}`,
      started_at: d.uploaded_at,
      ended_at: d.decided_at ?? designs[i + 1]?.uploaded_at ?? closedAt,
      outcome: d.decided_at ? decisionLabel(d.customer_decision) : null,
    });
  });
  return steps;
}

const firstAfter = (start, candidates) => candidates
  .map(ms)
  .filter((t) => t != null && t > ms(start))
  .sort((a, b) => a - b)[0] ?? null;

function legacyFinalSteps(ticket) {
  const received = (ticket.history ?? []).filter((h) => h.action === 'order_created' && h.at).map((h) => h.at);
  if (!received.length && ticket.final_details?.received_at) received.push(ticket.final_details.received_at);
  return received.map((at, i) => {
    const end = firstAfter(at, [
      ...(ticket.final_revisions ?? []).map((r) => r.requested_at),
      ticket.pos_order?.placed_at,
      ticket.cancelled_at,
      received[i + 1],
    ]);
    return {
      key: `final:${i + 1}`,
      item_id: null,
      label: received.length > 1 ? `Final details round ${i + 1}` : 'Final details',
      started_at: at,
      ended_at: end ? new Date(end).toISOString() : null,
      outcome: end && ms(ticket.pos_order?.placed_at) === end ? 'Order placed' : end ? 'Sent back' : null,
    };
  });
}

const latestApprovalAt = (item) => g2dOldestFirst(item).filter((e) => e.customer_decision === 'approved').map((e) => ms(e.decided_at)).filter(Boolean).sort((a, b) => b - a)[0] ?? null;

function multiTicketSteps(ticket) {
  const items = ticket.items ?? [];
  const steps = items.flatMap((item) => unitSteps(item, { itemId: item.item_id, closedAt: item.cancelled_at ?? ticket.cancelled_at ?? null }));
  const active = items.filter((i) => i.status !== TICKET_STATUS.CANCELLED);

  const groups = new Map();
  for (const item of items.filter((i) => i.order_details?.confirmed_at)) {
    const key = ms(item.order_details.confirmed_at);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const confirmStep = (group, endedAt, n) => {
    const start = Math.max(...group.map(latestApprovalAt).filter(Boolean));
    if (!Number.isFinite(start)) return null;
    return {
      key: `confirm:${n}`,
      item_id: null,
      label: n > 1 ? `Order confirmation ${n} · ${group.map((i) => i.item_id).join(', ')}` : 'Order confirmation & advance',
      started_at: new Date(start).toISOString(),
      ended_at: endedAt,
      outcome: endedAt ? 'Confirmed' : null,
    };
  };
  let n = 0;
  for (const [confirmedAt, group] of [...groups.entries()].sort((a, b) => a[0] - b[0])) {
    const step = confirmStep(group, new Date(confirmedAt).toISOString(), ++n);
    if (step) steps.push(step);
  }
  const pending = active.filter((i) => i.status === TICKET_STATUS.G2D_APPROVED);
  if (pending.length && ticket.status === TICKET_STATUS.READY_TO_CONFIRM) {
    const step = confirmStep(pending, null, ++n);
    if (step) steps.push(step);
  }

  const finals = active.map((i) => ms(i.final_details?.received_at));
  if (active.length && finals.every(Boolean) && [TICKET_STATUS.FINAL_RECEIVED, TICKET_STATUS.ORDER_PLACED, TICKET_STATUS.CANCELLED].includes(ticket.status)) {
    const endedAt = ticket.pos_order?.placed_at ?? ticket.cancelled_at ?? null;
    steps.push({
      key: 'final',
      item_id: null,
      label: 'Final details – place order',
      started_at: new Date(Math.max(...finals)).toISOString(),
      ended_at: endedAt,
      outcome: ticket.pos_order?.placed_at ? 'Order placed' : null,
    });
  }
  return steps;
}

/** Every store step of a public ticket (oldest first): when it reached the store and when the store forwarded it. */
export function responseSteps(ticket) {
  const steps = ticket.items
    ? multiTicketSteps(ticket)
    : [...unitSteps(ticket, { closedAt: ticket.cancelled_at ?? null }), ...legacyFinalSteps(ticket)];
  return steps
    .map((s) => ({ ...s, started_at: new Date(s.started_at).toISOString(), ended_at: s.ended_at ? new Date(s.ended_at).toISOString() : null }))
    .sort((a, b) => ms(a.started_at) - ms(b.started_at));
}

/** History lines for each moment a step ran past its target (derived from the step's own timestamps). */
export function delayHistory(steps, holds, now = Date.now()) {
  return steps.flatMap((step) => {
    const timing = stepTiming(step, holds, now);
    if (!timing?.delay_started_at) return [];
    return [{
      action: 'response_delayed',
      at: timing.delay_started_at,
      user: 'System',
      item_id: step.item_id,
      changes: { step: step.label },
    }];
  });
}

/** The open step that most needs attention: delayed first, then the one with least time left. */
export function mostUrgentStep(ticket, now = Date.now()) {
  return (ticket.response_steps ?? [])
    .filter((s) => !s.ended_at)
    .map((s) => ({ step: s, timing: stepTiming(s, ticket.holds, now) }))
    .filter((x) => x.timing)
    .sort((a, b) => (b.timing.delayed_minutes - a.timing.delayed_minutes) || (a.timing.remaining_minutes - b.timing.remaining_minutes))[0] ?? null;
}
