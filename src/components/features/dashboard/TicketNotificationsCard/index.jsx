'use client';

import Link from 'next/link';
import { ClipboardCheck, ClipboardList, Clock, PenTool } from 'lucide-react';

import { useTicketNotifications } from '@/hooks/ticketing/useTickets';
import { ticketHref } from '@/components/features/ticketing/TicketList';

function NoticeRow({ href, icon: Icon, tone, children }) {
  return (
    <Link
      href={href}
      className={`flex items-start gap-3 rounded-xl border p-3 text-sm transition-colors hover:shadow-sm ${tone}`}
    >
      <Icon size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1">{children}</span>
      <span className="shrink-0 text-xs font-semibold underline-offset-2 hover:underline">View</span>
    </Link>
  );
}

/** Shown only to the store that raised each ticket, until someone acts on it. */
export default function TicketNotificationsCard() {
  const { data } = useTicketNotifications();
  const g2dShared = data?.g2dShared ?? [];
  const designReady = data?.designReady ?? [];
  const finalReceived = data?.finalReceived ?? [];
  const cadOverdue = data?.cadOverdue ?? [];
  if (!g2dShared.length && !designReady.length && !finalReceived.length && !cadOverdue.length) return null;

  return (
    <div className="flex flex-col gap-2">
      {g2dShared.map((t) => (
        <NoticeRow
          key={t.ticket_number}
          href={ticketHref(t.ticket_number)}
          icon={ClipboardList}
          tone="border-violet-300 bg-violet-50 text-violet-900 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-100"
        >
          The CAD team has shared the G2D estimate for <strong>{t.ticket_number}</strong>
          {t.customer_name ? ` · ${t.customer_name}` : ''}, kindly confirm with the customer.
        </NoticeRow>
      ))}
      {designReady.map((t) => (
        <NoticeRow
          key={t.ticket_number}
          href={ticketHref(t.ticket_number)}
          icon={PenTool}
          tone="border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100"
        >
          The CAD team has shared design {t.latest_design_label} for <strong>{t.ticket_number}</strong>
          {t.customer_name ? ` · ${t.customer_name}` : ''}, kindly view.
        </NoticeRow>
      ))}
      {finalReceived.map((t) => (
        <NoticeRow
          key={t.ticket_number}
          href={ticketHref(t.ticket_number)}
          icon={ClipboardCheck}
          tone="border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100"
        >
          Final details for <strong>{t.ticket_number}</strong>
          {t.customer_name ? ` · ${t.customer_name}` : ''} have been received, kindly review and place the order.
        </NoticeRow>
      ))}
      {cadOverdue.map((t) => (
        <NoticeRow
          key={t.ticket_number}
          href={ticketHref(t.ticket_number)}
          icon={Clock}
          tone="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
        >
          <strong>{t.ticket_number}</strong>{t.customer_name ? ` · ${t.customer_name}` : ''} has been waiting{' '}
          {t.days_waiting} days for the CAD team and requires attention.
        </NoticeRow>
      ))}
    </div>
  );
}
