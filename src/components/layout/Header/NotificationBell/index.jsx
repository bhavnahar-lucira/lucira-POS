'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, useReducedMotion } from 'motion/react';
import { Bell, BellOff } from 'lucide-react';

import { Button } from '@/components/ui/button';
import BottomSheet from '@/components/shared/BottomSheet';
import TicketNotificationsList from '@/components/features/ticketing/TicketNotificationsList';
import { EventRow } from '@/components/features/dashboard/UpcomingEventsCard';
import { useTicketNotifications } from '@/hooks/ticketing/useTickets';
import { useUpcomingEvents } from '@/hooks/dashboard/useUpcomingEvents';

const SEEN_KEY = 'pos.ticketNotificationsSeen';
const SHAKE = { rotate: [0, -16, 14, -10, 8, -4, 0] };

// Overdue reminders and future birthdays are excluded: they are not news, so they never make the bell shake.
function newsKeys(data, todayEvents) {
  const today = new Date().toDateString();
  return [
    ...todayEvents.map((e) => `${e.type}:${e.partyId}:${today}`),
    ...(data?.g2dShared ?? []).map((t) => `g2d:${t.ticket_number}`),
    ...(data?.designReady ?? []).map((t) => `design:${t.ticket_number}:${t.latest_design_label}`),
    ...(data?.finalReceived ?? []).map((t) => `final:${t.ticket_number}`),
  ];
}

function readSeen() {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]'));
  } catch {
    return new Set();
  }
}

function writeSeen(keys) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(keys));
  } catch {}
}

function EventSection({ title, events, onSelect }) {
  if (!events.length) return null;
  return (
    <section className="mt-5 first:mt-0">
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <div className="divide-y divide-border">
        {events.map((event) => (
          <EventRow key={`${event.type}-${event.partyId}`} event={event} onSelect={() => onSelect(event)} />
        ))}
      </div>
    </section>
  );
}

export default function NotificationBell() {
  const router = useRouter();
  const { data } = useTicketNotifications();
  const { birthdays, anniversaries } = useUpcomingEvents();
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(readSeen);
  const reduceMotion = useReducedMotion();

  const todayEvents = [...birthdays, ...anniversaries].filter((e) => e.isToday);
  const keys = newsKeys(data, todayEvents);
  const total = keys.length + (data?.cadOverdue?.length ?? 0);
  const ticketCount = total - todayEvents.length;
  const hasEvents = birthdays.length + anniversaries.length > 0;
  const openCustomer = (event) => {
    setOpen(false);
    router.push(`/customers/${event.partyId}?name=${encodeURIComponent(event.name ?? '')}`);
  };
  const hasUnseen = keys.some((k) => !seen.has(k));

  const handleOpenChange = (next) => {
    setOpen(next);
    if (next) {
      writeSeen(keys);
      setSeen(new Set(keys));
    }
  };

  const countLabel = total > 99 ? '99+' : total;

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="relative min-h-[44px] min-w-[44px]"
        onClick={() => handleOpenChange(true)}
        aria-label={`Notifications — ${total} pending${hasUnseen ? ', new updates' : ''}`}
      >
        <motion.span
          className="flex"
          style={{ transformOrigin: '50% 10%' }}
          animate={hasUnseen && !reduceMotion ? SHAKE : { rotate: 0 }}
          transition={hasUnseen && !reduceMotion
            ? { duration: 0.9, repeat: Infinity, repeatDelay: 45 }
            : { duration: 0.2 }}
        >
          <Bell size={20} aria-hidden="true" />
        </motion.span>
        {total > 0 && (
          <span
            className={`pointer-events-none absolute top-0.5 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-bold ${
              hasUnseen ? 'bg-destructive text-white' : 'bg-primary text-primary-foreground'
            }`}
            aria-hidden="true"
          >
            {countLabel}
          </span>
        )}
      </Button>

      <BottomSheet isOpen={open} onClose={() => setOpen(false)} title="Notifications">
        <p className="mb-4 text-sm text-muted-foreground">
          {total > 0 ? `${total} ${total === 1 ? 'item needs' : 'items need'} attention` : 'You are all caught up'}
        </p>
        {ticketCount > 0 || hasEvents ? (
          <>
            {ticketCount > 0 && (
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tickets</h3>
                <TicketNotificationsList data={data} onNavigate={() => setOpen(false)} />
              </section>
            )}
            <EventSection title="Birthdays · next 15 days" events={birthdays} onSelect={openCustomer} />
            <EventSection title="Anniversaries · next 15 days" events={anniversaries} onSelect={openCustomer} />
          </>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
            <BellOff size={22} aria-hidden="true" />
            <p className="text-sm">No updates right now.</p>
          </div>
        )}
      </BottomSheet>
    </>
  );
}
