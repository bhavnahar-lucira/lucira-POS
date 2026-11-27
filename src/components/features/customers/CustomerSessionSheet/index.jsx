'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import Link from 'next/link';
import { ChevronLeft, History, Loader2, UserCircle } from 'lucide-react';
import BottomSheet from '@/components/shared/BottomSheet';
import CustomerLookupInput from '../CustomerLookupInput';
import CustomerDisplayCard from '../CustomerDisplayCard';
import CustomerListItem from '../CustomerListItem';
import NewCustomerForm from '../NewCustomerForm';
import { Button } from '@/components/ui/button';
import { useCustomerLookup } from '@/hooks/customer/useCustomerLookup';
import { useCustomerSearch } from '@/hooks/customer/useCustomerSearch';
import { useCustomerSession } from '@/hooks/customer/useCustomerSession';
import WalkInPrompt from '../WalkInPrompt';
import { useWalkInLookup } from '@/hooks/customer/useWalkInLookup';
import { useCart } from '@/hooks/cart/useCart';
import { useEndCustomerVisit } from '@/components/features/voc/VocEndVisitProvider';
import { useSelector } from 'react-redux';
import { selectActiveStoreId } from '@/store/slices/storeSlice';
import TOAST from '@/constants/toastMessages';
import APP_CONFIG from '@/constants/appConfig';
import { indianMobileFromQuery } from '@/lib/phoneFormat';

function AttachActions({ onAttach }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Button type="button" variant="outline" onClick={() => onAttach(false)} className="h-11">
        Attach to session
      </Button>
      <Button type="button" onClick={() => onAttach(true)} className="h-11">
        Record walk-in
      </Button>
    </div>
  );
}

/**
 * @param {{
 *   isOpen: boolean,
 *   onClose: () => void,
 * }} props
 */
