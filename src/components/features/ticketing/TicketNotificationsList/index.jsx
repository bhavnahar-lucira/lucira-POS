'use client';

import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { ClipboardCheck, ClipboardList, Clock, MessageSquare, PauseCircle, PenTool, PlayCircle, Timer, Wallet } from 'lucide-react';

import { ticketHref } from '@/components/features/ticketing/TicketList';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { formatMinutes } from '@/lib/ticketing/responseTimer';

function NoticeRow({ href, icon: Icon, tone, onNavigate, children }) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={`flex items-start gap-3 rounded-xl border p-3 text-sm transition-colors hover:shadow-sm ${tone}`}
    >
      <Icon size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1">{children}</span>
      <span className="shrink-0 text-xs font-semibold underline-offset-2 hover:underline">View</span>
    </Link>
  );
}

const productText = (t) => (t.item_id ? ` (${t.item_id}${t.item_category ? ` · ${t.item_category}` : ''})` : '');
const storeText = (t) => (t.store_code ? ` (${t.store_code})` : '');
const noticeHref = (t) => `${ticketHref(t.ticket_number)}${t.item_id ? `#${t.item_id}` : ''}`;

/** Ticket notices for the store that raised each ticket, until someone acts on it. */
export default function TicketNotificationsList({ data, onNavigate }) {
  const queryClient = useQueryClient();
  // A notice for the ticket already open only changes the #product anchor, so reload ticket data on every click.
  const navigate = () => {
    queryClient.invalidateQueries({ queryKey: [...QUERY_KEYS.TICKETING.ALL(), 'detail'] });
    queryClient.invalidateQueries({ queryKey: [...QUERY_KEYS.TICKETING.ALL(), 'list'] });
    onNavigate?.();
  };
  const g2dShared = data?.g2dShared ?? [];
  const designReady = data?.designReady ?? [];
  const finalReceived = data?.finalReceived ?? [];
  const cadOverdue = data?.cadOverdue ?? [];
  const readyToConfirm = data?.readyToConfirm ?? [];
  const newComments = data?.newComments ?? [];
  const hoOnHold = data?.hoOnHold ?? [];
  const hoResumed = data?.hoResumed ?? [];
  const hoDelayed = data?.hoDelayed ?? [];
  if (![g2dShared, designReady, finalReceived, cadOverdue, readyToConfirm, newComments, hoOnHold, hoResumed, hoDelayed].some((l) => l.length)) return null;

  return (
    <div className="flex flex-col gap-2">
      {hoOnHold.map((t) => (
        <NoticeRow
          onNavigate={navigate}
          key={`hold-${t.hold_id}`}
          href={ticketHref(t.ticket_number)}
          icon={PauseCircle}
          tone="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
        >
          <strong>{t.ticket_number}</strong>{storeText(t)}{t.customer_name ? ` · ${t.customer_name}` : ''} was put on hold by {t.held_by} at {t.step}. Reason: {t.reason}
        </NoticeRow>
      ))}
      {hoResumed.map((t) => (
        <NoticeRow
          onNavigate={navigate}
          key={`resumed-${t.hold_id}`}
          href={ticketHref(t.ticket_number)}
          icon={PlayCircle}
          tone="border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100"
        >
          <strong>{t.ticket_number}</strong>{storeText(t)}{t.customer_name ? ` · ${t.customer_name}` : ''} was resumed by {t.resumed_by}.
        </NoticeRow>
      ))}
      {hoDelayed.map((t) => (
        <NoticeRow
          onNavigate={navigate}
          key={`delayed-${t.ticket_number}-${t.step_key}`}
          href={ticketHref(t.ticket_number)}
          icon={Timer}
          tone="border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100"
        >
          <strong>{t.ticket_number}</strong>{storeText(t)}{t.customer_name ? ` · ${t.customer_name}` : ''}: store response delayed by{' '}
          {formatMinutes(t.delayed_minutes)} at {t.step}{t.on_hold ? ' (now on hold)' : ''}.
        </NoticeRow>
      ))}
      {g2dShared.map((t) => (
        <NoticeRow
          onNavigate={navigate}
          key={`g2d-${t.item_id ?? t.ticket_number}`}
          href={noticeHref(t)}
          icon={ClipboardList}
          tone="border-violet-300 bg-violet-50 text-violet-900 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-100"
        >
          The CAD team has shared the estimate for <strong>{t.ticket_number}</strong>{productText(t)}
          {t.customer_name ? ` · ${t.customer_name}` : ''}, kindly confirm with the customer.
        </NoticeRow>
      ))}
      {designReady.map((t) => (
        <NoticeRow
          onNavigate={navigate}
          key={`design-${t.item_id ?? t.ticket_number}`}
          href={noticeHref(t)}
          icon={PenTool}
          tone="border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100"
        >
          The CAD team has shared design {t.latest_design_label} for <strong>{t.ticket_number}</strong>{productText(t)}
          {t.customer_name ? ` · ${t.customer_name}` : ''}, kindly view.
        </NoticeRow>
      ))}
      {finalReceived.map((t) => (
        <NoticeRow
          onNavigate={navigate}
          key={t.ticket_number}
          href={ticketHref(t.ticket_number)}
          icon={ClipboardCheck}
          tone="border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100"
        >
          Final details for <strong>{t.ticket_number}</strong>
          {t.customer_name ? ` · ${t.customer_name}` : ''} have been received, kindly review and place the order.
        </NoticeRow>
      ))}
      {readyToConfirm.map((t) => (
        <NoticeRow
          onNavigate={navigate}
          key={`confirm-${t.ticket_number}`}
          href={ticketHref(t.ticket_number)}
          icon={Wallet}
          tone="border-violet-300 bg-violet-50 text-violet-900 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-100"
        >
          Every product on <strong>{t.ticket_number}</strong>
          {t.customer_name ? ` · ${t.customer_name}` : ''} is approved, kindly confirm the order and collect the advance.
        </NoticeRow>
      ))}
      {newComments.map((t) => (
        <NoticeRow
          onNavigate={navigate}
          key={`comment-${t.ticket_number}`}
          href={noticeHref(t)}
          icon={MessageSquare}
          tone="border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100"
        >
          New comment from the CAD team on <strong>{t.ticket_number}</strong>{productText(t)}
          {t.customer_name ? ` · ${t.customer_name}` : ''}.
        </NoticeRow>
      ))}
      {cadOverdue.map((t) => (
        <NoticeRow
          onNavigate={navigate}
          key={`overdue-${t.item_id ?? t.ticket_number}`}
          href={noticeHref(t)}
          icon={Clock}
          tone="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
        >
          <strong>{t.ticket_number}</strong>{productText(t)}{t.customer_name ? ` · ${t.customer_name}` : ''} has been waiting{' '}
          {t.days_waiting} days for the CAD team and requires attention.
        </NoticeRow>
      ))}
    </div>
  );
}
