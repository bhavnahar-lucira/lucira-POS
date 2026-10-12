'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, IdCard, ShieldAlert } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import PanDocumentUpload from '@/components/shared/PanDocumentUpload';
import { useCustomerSession } from '@/hooks/customer/useCustomerSession';
import { useRetrieveCustomer } from '@/hooks/customer/useRetrieveCustomer';
import { useUpdateCustomer } from '@/hooks/customer/useUpdateCustomer';
import { PAN_REGEX } from '@/validators/customerSchema';
import APP_CONFIG from '@/constants/appConfig';

/**
 * @param {{
 *   totalAmount: number,
 *   onPanResolved: (pan: string|null) => void,
 *   onPanDocumentResolved: (path: string|null) => void,
 * }} props
 */
export default function CheckoutPanCapture({ totalAmount, onPanResolved, onPanDocumentResolved }) {
  const { customerId, isAttached } = useCustomerSession();
  const panRequired = totalAmount > APP_CONFIG.COMPLIANCE.PAN_MANDATORY_THRESHOLD;

  const { customer, isLoading } = useRetrieveCustomer(customerId, {
    enabled: isAttached && panRequired,
  });
  const updateCustomer = useUpdateCustomer();

  const [value, setValue] = useState('');
  const [justSavedPan, setJustSavedPan] = useState(null);
  const [justSavedDocument, setJustSavedDocument] = useState(null);
  const rawPanOnFile = customer?.customerPan ?? null;
  const fetchedPanOnFile = rawPanOnFile && PAN_REGEX.test(rawPanOnFile) ? rawPanOnFile : null;
  const panOnFile = fetchedPanOnFile ?? justSavedPan;
  const documentOnFile = justSavedDocument ?? customer?.customerPanDocument ?? null;

  // useUpdateCustomer only INVALIDATES the customer query on success, it
  // doesn't patch the cache — so saving the PAN number then immediately
  // uploading the document (or vice versa) can fire the second Customer/
  // Update from a still-stale customer.raw that doesn't have the first
  // save yet. buildCustomerUpdatePayload does a full-entity merge, so that
  // second save silently writes the first field back to its old value on
  // OrnaVerse's side even though both show as "on file" here — confirmed
  // 2026-10-12: Invoice/Create then rejects with "Please upload PAN & its
  // number" despite the operator having just seen both saved. Overlaying
  // what THIS session just saved onto the raw record closes that race for
  // whichever of the two saves fires second.
  const effectiveRaw = customer?.raw ? {
    ...customer.raw,
    ...(justSavedPan ? { pan_no: justSavedPan } : null),
    ...(justSavedDocument ? { pan_document: justSavedDocument } : null),
  } : customer?.raw;

  useEffect(() => {
    onPanResolved(panRequired ? panOnFile : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panRequired, panOnFile]);

  useEffect(() => {
    onPanDocumentResolved(panRequired ? documentOnFile : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panRequired, documentOnFile]);

  if (!isAttached || !panRequired) return null;

  const isValid = PAN_REGEX.test(value);

  const handleSave = () => {
    if (!isValid || !effectiveRaw) return;
    const savedValue = value;
    updateCustomer.mutate({
      partyId: customerId,
      originalRaw: effectiveRaw,
      formChanges: { pan_no: savedValue, party_name: customer.customerName },
    }, {
      onSuccess: () => setJustSavedPan(savedValue),
    });
  };

  // Rendered in both the "on file" and entry-form branches below.
  const documentBlock = (
    <PanDocumentUpload
      customerId={customerId}
      customerName={customer?.customerName}
      originalRaw={effectiveRaw}
      savedPath={customer?.customerPanDocument ?? null}
      onSaved={setJustSavedDocument}
    />
  );

  if (panOnFile) {
    return (
      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-sm font-bold text-foreground mb-2 flex items-center gap-1.5">
          <IdCard size={16} className="text-accent shrink-0" aria-hidden="true" />
          PAN Details <span className="text-destructive">*</span>
        </h2>
        <p className="flex items-center gap-1.5 text-sm text-status-in-stock mb-3">
          <CheckCircle2 size={15} className="shrink-0" aria-hidden="true" />
          PAN on file: <span className="font-mono font-semibold">{panOnFile}</span>
        </p>
        {documentBlock}
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <h2 className="text-sm font-bold text-foreground mb-1 flex items-center gap-1.5">
        <IdCard size={16} className="text-accent shrink-0" aria-hidden="true" />
        PAN Details <span className="text-destructive">*</span>
      </h2>
      <p className="flex items-center gap-1.5 text-xs text-status-made-order mb-3">
        <ShieldAlert size={13} className="shrink-0" aria-hidden="true" />
        PAN is mandatory for orders above ₹{APP_CONFIG.COMPLIANCE.PAN_MANDATORY_THRESHOLD.toLocaleString('en-IN')}
      </p>

      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value.toUpperCase())}
              placeholder="ABCDE1234F"
              maxLength={10}
              disabled={isLoading || updateCustomer.isPending}
              aria-label="Customer PAN"
              className="h-11 uppercase"
            />
            {value.length > 0 && !isValid && (
              <p className="mt-1 text-xs text-destructive">Enter a valid PAN (e.g. ABCDE1234F)</p>
            )}
          </div>
          <Button
            type="button"
            onClick={handleSave}
            disabled={!isValid || isLoading || updateCustomer.isPending}
            className="h-11 shrink-0"
          >
            {updateCustomer.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
        {documentBlock}
      </div>
    </section>
  );
}
