'use client';

import { User, Phone, Store, FileText, ClipboardList, IndianRupee, Calendar } from 'lucide-react';
import ListItemCard from '@/components/shared/ListItemCard';
import { Badge } from '@/components/ui/badge';
import { formatAmountOrNull } from '@/lib/priceUtils';
import { formatDatePadded } from '@/lib/dateUtils';

/**
 * @param {{
 *   buyer: {
 *     _id: number, customerName: string, customerMobile: string,
 *     stores: string[], invoiceCount: number, orderCount: number,
 *     totalSpend: number, lastPurchaseDate: string,
 *   },
 *   onSelect: () => void,
 * }} props
 */
export default function BuyerListItem({ buyer, onSelect }) {
  const { customerName, customerMobile, stores, invoiceCount, orderCount, totalSpend, lastPurchaseDate } = buyer;

  return (
    <ListItemCard onSelect={onSelect}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[13px] text-muted-foreground min-w-0">
          <User size={13} className="shrink-0 text-muted-foreground/70" aria-hidden="true" />
          <span className="truncate">{customerName || '—'}</span>
        </span>
      </div>

      {customerMobile && (
        <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <Phone size={13} className="shrink-0 text-muted-foreground/70" aria-hidden="true" />
          <span className="truncate">{customerMobile}</span>
        </div>
      )}

      {stores?.length > 0 && (
        <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <Store size={13} className="shrink-0 text-muted-foreground/70" aria-hidden="true" />
          <span className="truncate">{stores.filter(Boolean).join(', ')}</span>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {invoiceCount > 0 && (
          <Badge variant="default" className="gap-1">
            <FileText size={11} aria-hidden="true" />
            {invoiceCount} invoice{invoiceCount !== 1 ? 's' : ''}
          </Badge>
        )}
        {orderCount > 0 && (
          <Badge variant="secondary" className="gap-1">
            <ClipboardList size={11} aria-hidden="true" />
            {orderCount} order{orderCount !== 1 ? 's' : ''}
          </Badge>
        )}
      </div>

      {formatAmountOrNull(totalSpend) && (
        <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <IndianRupee size={13} className="shrink-0 text-muted-foreground/70" aria-hidden="true" />
          <span>{formatAmountOrNull(totalSpend)} spend</span>
        </div>
      )}

      <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
        <Calendar size={13} className="shrink-0 text-muted-foreground/70" aria-hidden="true" />
        <span>Last purchase: {formatDatePadded(lastPurchaseDate)}</span>
      </div>
    </ListItemCard>
  );
}
