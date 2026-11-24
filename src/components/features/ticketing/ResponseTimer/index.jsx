'use client';

import { useEffect, useState } from 'react';
import { PauseCircle, PlayCircle, Timer } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  RESPONSE_TARGET_MINUTES, activeHold, formatMinutes, mostUrgentStep, stepTiming,
} from '@/lib/ticketing/responseTimer';

// Holds saved before the wording change still carry 'G2D estimate round N'.
const stepText = (step) => step?.replace(/G2D estimate/g, 'Estimate').replace(/G2D/g, 'Estimate');

const HOLD_REASONS = ['Customer not responding', 'Customer asked to wait', 'Customer unavailable / travelling'];

const TONES = {
  within: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  delayed: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
  on_hold: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  done: 'bg-muted text-muted-foreground',
  done_late: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300',
};

const fmtTime = (value) => (value
  ? new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  : '—');

const fmtDateTime = (value) => (value
  ? new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—');

/** Current time, refreshed every interval; never earlier than `notBefore` (e.g. the ticket's last update). */
export function useNow(intervalMs = 30 * 1000, notBefore = null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  const floor = notBefore ? new Date(notBefore).getTime() : 0;
  return Number.isFinite(floor) && floor > now ? floor : now;
}

export function timingText(timing) {
  if (!timing) return '—';
  const paused = timing.paused && timing.state !== 'on_hold' ? ' · paused (store closed)' : '';
  switch (timing.state) {
    case 'within': return `${formatMinutes(timing.remaining_minutes)} left${paused}`;
    case 'delayed': return `Delayed ${formatMinutes(timing.delayed_minutes)}${paused}`;
    case 'on_hold': return `On hold · ${timing.delayed_minutes ? `delayed ${formatMinutes(timing.delayed_minutes)}` : `${formatMinutes(timing.remaining_minutes)} left`}`;
    case 'done_late': return `Responded in ${formatMinutes(timing.working_minutes)} · ${formatMinutes(timing.delayed_minutes)} late`;
    default: return `Responded in ${formatMinutes(timing.working_minutes)}`;
  }
}

export function ResponseBadge({ timing, label }) {
  if (!timing) return null;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${TONES[timing.state]}`}>
      <Timer size={12} aria-hidden="true" />
      {label ? `${label}: ` : ''}{timingText(timing)}
    </span>
  );
}

/** The most urgent open step of a ticket, for lists and headers. */
export function UrgentResponseBadge({ ticket, now, withLabel = false }) {
  const urgent = mostUrgentStep(ticket, now);
  if (!urgent) return null;
  return <ResponseBadge timing={urgent.timing} label={withLabel ? urgent.step.label : null} />;
}

function HoldDialog({ isOpen, onOpenChange, isPending, onConfirm }) {
  const [text, setText] = useState('');
  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) setText(''); onOpenChange(open); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Put this ticket on hold?</DialogTitle>
          <DialogDescription>
            The store response timer pauses until the ticket is resumed. HO is notified, and the hold is recorded in the history with the current step.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          {HOLD_REASONS.map((r) => (
            <Button key={r} type="button" size="sm" variant={text === r ? 'default' : 'outline'} onClick={() => setText(r)}>{r}</Button>
          ))}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ticket-hold-reason">Reason <span className="text-destructive">*</span></Label>
          <Textarea id="ticket-hold-reason" rows={3} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" className="h-11" onClick={() => onOpenChange(false)}>Back</Button>
          <Button type="button" className="h-11" disabled={isPending || text.trim().length < 3} onClick={() => onConfirm(text.trim())}>
            {isPending ? 'Saving…' : 'Put on hold'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Hold / Resume button for the ticket header; Hold only while a store timer is running. */
export function HoldButton({ ticket, run, isPending }) {
  const [open, setOpen] = useState(false);
  const hold = activeHold(ticket.holds);
  if (hold) {
    return (
      <Button type="button" className="h-11 gap-1.5 bg-amber-500 text-white hover:bg-amber-600 hover:text-white" disabled={isPending} onClick={() => run({ action: 'resume' }, 'Ticket resumed — the response timer is running again.')}>
        <PlayCircle size={16} aria-hidden="true" /> Resume ticket
      </Button>
    );
  }
  if (!(ticket.response_steps ?? []).some((s) => !s.ended_at)) return null;
  return (
    <>
      <Button type="button" variant="outline" className="h-11 gap-1.5 border-amber-400 text-amber-800 hover:bg-amber-50 dark:text-amber-200 dark:hover:bg-amber-950/40" onClick={() => setOpen(true)}>
        <PauseCircle size={16} aria-hidden="true" /> Put on hold
      </Button>
      <HoldDialog
        isOpen={open}
        onOpenChange={setOpen}
        isPending={isPending}
        onConfirm={(reason) => run({ action: 'hold', reason }, 'Ticket put on hold.', () => setOpen(false))}
      />
    </>
  );
}

/** Banner while the ticket is on hold, plus the live timer of each step waiting on the store. */
export function ResponseStatusBar({ ticket }) {
  const now = useNow(30 * 1000, ticket.updated_at);
  const hold = activeHold(ticket.holds);
  const open = (ticket.response_steps ?? []).filter((s) => !s.ended_at);
  if (!hold && !open.length) return null;
  return (
    <div className={`flex flex-col gap-2 rounded-xl border p-4 text-sm ${hold ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100' : 'border-border bg-card'}`}>
      {hold && (
        <p>
          <strong>On hold</strong> since {fmtTime(hold.held_at)} by {hold.held_by}{hold.store_code ? ` (${hold.store_code})` : ''} · at {stepText(hold.step)}
          <span className="block whitespace-pre-line text-xs">Reason: {hold.reason}</span>
        </p>
      )}
      {open.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap gap-2">
            {open.map((s) => <ResponseBadge key={s.key} timing={stepTiming(s, ticket.holds, now)} label={s.label} />)}
          </div>
        </div>
      )}
    </div>
  );
}

