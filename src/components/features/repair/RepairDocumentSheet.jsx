'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import InlineLoader from '@/components/shared/InlineLoader';
import {
  useRepairDocument, useTransferRepairOrder, useRecallRepairOrder,
  useAuthorizeRepairReceipt, useAuthorizeRepairIn,
} from '@/hooks/repair/useRepairs';
import { DOCUMENT_STATUS, REPAIR_LOCATION_TYPE } from '@/services/repairService';
import AuthorizeDialog from './AuthorizeDialog';
import {
  documentStatus, formatDateTime, formatINR, toneClass, weight, locationLabel, repairTypeLabel,
} from './repairFormat';

const TITLES = {
  orders: 'Repair Order',
  receipts: 'Receipt From HO',
  invoices: 'Repair Invoice',
  ins: 'Receipt From Store',
  outs: 'Return To Store',
};

function errorMessage(err) {
  return err?.response?.data?.Error?.Message ?? err?.serverMessage ?? err?.message ?? 'Something went wrong.';
}

function Fact({ label, value }) {
  if (value == null || value === '') return null;
  return (
    <div className="flex justify-between gap-3 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  );
}

export default function RepairDocumentSheet({ kind, id, billedInvoiceNo, onClose }) {
  const { data: doc, isLoading, isError, refetch } = useRepairDocument(kind, id);
  const transfer = useTransferRepairOrder();
  const recall = useRecallRepairOrder();
  const authorizeReceipt = useAuthorizeRepairReceipt();
  const authorizeIn = useAuthorizeRepairIn();
  const authorize = kind === 'ins' ? authorizeIn : authorizeReceipt;
  const [confirm, setConfirm] = useState(null);
  const [authOpen, setAuthOpen] = useState(false);

  const status = doc ? documentStatus(kind, doc, billedInvoiceNo) : null;
  const isPosted = doc?.document_status === DOCUMENT_STATUS.POSTED;
  const canTransfer = kind === 'orders' && isPosted && !billedInvoiceNo
    && doc?.repair_location_type === REPAIR_LOCATION_TYPE.HEAD_OFFICE && !doc?.is_transferred;
  const canRecall = kind === 'orders' && !billedInvoiceNo && doc?.is_transferred;
  const canAuthorize = (kind === 'receipts' || kind === 'ins') && doc && !doc.authorize
    && doc.document_status !== DOCUMENT_STATUS.CANCELLED && (doc.line_items?.length ?? 0) > 0;

  const runConfirm = async () => {
    const action = confirm;
    setConfirm(null);
    try {
      if (action === 'transfer') {
        await transfer.mutateAsync(id);
        toast.success(`${doc.document_no} sent to Head Office.`);
      } else if (action === 'recall') {
        await recall.mutateAsync(id);
        toast.success(`${doc.document_no} recalled from Head Office.`);
      }
      refetch();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const runAuthorize = async ({ username, password }) => {
    try {
      await authorize.mutateAsync({ id, username, password });
      toast.success(`${doc.document_no} authorised.`);
      setAuthOpen(false);
      refetch();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <Sheet open={!!id} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{doc?.document_no ?? TITLES[kind]}</SheetTitle>
          <SheetDescription>{TITLES[kind]}</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-4 pb-6">
          {isLoading && <InlineLoader />}
          {isError && <p className="text-sm text-destructive">Couldn&apos;t load this document from OrnaVerse.</p>}

          {doc && (
            <>
              <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-medium ${toneClass(status.tone)}`}>{status.label}</span>

              <div className="rounded-xl border border-border px-4 py-2">
                <Fact label={kind === 'orders' || kind === 'invoices' ? 'Customer' : 'From / to'} value={doc.party_name} />
                <Fact label="Mobile" value={doc.mobile} />
                <Fact label="Store" value={doc.company_code} />
                {kind === 'orders' && <Fact label="Item" value={repairTypeLabel(doc.repair_type)} />}
                {kind === 'orders' && <Fact label="Repaired at" value={locationLabel(doc.repair_location_type)} />}
                {(kind === 'receipts' || kind === 'ins') && doc.ref_document_id === 118 && <Fact label="Against" value="Return To Store from HO" />}
                <Fact label="Pieces / weight" value={`${doc.pieces ?? 0} pc · ${weight(doc.weight)}`} />
                {kind === 'invoices' && <Fact label="Amount" value={formatINR(doc.net_amount)} />}
                {kind === 'invoices' && <Fact label="Received" value={formatINR(doc.receipt_amount)} />}
                {kind === 'invoices' && <Fact label="Balance" value={formatINR(doc.balance_amount)} />}
                {kind === 'invoices' && <Fact label="Jewelry consultant" value={doc.employee_name} />}
                <Fact label="Issue / note" value={doc.narration} />
              </div>

              <div className="rounded-xl border border-border px-4 py-2">
                <p className="py-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Timeline</p>
                <Fact label="Created" value={formatDateTime(doc.creation_date ?? doc.document_date)} />
                <Fact label="Posted" value={doc.posting_date ? `${formatDateTime(doc.posting_date)}${doc.posted_by_name ? ` · ${doc.posted_by_name}` : ''}` : null} />
                <Fact label="Authorised" value={doc.authorized_date ? `${formatDateTime(doc.authorized_date)}${doc.authorized_by_name ? ` · ${doc.authorized_by_name}` : ''}` : null} />
                {kind === 'orders' && doc.repair_location_type === REPAIR_LOCATION_TYPE.HEAD_OFFICE && (
                  <Fact label="Sent to HO" value={doc.is_transferred ? 'Yes' : billedInvoiceNo ? 'Before OrnaVerse’s transfer step' : 'Not yet'} />
                )}
                {billedInvoiceNo && <Fact label="Billed on" value={billedInvoiceNo} />}
              </div>

              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Items ({doc.line_items?.length ?? 0})</p>
                {(doc.line_items ?? []).map((line) => (
                  <div key={line.transaction_item_id ?? `${line.item_code}-${line.item_line_no}`} className="rounded-xl border border-border p-3">
                    <p className="text-sm font-medium text-foreground">{line.item_name ?? line.item_code}</p>
                    <p className="text-xs text-muted-foreground">
                      {line.item_code}{line.bag_no ? ` · ${line.bag_no}` : ''}{line.new_bag_no ? ` · ${line.new_bag_no}` : ''}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {line.pieces ?? 0} pc · gross {weight(line.weight)} · net {weight(line.net_weight)}
                    </p>
                    {kind === 'invoices' && (
                      <p className="mt-1 text-xs text-foreground">
                        Repair charge {formatINR(line.sub_total)} · tax {formatINR(line.tax_amount)}
                      </p>
                    )}
                  </div>
                ))}
                {!doc.line_items?.length && <p className="text-sm text-muted-foreground">No items on this document.</p>}
              </div>

              {canTransfer && (
                <Button className="h-12" disabled={transfer.isPending} onClick={() => setConfirm('transfer')}>
                  {transfer.isPending ? 'Sending…' : 'Send to Head Office'}
                </Button>
              )}
              {canRecall && (
                <Button variant="outline" className="h-12" disabled={recall.isPending} onClick={() => setConfirm('recall')}>
                  {recall.isPending ? 'Recalling…' : 'Recall from Head Office'}
                </Button>
              )}
              {canAuthorize && (
                <Button className="h-12" onClick={() => setAuthOpen(true)}>Authorise receipt</Button>
              )}
            </>
          )}
        </div>

        <ConfirmDialog
          isOpen={!!confirm}
          onOpenChange={(open) => !open && setConfirm(null)}
          title={confirm === 'transfer' ? 'Send to Head Office?' : 'Recall from Head Office?'}
          description={confirm === 'transfer'
            ? 'Head Office will receive this repair order in Receipt From Store.'
            : 'This only works while Head Office has not authorised the receipt yet.'}
          confirmLabel={confirm === 'transfer' ? 'Send' : 'Recall'}
          onConfirm={runConfirm}
        />
        <AuthorizeDialog
          open={authOpen}
          onOpenChange={setAuthOpen}
          documentNo={doc?.document_no}
          isPending={authorize.isPending}
          onAuthorize={runAuthorize}
        />
      </SheetContent>
    </Sheet>
  );
}
