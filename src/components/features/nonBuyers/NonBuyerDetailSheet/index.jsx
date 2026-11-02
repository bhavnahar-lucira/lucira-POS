'use client';

import { Phone, Mail, History, Ban } from 'lucide-react';
import BottomSheet from '@/components/shared/BottomSheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDatePadded } from '@/lib/dateUtils';
import { formatMobileWithCountryCode } from '@/lib/phoneFormat';
import { daysAgoLabel } from '@/components/features/nonBuyers/NonBuyerListItem';

function fmtVisitedAt(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

function Stat({ label, value }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-border bg-card px-3 py-2">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold text-foreground">{value}</span>
    </div>
  );
}

/**
 * @param {{ nonBuyer: object|null, isOpen: boolean, onClose: () => void }} props
 */
export default function NonBuyerDetailSheet({ nonBuyer, isOpen, onClose }) {
  const telHref = nonBuyer?.mobile && !nonBuyer.isMasked
    ? `tel:${String(nonBuyer.mobile).replace(/[^\d+]/g, '')}`
    : null;

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title={nonBuyer?.name || 'Unknown visitor'}
      footer={telHref ? (
        <Button asChild className="w-full min-h-11 gap-2">
          <a href={telHref}>
            <Phone size={16} aria-hidden="true" />
            Call {formatMobileWithCountryCode(nonBuyer.mobile)}
          </a>
        </Button>
      ) : null}
    >
      {nonBuyer && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5 text-sm text-muted-foreground">
            {nonBuyer.mobile && (
              <span className="flex items-center gap-2">
                <Phone size={14} aria-hidden="true" />
                {formatMobileWithCountryCode(nonBuyer.mobile)}
              </span>
            )}
            {nonBuyer.email && (
              <span className="flex items-center gap-2">
                <Mail size={14} aria-hidden="true" />
                {nonBuyer.email}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat label="Visits" value={nonBuyer.visitCount} />
            <Stat label="First visit" value={formatDatePadded(nonBuyer.firstVisitAt)} />
            <Stat
              label="Last visit"
              value={daysAgoLabel(nonBuyer.daysSinceLastVisit) ?? formatDatePadded(nonBuyer.lastVisitAt)}
            />
          </div>

          {(nonBuyer.isPastBuyer || nonBuyer.hasCancelledOrder) && (
            <div className="flex flex-wrap gap-2">
              {nonBuyer.isPastBuyer && (
                <Badge variant="secondary" className="gap-1">
                  <History size={11} aria-hidden="true" />
                  Past buyer · last purchase {formatDatePadded(nonBuyer.lastPurchaseDate)}
                </Badge>
              )}
              {nonBuyer.hasCancelledOrder && (
                <Badge variant="destructive" className="gap-1">
                  <Ban size={11} aria-hidden="true" />
                  Cancelled an order after visiting
                </Badge>
              )}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-foreground">Visit history</h3>
            <ol className="flex flex-col gap-1.5">
              {nonBuyer.visits.map((visit) => (
                <li
                  key={visit.visitId}
                  className="flex flex-col gap-0.5 rounded-lg border border-border bg-card px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-foreground">{fmtVisitedAt(visit.visitedAt)}</span>
                    {visit.source && (
                      <span className="text-xs text-muted-foreground shrink-0">{visit.source}</span>
                    )}
                  </div>
                  {visit.notes && (
                    <p className="text-xs text-muted-foreground">{visit.notes}</p>
                  )}
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
