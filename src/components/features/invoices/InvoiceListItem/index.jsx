'use client';

import { User, Calendar, Store, Phone, Mail } from 'lucide-react';
import ListItemCard from '@/components/shared/ListItemCard';
import { formatDateSlashed } from '@/lib/dateUtils';

/**
 * @param {{
 *   invoice: {
 *     customerName, customerEmail, customerMobile,
 *     itemName, totalAmount,
 *     raw: { document_no, document_date, location_name, company_name }
 *   },
 *   onSelect: () => void,
 * }} props
 */
export default function InvoiceListItem({ invoice, onSelect }) {
  const {
    customerName,
    customerEmail,
    customerMobile,
    totalAmount,
    raw,
  } = invoice;

  const invoiceNo   = raw?.document_no;
  const invoiceDate = raw?.document_date;
  const storeName   = raw?.location_name ?? raw?.company_name;

  return (
    <ListItemCard
      onSelect={onSelect}
      header={invoiceNo || 'Invoice'}
      footer={totalAmount != null && (
        <p className="text-[18px] font-bold text-foreground">
          &#8377;{Number(totalAmount).toLocaleString('en-IN')}
        </p>
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[13px] text-muted-foreground min-w-0">
          <User size={13} className="shrink-0 text-muted-foreground/70" aria-hidden="true" />
          <span className="truncate">{customerName || '—'}</span>
        </span>
        {invoiceDate && (
          <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground shrink-0">
            <Calendar size={13} className="text-muted-foreground/70" aria-hidden="true" />
            {formatDateSlashed(invoiceDate)}
          </span>
        )}
      </div>

      {storeName && (
        <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <Store size={13} className="shrink-0 text-muted-foreground/70" aria-hidden="true" />
          <span className="truncate">{storeName}</span>
        </div>
      )}

      {customerMobile && (
        <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <Phone size={13} className="shrink-0 text-muted-foreground/70" aria-hidden="true" />
          <span className="truncate">{customerMobile}</span>
        </div>
      )}

      {customerEmail && (
        <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <Mail size={13} className="shrink-0 text-muted-foreground/70" aria-hidden="true" />
          <span className="truncate">{customerEmail}</span>
        </div>
      )}
    </ListItemCard>
  );
}
