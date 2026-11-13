'use client';

import { Suspense, useState } from 'react';
import { useSelector } from 'react-redux';
import { Wrench, PackageCheck, Receipt, Inbox, Truck, Plus, X } from 'lucide-react';
import { selectActiveStoreId, selectActiveStoreCode } from '@/store/slices/storeSlice';
import PageLoader from '@/components/shared/PageLoader';
import PillTabs from '@/components/shared/PillTabs';
import { Button } from '@/components/ui/button';
import RepairDocumentList from '@/components/features/repair/RepairDocumentList';
import NewRepairOrderForm from '@/components/features/repair/NewRepairOrderForm';
import NewRepairInvoiceForm from '@/components/features/repair/NewRepairInvoiceForm';
import NewReturnToStoreForm from '@/components/features/repair/NewReturnToStoreForm';

const ORDERS = {
  id: 'orders', label: 'Repair Orders', icon: Wrench,
  hint: 'Pieces accepted for repair at this store.',
  emptyTitle: 'No repair orders yet', newLabel: 'New Repair Order', NewForm: NewRepairOrderForm,
};
const RECEIPTS_FROM_HO = {
  id: 'receipts', label: 'Receipt From HO', icon: PackageCheck,
  hint: 'Repaired pieces Head Office has sent back. Authorise each one when it reaches the store.',
  emptyTitle: 'Nothing has come back from Head Office',
};
const INVOICES = {
  id: 'invoices', label: 'Repair Invoices', icon: Receipt, showAmount: true,
  hint: 'Bill the customer when they collect a repaired piece.',
  emptyTitle: 'No repair invoices yet', newLabel: 'New Repair Invoice', NewForm: NewRepairInvoiceForm,
};
const RECEIPTS_FROM_STORE = {
  id: 'ins', label: 'Receipt From Store', icon: Inbox,
  hint: 'Repair orders stores have sent to Head Office. Authorise each one when it arrives.',
  emptyTitle: 'No repairs received from stores',
};
const RETURNS_TO_STORE = {
  id: 'outs', label: 'Return To Store', icon: Truck,
  hint: 'Repaired pieces sent back to stores. The store authorises each one under Receipt From HO.',
  emptyTitle: 'No returns to stores', newLabel: 'New Return To Store', NewForm: NewReturnToStoreForm,
};

const STORE_TABS = [ORDERS, RECEIPTS_FROM_HO, INVOICES];
const HO_TABS = [ORDERS, RECEIPTS_FROM_STORE, RETURNS_TO_STORE, INVOICES];

function RepairScreen() {
  const storeId = useSelector(selectActiveStoreId);
  const storeCode = useSelector(selectActiveStoreCode);
  const tabs = storeCode === 'HO' ? HO_TABS : STORE_TABS;
  const [activeId, setActiveId] = useState(ORDERS.id);
  const [creating, setCreating] = useState(false);
  const tab = tabs.find((t) => t.id === activeId) ?? tabs[0];

  if (!storeId) {
    return (
      <div className="p-4">
        <div className="rounded-xl border border-border p-6 text-center text-sm text-muted-foreground">Select a store to see repairs.</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 pb-8">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground">{tab.hint}</p>
        {tab.NewForm && (
          <Button size="sm" variant={creating ? 'outline' : 'default'} className="h-10 shrink-0 gap-1.5" onClick={() => setCreating((c) => !c)}>
            {creating ? <><X className="h-3.5 w-3.5" /> Cancel</> : <><Plus className="h-3.5 w-3.5" /> {tab.newLabel}</>}
          </Button>
        )}
      </div>

      <PillTabs
        tabs={tabs}
        value={tab.id}
        onChange={(id) => { setActiveId(id); setCreating(false); }}
        getKey={(t) => t.id}
        variant="chip"
        scrollable
        className="-mx-4 px-4 pb-1"
      />

      {creating && tab.NewForm ? (
        <div key={`new-${tab.id}-${storeId}`} className="rounded-xl border border-border bg-card p-4">
          <tab.NewForm onDone={() => setCreating(false)} />
        </div>
      ) : (
        <RepairDocumentList
          key={`${tab.id}-${storeId}`}
          kind={tab.id}
          emptyTitle={tab.emptyTitle}
          showAmount={tab.showAmount}
        />
      )}
    </div>
  );
}

export default function RepairPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <RepairScreen />
    </Suspense>
  );
}