export default function CustomerSessionSheet({ isOpen, onClose }) {
  const [searchQuery, setSearchQuery] = useState(null);
  const [nameResultSelection, setNameResultSelection] = useState(null);

  const session = useCustomerSession();
  const { isEmpty } = useCart();
  const { endVisit } = useEndCustomerVisit();

  const trimmed = (searchQuery ?? '').trim();
  const mobileQuery = indianMobileFromQuery(trimmed);
  const isMobileSearch = !!mobileQuery;
  const isNameSearch   = !isMobileSearch && trimmed.length >= APP_CONFIG.SEARCH.MIN_QUERY_LENGTH;

  const { customer: mobileMatch, isLoading, isError, notFound } = useCustomerLookup(mobileQuery ?? '', {
    enabled: isMobileSearch,
  });
  const companyId = useSelector(selectActiveStoreId);
  const [promptCustomer, setPromptCustomer] = useState(null);
  const walkIn = useWalkInLookup();
  const { results: nameResults, isLoading: isNameSearching } = useCustomerSearch(trimmed, {
    enabled: isNameSearch,
  });
  const customer = isMobileSearch ? mobileMatch : nameResultSelection;

  useEffect(() => {
    if (isError && isMobileSearch) {
      toast.error(TOAST.CUSTOMER.LOAD_FAILED);
    }
  }, [isError, isMobileSearch]);

  const handleSearch = (query) => {
    setNameResultSelection(null);
    setSearchQuery(query);
  };

  const handleClose = () => {
    setSearchQuery(null);
    setNameResultSelection(null);
    onClose();
  };

  const wouldSwitchCustomer = (incomingCustomerId) => {
    if (isEmpty) return false;
    if (!session.isAttached) return false; // guest cart with items — attach() alone merges, nothing to detach
    return session.customerId !== incomingCustomerId;
  };

  const recordWalkIn = async (customerToRecord) => {
    const raw = [customerToRecord.customerContactMobile, customerToRecord.customerMobile].find((m) => m && !String(m).includes('*'));
    const mobile = String(raw ?? '').replace(/\D/g, '').slice(-10);
    if (mobile.length !== 10 || !companyId) {
      toast.error('Customer attached, but the walk-in needs their full mobile — search by mobile number to record it.');
      return;
    }
    try {
      const result = await walkIn.lookupAsync(mobile);
      if (!result.found) setPromptCustomer({ ...customerToRecord, customerMobile: mobile, isNew: true });
      else if (result.walkInRecorded) setPromptCustomer({ ...customerToRecord, customerMobile: mobile, visitId: result.visitId });
      else toast.info(result.message || 'This customer’s walk-in is already recorded in the last few hours.');
    } catch (err) {
      toast.error(err?.serverMessage ?? 'Could not record the walk-in — the customer is attached.');
    }
  };

  const performAttach = (customerToAttach, options, { recordVisit = false, isNew = false } = {}) => {
    const attachNow = () => {
      if (wouldSwitchCustomer(customerToAttach.customerId)) {
        session.detach();
      }
      session.attach(customerToAttach, options);
      if (isNew) setPromptCustomer({ ...customerToAttach, isNew: true });
      else if (recordVisit) recordWalkIn(customerToAttach);
    };
    handleClose();
    // Switching to another customer ends the current one's visit, so offer their feedback first.
    if (session.isAttached && session.customerId !== customerToAttach.customerId) endVisit(attachNow);
    else attachNow();
  };

  const handleAttachFound = (recordVisit) => {
    performAttach({ ...customer, customerContactMobile: isMobileSearch ? mobileQuery : null }, undefined, { recordVisit });
  };

  const handleSelectNameResult = (selected) => {
    setNameResultSelection(selected);
  };

  const handleNewCustomerCreated = (newCustomer) => {
    performAttach(newCustomer, { silent: true }, { isNew: true });
  };

  const handleDetach = () => {
    handleClose();
    endVisit(session.detach);
  };

  return (
    <>
      <BottomSheet
        isOpen={isOpen}
        onClose={handleClose}
        title="Customer"
      >
        <div className="flex flex-col gap-4">
          {session.isAttached && !searchQuery && (
            <>
              <CustomerDisplayCard
                customer={{
                  customerId: session.customerId,
                  customerName: session.customerName,
                  customerMobile: session.customerMobile,
                }}
                onDetach={handleDetach}
                detachLabel="Remove"
              />

              <Button asChild type="button" variant="outline" className="h-11 w-full gap-2">
                <Link
                  href={`/customers/${session.customerId}${session.customerName ? `?name=${encodeURIComponent(session.customerName)}` : ''}`}
                  onClick={handleClose}
                >
                  <UserCircle size={16} />
                  View Full Profile
                </Link>
              </Button>

              <Button asChild type="button" variant="outline" className="h-11 w-full gap-2">
                <Link
                  href={`/customers/${session.customerId}?tab=history${session.customerName ? `&name=${encodeURIComponent(session.customerName)}` : ''}`}
                  onClick={handleClose}
                >
                  <History size={16} />
                  Purchase History
                </Link>
              </Button>

              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="h-px flex-1 bg-border" />
                <span>or switch customer</span>
                <div className="h-px flex-1 bg-border" />
              </div>
            </>
          )}

          <CustomerLookupInput onSearch={handleSearch} isLoading={isLoading || isNameSearching} />

          {isMobileSearch && customer && (
            <div className="flex flex-col gap-3">
              <CustomerDisplayCard customer={customer} />
              <AttachActions onAttach={handleAttachFound} />
            </div>
          )}
          {isMobileSearch && notFound && (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">{TOAST.CUSTOMER.NOT_FOUND}</p>
              <p className="text-sm font-semibold text-foreground/80">Create New Customer</p>
              <NewCustomerForm
                defaultMobile={mobileQuery}
                onCreated={handleNewCustomerCreated}
              />
            </div>
          )}

          {isNameSearch && isNameSearching && (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              Searching customers…
            </div>
          )}

          {isNameSearch && !isNameSearching && nameResultSelection && (
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={() => { setNameResultSelection(null); }}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground/80 w-fit"
              >
                <ChevronLeft size={15} aria-hidden="true" />
                Back to results
              </button>
              <CustomerDisplayCard customer={customer} />
              <AttachActions onAttach={handleAttachFound} />
            </div>
          )}

          {isNameSearch && !isNameSearching && !nameResultSelection && nameResults.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-muted-foreground">{nameResults.length} match{nameResults.length === 1 ? '' : 'es'}</p>
              {nameResults.map((c) => (
                <CustomerListItem
                  key={c.customerId}
                  customer={c}
                  onSelect={() => handleSelectNameResult(c)}
                />
              ))}
            </div>
          )}

          {isNameSearch && !isNameSearching && !nameResultSelection && nameResults.length === 0 && (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">No matching customers found.</p>
              <p className="text-sm font-semibold text-foreground/80">Create New Customer</p>
              <NewCustomerForm onCreated={handleNewCustomerCreated} />
            </div>
          )}
        </div>
      </BottomSheet>
      <WalkInPrompt customer={promptCustomer} onClose={() => setPromptCustomer(null)} />
    </>
  );
}