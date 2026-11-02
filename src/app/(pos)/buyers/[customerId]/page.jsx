'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Store, User, CreditCard, Tag, Loader2, RefreshCw,
  FileText, ClipboardList, RotateCcw, ArrowLeftRight, ShoppingBag,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import PillTabs from '@/components/shared/PillTabs';
import ErrorState from '@/components/shared/ErrorState';
import { useBuyerHistory } from '@/hooks/buyers/useBuyerHistory';
import { useSyncBuyerHistory } from '@/hooks/buyers/useSyncBuyerHistory';
import { deriveDocumentStatus } from '@/hooks/customer/useCustomerOrders';
import APP_CONFIG from '@/constants/appConfig';
import { formatAmountOrNull } from '@/lib/priceUtils';
import { formatDatePadded } from '@/lib/dateUtils';
import { formatMobileWithCountryCode } from '@/lib/phoneFormat';

const TABS = [
  { key: 'invoice',  label: 'Invoice',  pluralLabel: 'invoices',   icon: FileText },
  { key: 'order',    label: 'Order',    pluralLabel: 'orders',     icon: ClipboardList },
  { key: 'return',   label: 'Return',   pluralLabel: 'returns',    icon: RotateCcw },
  { key: 'exchange', label: 'Exchange', pluralLabel: 'exchanges',  icon: ArrowLeftRight },
  { key: 'buyback',  label: 'Buy Back', pluralLabel: 'buy backs',  icon: ShoppingBag },
];

const DOCUMENT_TYPE_BADGE_VARIANT = { invoice: 'default', order: 'secondary' };

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
            // Not item_id alone: one purchase can carry the same item on two
            // lines (e.g. a paid + a free gold coin), which collided.
            <div key={`${item.item_id ?? 'item'}-${idx}`} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate text-foreground">
                {item.item_name || 'Item'}
                {item.quantity > 1 ? ` × ${item.quantity}` : ''}
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

export default function BuyerDetailPage() {
  const router = useRouter();
  const { customerId } = useParams();
  const { purchases, isLoading, isError, refetch } = useBuyerHistory(customerId);
  const { sync, isSyncing } = useSyncBuyerHistory();
  const [activeTab, setActiveTab] = useState('invoice');

  // Pulls this customer's full history straight from OrnaVerse (every store,
  // via GetPartyTransactions) and saves it into buyerPurchases_POS, so a sale
  // placed before this module existed — or directly on OrnaVerse's own
  // client, never through this app's checkout — still shows up here. Safe to
  // run on every page load: the upsert is keyed by documentType+transactionId,
  // so it only ever overwrites the same records, never duplicates them.
  const syncedForRef = useRef(null);
  useEffect(() => {
    if (!customerId || syncedForRef.current === customerId) return;
    syncedForRef.current = customerId;
    sync(customerId).then(() => refetch()).catch((err) => console.warn('[buyers/sync]', err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  const first = purchases[0];
  const displayName = first?.customerName || 'Customer';
  const displayMobile = first?.customerMobile;

  const purchasesByTab = useMemo(() => {
    const byType = new Map(TABS.map((t) => [t.key, []]));
    for (const p of purchases) byType.get(p.documentType)?.push(p);
    return byType;
  }, [purchases]);
  const tabsWithCounts = useMemo(() => TABS.map((t) => ({
    ...t,
    label: `${t.label} (${purchasesByTab.get(t.key)?.length ?? 0})`,
  })), [purchasesByTab]);
  const visiblePurchases = purchasesByTab.get(activeTab) ?? [];

  return (
    <div className="flex flex-col gap-4 w-full p-4 md:p-6">
      <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-4 shadow-sm">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => router.push('/buyers')}
          aria-label="Back to buyers"
          className="h-9 w-9 -ml-2 shrink-0"
        >
          <ArrowLeft size={18} aria-hidden="true" />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold text-foreground break-words">{displayName}</h2>
          {displayMobile && (
            <p className="text-xs text-muted-foreground/70 mt-0.5">{formatMobileWithCountryCode(displayMobile)}</p>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => sync(customerId).then(() => refetch())}
          disabled={isSyncing}
          aria-label="Refresh from OrnaVerse"
          className="h-9 w-9 shrink-0"
        >
          <RefreshCw size={16} className={isSyncing ? 'animate-spin' : ''} aria-hidden="true" />
        </Button>
      </div>

      {isSyncing && (
        <p className="text-xs text-muted-foreground -mt-2 flex items-center gap-1.5">
          <Loader2 size={12} className="animate-spin" aria-hidden="true" />
          Checking OrnaVerse for new purchases…
        </p>
      )}

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
        <p className="text-sm text-muted-foreground text-center py-10">No purchases recorded for this customer.</p>
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