/** Every step that came to the store: when it arrived, when it was forwarded and how long it took. */
export function ResponseTimesCard({ ticket, Card }) {
  const now = useNow(30 * 1000, ticket.updated_at);
  const steps = [...(ticket.response_steps ?? [])].reverse();
  const holds = ticket.holds ?? [];
  if (!steps.length && !holds.length) return null;
  return (
    <Card title="Store response times">
      <ul className="flex flex-col divide-y divide-border text-sm">
        {steps.map((s) => {
          const timing = stepTiming(s, holds, now);
          return (
            <li key={s.key} className="flex flex-col gap-1 py-2 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{s.label}</span>
                <ResponseBadge timing={timing} />
              </div>
              <span className="text-xs text-muted-foreground">
                Received {fmtTime(s.started_at)} · {s.ended_at ? `forwarded ${fmtTime(s.ended_at)}${s.outcome ? ` (${s.outcome})` : ''}` : 'waiting on the store'}
                {timing?.hold_minutes ? ` · ${formatMinutes(timing.hold_minutes)} on hold` : ''}
              </span>
            </li>
          );
        })}
      </ul>
      {holds.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-border pt-2 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">Holds</p>
          {holds.map((h) => (
            <p key={h.id}>
              {fmtTime(h.held_at)} → {h.resumed_at ? fmtTime(h.resumed_at) : 'still on hold'} · {stepText(h.step)} · {h.reason}
            </p>
          ))}
        </div>
      )}
    </Card>
  );
}

export const RESPONSE_ACTION_LABELS = {
  ticket_on_hold: 'Ticket put on hold',
  ticket_resumed: 'Ticket resumed',
  store_response: 'Store response time recorded',
  response_delayed: `Store response passed ${RESPONSE_TARGET_MINUTES} min – delay timer started`,
};

/** Extra lines under a hold / response history entry. */
export function ResponseHistoryDetail({ entry }) {
  const c = entry.changes ?? {};
  if (entry.action === 'store_response') {
    return (
      <>
        <p className="text-xs text-muted-foreground">
          {c.step} · received {fmtDateTime(c.received_at)} · responded {fmtDateTime(entry.at)} by {entry.user}
        </p>
        <p className={`text-xs ${c.delayed_minutes ? 'text-red-700 dark:text-red-300' : 'text-muted-foreground'}`}>
          Response time {formatMinutes(c.working_minutes ?? 0)}{c.delayed_minutes ? ` (${formatMinutes(c.delayed_minutes)} late)` : ' (on time)'}
          {c.hold_minutes ? ` · ${formatMinutes(c.hold_minutes)} on hold` : ''}
        </p>
      </>
    );
  }
  if (['ticket_on_hold', 'ticket_resumed', 'response_delayed'].includes(entry.action)) {
    return (
      <p className="text-xs text-muted-foreground">
        {c.step ? `At ${stepText(c.step)}` : ''}
        {c.auto ? ' · resumed automatically when the ticket moved on' : ''}
      </p>
    );
  }
  return null;
}
