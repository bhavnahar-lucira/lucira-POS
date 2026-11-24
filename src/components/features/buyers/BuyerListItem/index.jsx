'use client';

import { useState, useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import { User, Phone, Store, FileText, ClipboardList, IndianRupee, Calendar, RotateCcw, ArrowLeftRight, ShoppingBag, Ban, Coins, Mail } from 'lucide-react';
import ListItemCard from '@/components/shared/ListItemCard';
import { Badge } from '@/components/ui/badge';
import { formatAmountOrNull } from '@/lib/priceUtils';
import { formatDatePadded } from '@/lib/dateUtils';
import PhoneLink from '@/components/shared/PhoneLink';
import { useLuciraPoints } from '@/hooks/customers/useLuciraPoints';
import { selectActiveStoreId } from '@/store/slices/storeSlice';

/**
 * @param {{
 *   buyer: {
 *     _id: number, customerName: string, customerMobile: string,
 *     stores: string[], invoiceCount: number, orderCount: number,
 *     returnCount: number, exchangeCount: number, buybackCount: number,
 *     cancelledCount: number, hasOutcomes: boolean,
 *     totalSpend: number, lastPurchaseDate: string,
 *   },
 *   onSelect: () => void,
 * }} props
 */

function BuyerPoints({ companyId, partyId, mobile, customerName, points: preloadedPoints }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible]);

  const shouldQuery = preloadedPoints == null;
  const { points: queryPoints, isLoading, isAvailable } = useLuciraPoints(
    { companyId, partyId, mobile },
    { enabled: shouldQuery && visible }
  );

  const points = preloadedPoints ?? queryPoints;
  const ready = preloadedPoints != null ? true : isAvailable;
  const loading = preloadedPoints != null ? false : (!visible || isLoading);

  return (
    <span
      ref={ref}
      className="mt-1 inline-flex w-fit items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
    >
      <Coins size={12} className="shrink-0 text-amber-500" aria-hidden="true" />
      {loading
        ? 'Lucira points …'
        : ready
        ? `${points.toLocaleString('en-IN')} Lucira points`
        : 'Lucira points —'}
    </span>
  );
}

export default function BuyerListItem({ buyer, onSelect }) {
  const {
    customerName, customerMobile, customerEmail, stores, invoiceCount, orderCount,
    returnCount, exchangeCount, buybackCount, cancelledCount,
    totalSpend, lastPurchaseDate, purchaseCount, daysSinceLastPurchase,
  } = buyer;

  const activeStoreId = useSelector(selectActiveStoreId);

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
          <PhoneLink phone={customerMobile} className="truncate" />
        </div>
      )}

      {customerEmail && (
        <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <Mail size={13} className="shrink-0 text-muted-foreground/70" aria-hidden="true" />
          <span className="truncate">{customerEmail}</span>
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

      {/* Lead-quality signal: an item coming back (or an order/document
          getting cancelled) makes this a weaker retargeting lead than a
          buyer whose purchases all stuck — flagged with the destructive
          badge style so it's visually distinct from the positive counts
          above at a glance. */}
      {(returnCount > 0 || exchangeCount > 0 || buybackCount > 0 || cancelledCount > 0) && (
        <div className="flex items-center gap-2 flex-wrap">
          {returnCount > 0 && (
            <Badge variant="destructive" className="gap-1">
              <RotateCcw size={11} aria-hidden="true" />
              {returnCount} returned
            </Badge>
          )}
          {exchangeCount > 0 && (
            <Badge variant="destructive" className="gap-1">
              <ArrowLeftRight size={11} aria-hidden="true" />
              {exchangeCount} exchanged
            </Badge>
          )}
          {buybackCount > 0 && (
            <Badge variant="destructive" className="gap-1">
              <ShoppingBag size={11} aria-hidden="true" />
              {buybackCount} bought back
            </Badge>
          )}
          {cancelledCount > 0 && (
            <Badge variant="destructive" className="gap-1">
              <Ban size={11} aria-hidden="true" />
              {cancelledCount} cancelled
            </Badge>
          )}
        </div>
      )}

      {formatAmountOrNull(totalSpend) && (
        <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <IndianRupee size={13} className="shrink-0 text-muted-foreground/70" aria-hidden="true" />
          <span>
            {formatAmountOrNull(totalSpend)} spend
            {purchaseCount > 0 ? ` · ${purchaseCount} purchase${purchaseCount !== 1 ? 's' : ''}` : ''}
          </span>
        </div>
      )}

      {activeStoreId && (
        <BuyerPoints
          companyId={activeStoreId}
          partyId={Number(buyer._id)}
          mobile={buyer.customerMobile}
          customerName={buyer.customerName}
          points={buyer.luciraPoints}
        />
      )}

      <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
        <Calendar size={13} className="shrink-0 text-muted-foreground/70" aria-hidden="true" />
        <span>
          Last purchase: {formatDatePadded(lastPurchaseDate)}
          {daysSinceLastPurchase != null ? ` · ${daysSinceLastPurchase === 0 ? 'today' : `${daysSinceLastPurchase} day${daysSinceLastPurchase !== 1 ? 's' : ''} ago`}` : ''}
        </span>
      </div>
    </ListItemCard>
  );
}
