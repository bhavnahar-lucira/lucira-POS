'use client';

// Compact recent-activity panel for the dashboard — 4 tabs (MTO / Invoice /
// Return / URD), one per real OrnaVerse document type, reported directly
// (2026-09-30): the old single merged list gave no way to tell what kind of
// document a row actually was at a glance. Status badge is the shared
// PaymentStatusBadge (src/components/shared/PaymentStatusBadge) so status
// colors stay consistent with the /orders page.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Inbox, PackagePlus, Receipt, RotateCcw, Coins } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import PillTabs from '@/components/shared/PillTabs';
import PaymentStatusBadge, { mapOrderStatus } from '@/components/shared/PaymentStatusBadge';
import OrderDetailSheet from '@/components/features/orders/OrderDetailSheet';

// viewAllHref/emptyLabel per tab — each points at the ONE real page that
// actually owns that document type's full list, not a shared/mixed one, so
// "View all" never lands the operator somewhere showing a different mix of
// documents than what this tab just showed them.
const TABS = [
  {
    key: 'mto', label: 'MTO', icon: PackagePlus,
    emptyLabel: 'No Made to Order bookings yet today.', viewAllHref: '/orders',
  },
  {
    key: 'invoice', label: 'Invoice', icon: Receipt,
    emptyLabel: 'No invoices yet today.', viewAllHref: '/invoices',
  },
  {
    key: 'return', label: 'Return', icon: RotateCcw,
    emptyLabel: 'No returns yet today.', viewAllHref: '/transactions?tab=returns',
  },
  {
    key: 'urd', label: 'URD', icon: Coins,
    emptyLabel: 'No URD purchases yet today.', viewAllHref: '/transactions?tab=urd',
  },
];

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last  = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

// Formats a row's own date as "Today, h:mm AM/PM", or a plain date otherwise.
function formatTimestamp(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const isToday = d.toDateString() === new Date().toDateString();
  const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  if (isToday) return `Today, ${time}`;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

// MTO/Invoice rows (useAllOrders/normalizeCustomerOrder) and Return/URD rows
// (useTransactionLists/normalizeTransaction) carry DIFFERENT field names for
// the same concepts (orderNo/orderDate/totalAmount vs documentNo/
// documentDate/amount) — mapped here into ONE shape so the same row
// renderer works for every tab, rather than four near-identical branches
// that could quietly drift apart.
function toDisplayRow(item, tabKey) {
  if (tabKey === 'return' || tabKey === 'urd') {
    return {
      id: item.transactionId,
      docNo: item.documentNo,
      date: item.documentDate,
      customerName: item.customerName,
      totalAmount: item.amount,
      status: null,
    };
  }
  return {
    id: item.orderId,
    docNo: item.orderNo,
    date: item.orderDate,
    customerName: item.customerName,
    totalAmount: item.totalAmount,
    status: item.status,
  };
}

function ActivityRow({ row, onSelect }) {
  const timestamp = formatTimestamp(row.date);

  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center gap-3 py-3 text-left transition-colors hover:bg-accent/50 rounded-lg px-2 -mx-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-bold text-primary">
        {getInitials(row.customerName)}
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground truncate">{row.docNo || '—'}</p>
        <p className="text-sm font-medium text-foreground truncate">{row.customerName || 'Walk-in'}</p>
        {timestamp && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            {timestamp}
            {row.status && (
              <>
                <span aria-hidden="true">·</span>
                <PaymentStatusBadge status={mapOrderStatus(row.status)} size="sm" />
              </>
            )}
          </p>
        )}
      </div>

      <p className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
        &#8377;{Number(row.totalAmount ?? 0).toLocaleString('en-IN')}
      </p>
    </button>
  );
}

/**
 * RecentOrdersList
 * @param {{
 *   mtoOrders?: Array, invoices?: Array, returns?: Array, urdPurchases?: Array,
 *   isLoading?: boolean,
 * }} props
 */
export default function RecentOrdersList({
  mtoOrders = [], invoices = [], returns = [], urdPurchases = [], isLoading,
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('mto');
  const [selectedOrder, setSelectedOrder] = useState(null);

  const itemsByTab = { mto: mtoOrders, invoice: invoices, return: returns, urd: urdPurchases };
  const activeItems = itemsByTab[activeTab] ?? [];
  const activeTabConfig = TABS.find((t) => t.key === activeTab) ?? TABS[0];

  // Was routing every click straight to the generic /orders list, ignoring
  // which row was actually clicked (reported directly, 2026-09-29) — opens
  // the SAME sheet /orders itself uses, in place, instead. Return/URD have
  // no equivalent lightweight sheet yet — their own full detail view lives
  // inline in /transactions, so a click there navigates to it directly
  // rather than duplicating that view here.
  const handleSelect = (item) => {
    if (activeTab === 'return' || activeTab === 'urd') {
      router.push(activeTabConfig.viewAllHref);
      return;
    }
    setSelectedOrder(item);
  };

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm p-5 h-full">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-heading text-base text-foreground">Recent Orders</h2>
        <button
          type="button"
          onClick={() => router.push(activeTabConfig.viewAllHref)}
          className="flex items-center gap-1 text-xs font-medium text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
        >
          View all
          <ArrowRight size={12} aria-hidden="true" />
        </button>
      </div>

      <PillTabs
        tabs={TABS}
        value={activeTab}
        onChange={setActiveTab}
        getKey={(t) => t.key}
        getLabel={(t) => t.label}
        getIcon={(t) => t.icon}
        variant="pill"
        scrollable
        className="mb-2"
      />

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
        ) : activeItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
          <Inbox size={22} aria-hidden="true" />
          <p className="text-sm">{activeTabConfig.emptyLabel}</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {activeItems.map((item) => {
            const row = toDisplayRow(item, activeTab);
            return (
              <ActivityRow
                key={row.id ?? row.docNo}
                row={row}
                onSelect={() => handleSelect(item)}
              />
            );
          })}
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
