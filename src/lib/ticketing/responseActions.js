// SERVER-ONLY. Hold / resume, and the store response times written to the history when the store forwards a ticket.
import { randomUUID } from 'node:crypto';

import { TICKET_STATUS } from './constants';
import { toPublicTicket } from './normalize';
import { activeHold, stepTiming, RESPONSE_TARGET_MINUTES } from './responseTimer';
import { historyEntry } from './server';

const fail = (error, status = 409) => ({ error, status });
const openSteps = (ticket) => (ticket.response_steps ?? []).filter((s) => !s.ended_at);

export function buildHoldAction({ input, ticket, session, store, now }) {
  const pub = toPublicTicket(ticket);
  if ([TICKET_STATUS.CANCELLED, TICKET_STATUS.ORDER_PLACED].includes(pub.status)) {
    return fail('Only an open ticket can be put on hold or resumed.');
  }
  const base = { env: ticket.env, ticket_number: ticket.ticket_number };
  const current = activeHold(ticket.holds);

  if (input.action === 'hold') {
    if (current) return fail('This ticket is already on hold.');
    const open = openSteps(pub);
    if (!open.length) return fail('Hold is only for a ticket waiting on the store — no store timer is running right now.');
    const step = open.map((s) => s.label).join(', ');
    return {
      filter: { ...base, holds: { $not: { $elemMatch: { resumed_at: null } } } },
      update: {
        $set: { updated_at: now },
        $push: {
          holds: {
            id: randomUUID(),
            reason: input.reason,
            step,
            status: pub.status,
            held_at: now,
            held_by: session.username,
            store_code: store?.company_code ?? null,
            resumed_at: null,
            resumed_by: null,
          },
          history: historyEntry(session, store, 'ticket_on_hold', { reason: input.reason, step }),
        },
      },
    };
  }

  if (!current) return fail('This ticket is not on hold.');
  return {
    filter: { ...base, holds: { $elemMatch: { id: current.id, resumed_at: null } } },
    update: {
      $set: { updated_at: now, 'holds.$[h].resumed_at': now, 'holds.$[h].resumed_by': session.username },
      $push: { history: historyEntry(session, store, 'ticket_resumed', { step: current.step, held_since: current.held_at }) },
    },
    arrayFilters: [{ 'h.id': current.id }],
  };
}

/**
 * After a store action: log the response time of every step it closed, and end any hold — a hold never
 * carries over once the ticket moves on. Returns { update, arrayFilters? } or null.
 */
export function responseFollowUp(before, after, { session, store, now }) {
  const wasOpen = new Set(openSteps(toPublicTicket(before)).map((s) => s.key));
  const pub = toPublicTicket(after);
  const closed = pub.response_steps.filter((s) => s.ended_at && wasOpen.has(s.key));
  if (!closed.length) return null;

  const entries = closed.map((s) => {
    const t = stepTiming(s, after.holds, now.getTime());
    return {
      ...historyEntry(session, store, 'store_response', {
        step: s.label,
        received_at: s.started_at,
        working_minutes: t?.working_minutes ?? null,
        delayed_minutes: t?.delayed_minutes ?? 0,
        hold_minutes: t?.hold_minutes ?? 0,
        target_minutes: RESPONSE_TARGET_MINUTES,
      }),
      item_id: s.item_id,
    };
  });

  const hold = activeHold(after.holds);
  const autoResume = !!hold;
  if (autoResume) {
    entries.push(historyEntry(session, store, 'ticket_resumed', { step: hold.step, held_since: hold.held_at, auto: true }));
  }
  return {
    update: {
      ...(autoResume && { $set: { 'holds.$[h].resumed_at': now, 'holds.$[h].resumed_by': session.username } }),
      $push: { history: { $each: entries } },
    },
    ...(autoResume && { arrayFilters: [{ 'h.id': hold.id }] }),
  };
}
