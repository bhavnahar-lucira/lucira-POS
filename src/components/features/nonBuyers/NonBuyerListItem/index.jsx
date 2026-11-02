'use client';

import { User, Phone, Footprints, Calendar, History, Ban, Megaphone, Store } from 'lucide-react';
import ListItemCard from '@/components/shared/ListItemCard';
import { Badge } from '@/components/ui/badge';
import { formatDatePadded } from '@/lib/dateUtils';
import { formatMobileWithCountryCode } from '@/lib/phoneFormat';

export function daysAgoLabel(days) {
  if (days == null) return null;
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

/**
 * @param {{ nonBuyer: object, onSelect: () => void }} props — a row from
 *   lib/nonBuyers/deriveNonBuyers.js
 */
export default function NonBuyerListItem({ nonBuyer, onSelect }) {
  const {
    name, mobile, visitCount, lastVisitAt, daysSinceLastVisit,
    sources, isPastBuyer, hasCancelledOrder, storeName,
  } = nonBuyer;

  return (
    <ListItemCard onSelect={onSelect}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[13px] text-muted-foreground min-w-0">
          <User size={13} className="shrink-0 text-muted-foreground/70" aria-hidden="true" />
          <span className="truncate">{name || 'Unknown visitor'}</span>
        </span>
        <Badge variant="default" className="gap-1 shrink-0">
          <Footprints size={11} aria-hidden="true" />
          {visitCount} visit{visitCount !== 1 ? 's' : ''}
        </Badge>
      </div>

      {mobile && (
        <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <Phone size={13} className="shrink-0 text-muted-foreground/70" aria-hidden="true" />
          <span className="truncate">{formatMobileWithCountryCode(mobile)}</span>
        </div>
      )}

      {storeName && (
        <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <Store size={13} className="shrink-0 text-muted-foreground/70" aria-hidden="true" />
          <span className="truncate">{storeName}</span>
        </div>
      )}

      <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
        <Calendar size={13} className="shrink-0 text-muted-foreground/70" aria-hidden="true" />
        <span className="truncate">
          Last visit: {formatDatePadded(lastVisitAt)}
          {daysAgoLabel(daysSinceLastVisit) ? ` · ${daysAgoLabel(daysSinceLastVisit)}` : ''}
        </span>
      </div>

      {sources?.length > 0 && (
        <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <Megaphone size={13} className="shrink-0 text-muted-foreground/70" aria-hidden="true" />
          <span className="truncate">{sources.join(', ')}</span>
        </div>
      )}

      {(isPastBuyer || hasCancelledOrder) && (
        <div className="flex items-center gap-2 flex-wrap">
          {isPastBuyer && (
            <Badge variant="secondary" className="gap-1">
              <History size={11} aria-hidden="true" />
              Past buyer
            </Badge>
          )}
          {hasCancelledOrder && (
            <Badge variant="destructive" className="gap-1">
              <Ban size={11} aria-hidden="true" />
              Cancelled order
            </Badge>
          )}
        </div>
      )}
    </ListItemCard>
  );
}
