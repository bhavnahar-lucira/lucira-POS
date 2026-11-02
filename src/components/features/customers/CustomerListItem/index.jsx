'use client';

import { User, Phone, MapPin, Mail } from 'lucide-react';
import ListItemCard from '@/components/shared/ListItemCard';
import { formatMobileWithCountryCode } from '@/lib/phoneFormat';

/**
 * @param {{
 *   customer: { customerId: number, customerName: string, customerMobile: string, customerAddress?: object },
 *   onSelect: () => void,
 * }} props
 */
export default function CustomerListItem({ customer, onSelect }) {
  const { customerName, customerMobile, customerEmail, customerAddress } = customer;
  const location = [customerAddress?.city, customerAddress?.state].filter(Boolean).join(', ');

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
          <span className="truncate">{formatMobileWithCountryCode(customerMobile)}</span>
        </div>
      )}

      {customerEmail && (
        <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <Mail size={13} className="shrink-0 text-muted-foreground/70" aria-hidden="true" />
          <span className="truncate">{customerEmail}</span>
        </div>
      )}

      {location && (
        <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <MapPin size={12} aria-hidden="true" className="shrink-0 text-muted-foreground/70" />
          <span className="truncate">{location}</span>
        </div>
      )}
    </ListItemCard>
  );
}
