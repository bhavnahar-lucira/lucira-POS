'use client';

// Compact recent-orders panel for the dashboard. Status badge is the
// shared PaymentStatusBadge (src/components/shared/PaymentStatusBadge)
// so status colors stay consistent with the /orders page.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Inbox } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import PaymentStatusBadge, { mapOrderStatus } from '@/components/shared/PaymentStatusBadge';
import OrderDetailSheet from '@/components/features/orders/OrderDetailSheet';

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last  = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

// Formats the order's own orderDate as "Today, h:mm AM/PM", or a plain date otherwise.
function formatOrderTimestamp(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const isToday = d.toDateString() === new Date().toDateString();
  const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  if (isToday) return `Today, ${time}`;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function OrderRow({ order, onSelect }) {
  const timestamp = formatOrderTimestamp(order.orderDate);

  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center gap-3 py-3 text-left transition-colors hover:bg-accent/50 rounded-lg px-2 -mx-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-bold text-primary">
        {getInitials(order.customerName)}
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground truncate">{order.orderNo || '—'}</p>
        <p className="text-sm font-medium text-foreground truncate">{order.customerName || 'Walk-in'}</p>
        {timestamp && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            {timestamp}
            {order.status && (
              <>
                <span aria-hidden="true">·</span>
                <PaymentStatusBadge status={mapOrderStatus(order.status)} size="sm" />
              </>
            )}
          </p>
        )}
      </div>

      <p className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
        &#8377;{Number(order.totalAmount ?? 0).toLocaleString('en-IN')}
      </p>
    </button>
  );
}

/**
 * RecentOrdersList
 * @param {{ orders: Array, isLoading?: boolean }} props
 */
export default function RecentOrdersList({ orders = [], isLoading }) {
  const router = useRouter();
  // Was routing every click straight to the generic /orders list, ignoring
  // which row was actually clicked (reported directly, 2026-09-29) — opens
  // the SAME sheet /orders itself uses, in place, instead.
  const [selectedOrder, setSelectedOrder] = useState(null);

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm p-5 h-full">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-heading text-base text-foreground">Recent Orders</h2>
        <button
          type="button"
          onClick={() => router.push('/orders')}
          className="flex items-center gap-1 text-xs font-medium text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
        >
          View all
          <ArrowRight size={12} aria-hidden="true" />
        </button>
      </div>

      {isLoading ? (
        <div className="divide-y divide-border">
            {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 py-3">
                <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
                <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-4 w-28" />
                </div>
                <Skeleton className="h-4 w-20" />
            </div>
            ))}
        </div>
        ) : orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
          <Inbox size={22} aria-hidden="true" />
          <p className="text-sm">No orders yet today.</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {orders.map((order) => (
            <OrderRow
              key={order.orderId ?? order.orderNo}
              order={order}
              onSelect={() => setSelectedOrder(order)}
            />
          ))}
        </div>
      )}

      <OrderDetailSheet
        order={selectedOrder}
        isOpen={!!selectedOrder}
        onClose={() => setSelectedOrder(null)}
      />
    </div>
  );
}
