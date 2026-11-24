'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import {
  ArrowLeftRight, ClipboardList, CreditCard, FileText, Loader2, RefreshCw,
  RotateCcw, ShoppingBag, Store, Tag, User, Coins
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import PillTabs from '@/components/shared/PillTabs';
import ErrorState from '@/components/shared/ErrorState';
import { useBuyerHistory } from '@/hooks/buyers/useBuyerHistory';
import { useSyncBuyerHistory } from '@/hooks/buyers/useSyncBuyerHistory';
import { deriveDocumentStatus } from '@/hooks/customer/useCustomerOrders';
import APP_CONFIG from '@/constants/appConfig';
import { formatAmountOrNull } from '@/lib/priceUtils';
import { formatDatePadded } from '@/lib/dateUtils';
import { useLuciraPoints } from '@/hooks/customers/useLuciraPoints';
import { selectActiveStoreId } from '@/store/slices/storeSlice';

const TABS = [
  { key: 'invoice', label: 'Invoice', pluralLabel: 'invoices', icon: FileText },
  { key: 'order', label: 'Order', pluralLabel: 'orders', icon: ClipboardList },
  { key: 'return', label: 'Return', pluralLabel: 'returns', icon: RotateCcw },
  { key: 'exchange', label: 'Exchange', pluralLabel: 'exchanges', icon: ArrowLeftRight },
  { key: 'buyback', label: 'Buy Back', pluralLabel: 'buy backs', icon: ShoppingBag },
];
const ALL_STORES = 'all';
const DOCUMENT_TYPE_BADGE_VARIANT = { invoice: 'default', order: 'secondary' };

/** Header-level pill that displays and logs Lucira points on load and on click */
function CustomerPoints({ companyId, partyId, mobile, customerName }) {
  const { points, isLoading, isAvailable } = useLuciraPoints(
    { companyId, partyId, mobile },
    { enabled: !!companyId && !!partyId && !!mobile }
  );

  // useEffect(() => {
  //   if (!isLoading && isAvailable) {
  //     console.log(
  //       `%c[Lucira Points] ${customerName || 'Customer'} (${mobile})`,
  //       'color: #d97706; font-weight: bold;',
  //       { customerName, partyId, mobile, points }
  //     );
  //   }
  // }, [isLoading, isAvailable, points, customerName, mobile, partyId]);

  // const handleClick = () => {
  //   console.log(
  //     `%c[Lucira Points Clicked] ${customerName || 'Customer'} (${mobile})`,
  //     'color: #d97706; font-weight: bold;',
  //     { customerName, partyId, mobile, points }
  //   );
  // };

  return (
    <button
      type="button"
      className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900 transition-colors hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100 dark:hover:bg-amber-900/50"
    >
      <Coins size={13} className="shrink-0 text-amber-500" aria-hidden="true" />
      {isLoading
        ? 'Lucira points …'
        : isAvailable
        ? `${points.toLocaleString('en-IN')} Lucira points`
        : 'Lucira points —'}
    </button>
  );
}

