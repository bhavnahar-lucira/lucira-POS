'use client';

import { User, Calendar, Store, PackageCheck } from 'lucide-react';
import ListItemCard from '@/components/shared/ListItemCard';
import PaymentStatusBadge, { mapOrderStatus } from '@/components/shared/PaymentStatusBadge';
import { formatDateSlashed } from '@/lib/dateUtils';

/**
 * @param {{
 *   order: { orderNo, orderDate, customerName, totalAmount, status, companyName },
 *   onSelect: () => void,
 * }} props
 */
export default function OrderListItem({ order, onSelect, readyLines = null }) {
  const { orderNo, orderDate, customerName, totalAmount, status, companyName } = order;
  const reservedSkus = (readyLines ?? []).map((l) => l.sku).filter(Boolean);

  return (
    <ListItemCard
      onSelect={onSelect}
      header={orderNo || 'Order'}
      footer={(
        <>
          {totalAmount != null ? (
            <p className="text-[18px] font-bold text-foreground">
              &#8377;{Number(totalAmount).toLocaleString('en-IN')}
            </p>
          ) : (
            <span />
          )}
          {status && <PaymentStatusBadge status={mapOrderStatus(status)} size="sm" />}
        </>
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[13px] text-muted-foreground min-w-0">
          <User size={13} className="shrink-0 text-muted-foreground/70" aria-hidden="true" />
          <span className="truncate">{customerName || '—'}</span>
        </span>
        {orderDate && (
          <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground shrink-0">
            <Calendar size={13} className="text-muted-foreground/70" aria-hidden="true" />
            {formatDateSlashed(orderDate)}
          </span>
        )}
      </div>

      {readyLines?.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <span className="inline-flex items-center gap-1 rounded-full bg-status-in-stock/15 px-2 py-0.5 text-[11px] font-medium text-status-in-stock">
            <PackageCheck size={12} aria-hidden="true" /> Ready to bill
          </span>
          {reservedSkus.length > 0 && (
            <span className="truncate text-muted-foreground">Reserved {reservedSkus.join(', ')}</span>
          )}
        </div>
      )}

      {companyName && (
        <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <Store size={13} className="shrink-0 text-muted-foreground/70" aria-hidden="true" />
          <span className="truncate">{companyName}</span>
        </div>
      )}
    </ListItemCard>
  );
}