function PurchaseCard({ purchase }) {
  const {
    documentType, documentNo, transactionId, documentDate,
    documentStatus, balanceAmount, receiptAmount,
    storeName, salesPersonName, items, promotions, payments, totalAmount,
  } = purchase;
  const isCancelled = deriveDocumentStatus(documentStatus, balanceAmount, receiptAmount)
    === APP_CONFIG.ORDER_STATUS.CANCELLED;

  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3 shadow-sm">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={DOCUMENT_TYPE_BADGE_VARIANT[documentType] ?? 'secondary'} className="capitalize">
            {documentType}
          </Badge>
          {isCancelled && <Badge variant="destructive">Cancelled</Badge>}
          <span className="text-sm font-medium text-foreground break-all">
            {documentNo || `#${transactionId}`}
          </span>
        </div>
        <span className="text-xs text-muted-foreground">{formatDatePadded(documentDate)}</span>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {storeName && (
          <span className="flex items-center gap-1">
            <Store size={12} aria-hidden="true" />
            {storeName}
          </span>
        )}
        {salesPersonName && (
          <span className="flex items-center gap-1">
            <User size={12} aria-hidden="true" />
            {salesPersonName}
          </span>
        )}
      </div>

      {items?.length > 0 && (
        <div className="border-t border-dashed border-border pt-3 flex flex-col gap-1.5">
          {items.map((item, idx) => (
            <div key={`${item.item_id ?? 'item'}-${idx}`} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 text-foreground">
                <span className="block truncate">
                  {item.item_name || 'Item'}
                  {item.quantity > 1 ? ` × ${item.quantity}` : ''}
                </span>
                {(item.item_weight || item.item_size) && (
                  <span className="block text-xs text-muted-foreground">
                    {[item.item_weight ? `${item.item_weight} g` : null, item.item_size ? `Size ${item.item_size}` : null].filter(Boolean).join(' · ')}
                  </span>
                )}
              </span>
              {formatAmountOrNull(item.price) && (
                <span className="shrink-0 text-muted-foreground">{formatAmountOrNull(item.price)}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {promotions?.length > 0 && (
        <div className="border-t border-dashed border-border pt-3 flex flex-col gap-1.5">
          {promotions.map((promo) => (
            <div key={promo.code} className="flex items-center justify-between gap-2 text-sm">
              <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                <Tag size={12} className="shrink-0" aria-hidden="true" />
                <span className="break-words">{promo.name}</span>
              </span>
              {formatAmountOrNull(promo.amount) && (
                <span className="shrink-0 text-muted-foreground">-{formatAmountOrNull(promo.amount)}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {payments?.length > 0 && (
        <div className="border-t border-dashed border-border pt-3 flex flex-col gap-1.5">
          {payments.map((payment, idx) => (
            <div key={idx} className="flex items-center justify-between gap-2 text-sm">
              <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                <CreditCard size={12} className="shrink-0" aria-hidden="true" />
                <span className="break-all">
                  {payment.modeName || 'Payment'}
                  {payment.refNo ? ` · Ref: ${payment.refNo}` : ''}
                </span>
              </span>
              {formatAmountOrNull(payment.amount) && (
                <span className="shrink-0 text-muted-foreground">{formatAmountOrNull(payment.amount)}</span>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="border-t border-border pt-3 flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">Total</span>
        <span className="text-sm font-semibold text-foreground">{formatAmountOrNull(totalAmount) ?? '—'}</span>
      </div>
    </div>
  );
}

/** Read-only purchase history for one customer across every store (POS DB), refreshed from OrnaVerse on open. */
export default function PurchaseHistory({ customerId }) {
  const activeStoreId = useSelector(selectActiveStoreId);
  const { purchases, isLoading, isError, refetch } = useBuyerHistory(customerId);
  const { sync, isSyncing } = useSyncBuyerHistory();
  const [activeTab, setActiveTab] = useState('invoice');
  const [store, setStore] = useState(ALL_STORES);

  const customerMobile = purchases.find((p) => p.customerMobile)?.customerMobile;
  const customerName = purchases.find((p) => p.customerName)?.customerName;

  const syncedForRef = useRef(null);
  useEffect(() => {
    if (!customerId || syncedForRef.current === customerId) return;
    syncedForRef.current = customerId;
    sync(customerId).then(() => refetch()).catch((err) => console.warn('[buyers/sync]', err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  const stores = useMemo(() => [...new Set(purchases.map((p) => p.storeName).filter(Boolean))].sort(), [purchases]);
  const inStore = useMemo(
    () => (store === ALL_STORES ? purchases : purchases.filter((p) => p.storeName === store)),
    [purchases, store],
  );
  const purchasesByTab = useMemo(() => {
    const byType = new Map(TABS.map((t) => [t.key, []]));
    for (const p of inStore) byType.get(p.documentType)?.push(p);
    return byType;
  }, [inStore]);
  const tabsWithCounts = useMemo(() => TABS.map((t) => ({
    ...t,
    label: `${t.label} (${purchasesByTab.get(t.key)?.length ?? 0})`,
  })), [purchasesByTab]);
  const visiblePurchases = purchasesByTab.get(activeTab) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex-1 min-w-48 text-xs text-muted-foreground">
          {isSyncing ? (
            <span className="flex items-center gap-1.5">
              <Loader2 size={12} className="animate-spin" aria-hidden="true" />
              Checking OrnaVerse for new purchases…
            </span>
          ) : 'Every store · read only'}
        </p>

        {/* Lucira points pill button */}
        {activeStoreId && customerMobile && (
          <CustomerPoints
            companyId={activeStoreId}
            partyId={Number(customerId)}
            mobile={customerMobile}
            customerName={customerName}
          />
        )}

        {stores.length > 1 && (
          <Select value={store} onValueChange={setStore}>
            <SelectTrigger className="h-9 w-full sm:w-64" aria-label="Store"><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value={ALL_STORES}>All stores</SelectItem>
              {stores.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => sync(customerId).then(() => refetch())}
          disabled={isSyncing}
          className="h-9 gap-1.5"
        >
          <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} aria-hidden="true" />
          Refresh
        </Button>
      </div>

      {!isLoading && !isError && purchases.length > 0 && (
        <PillTabs
          tabs={tabsWithCounts}
          value={activeTab}
          onChange={setActiveTab}
          getKey={(t) => t.key}
          getLabel={(t) => t.label}
          getIcon={(t) => t.icon}
        />
      )}

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 size={16} className="animate-spin" aria-hidden="true" />
          Loading purchase history…
        </div>
      ) : isError ? (
        <ErrorState title="Couldn't load purchase history." onRetry={refetch} />
      ) : purchases.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">
          {isSyncing ? 'Checking for purchases…' : 'No purchases recorded for this customer.'}
        </p>
      ) : visiblePurchases.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">
          No {TABS.find((t) => t.key === activeTab)?.pluralLabel ?? 'records'} for this customer.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {visiblePurchases.map((purchase) => (
            <PurchaseCard key={purchase._id} purchase={purchase} />
          ))}
        </div>
      )}
    </div>
  );
}