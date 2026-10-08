'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import Link from 'next/link';
import { ChevronLeft, Loader2, UserCircle } from 'lucide-react';
import BottomSheet from '@/components/shared/BottomSheet';
import CustomerLookupInput from '../CustomerLookupInput';
import CustomerDisplayCard from '../CustomerDisplayCard';
import CustomerListItem from '../CustomerListItem';
import NewCustomerForm from '../NewCustomerForm';
import { Button } from '@/components/ui/button';
import { useCustomerLookup } from '@/hooks/customer/useCustomerLookup';
import { useCustomerSearch } from '@/hooks/customer/useCustomerSearch';
import { useCustomerSession } from '@/hooks/customer/useCustomerSession';
import { useWalkInLookup } from '@/hooks/customer/useWalkInLookup';
import { useCart } from '@/hooks/cart/useCart';
import TOAST from '@/constants/toastMessages';
import APP_CONFIG from '@/constants/appConfig';

const MOBILE_REGEX = /^\d{10}$/;

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

  const trimmed = (searchQuery ?? '').trim();
  const isMobileSearch = MOBILE_REGEX.test(trimmed);
  const isNameSearch   = !isMobileSearch && trimmed.length >= APP_CONFIG.SEARCH.MIN_QUERY_LENGTH;

  const { customer: mobileMatch, isLoading, isError, notFound } = useCustomerLookup(trimmed, {
    enabled: isMobileSearch,
  });
  const walkIn = useWalkInLookup();
  const walkInKnown = walkIn.result?.found ? walkIn.result.customer : null;
  // Server dedupes to one walk-in per customer per 4 hours — a found
  // customer very often means no NEW visit got recorded this time.
  // CONFIRMED LIVE 2026-10-08: must reflect that, not always say "recorded".
  const walkInStatusText = walkIn.result?.walkInRecorded
    ? 'Visit recorded'
    : (walkIn.result?.message ?? 'Already visited recently');
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
    walkIn.reset();
    const trimmedQuery = query.trim();
    if (MOBILE_REGEX.test(trimmedQuery)) {
      walkIn.lookup(trimmedQuery);
    }
  };

  const handleClose = () => {
    setSearchQuery(null);
    setNameResultSelection(null);
    walkIn.reset();
    onClose();
  };

  const wouldSwitchCustomer = (incomingCustomerId) => {
    if (isEmpty) return false;
    if (!session.isAttached) return false; // guest cart with items — attach() alone merges, nothing to detach
    return session.customerId !== incomingCustomerId;
  };

  const performAttach = (customerToAttach, options) => {
    if (wouldSwitchCustomer(customerToAttach.customerId)) {
      session.detach();
    }
    session.attach(customerToAttach, options);
    // The single point a customer actually becomes "the one in the
    // session" — recording here (not just on search keystrokes) covers
    // every attach path, including a freshly-created customer, which
    // otherwise never recorded a visit at all.
    if (customerToAttach.customerMobile) {
      walkIn.lookup(customerToAttach.customerMobile);
    }
    handleClose();
  };

  const handleAttachFound = () => {
    performAttach(customer);
  };

  const handleSelectNameResult = (selected) => {
    setNameResultSelection(selected);
    walkIn.reset();
    if (selected?.customerMobile) {
      walkIn.lookup(selected.customerMobile);
    }
  };

  const handleNewCustomerCreated = (newCustomer) => {
    performAttach(newCustomer, { silent: true });
  };

  const handleDetach = () => {
    session.detach();
    handleClose();
  };

  return (
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
              {walkInKnown && (
                <p className="text-xs text-muted-foreground">
                  {walkInStatusText}{walkInKnown.name ? ` — welcome back, ${walkInKnown.name}` : ' — welcome back'}.
                </p>
              )}
              <CustomerDisplayCard customer={customer} />
              <Button type="button" onClick={handleAttachFound} className="h-11">
                Assign to Session
              </Button>
            </div>
          )}
          {isMobileSearch && notFound && walkIn.isLoading && (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              Checking visit history…
            </div>
          )}
          
          {isMobileSearch && notFound && !walkIn.isLoading && walkInKnown && (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                {walkInKnown.name ? `Welcome back, ${walkInKnown.name}.` : 'Welcome back.'} They&apos;ve visited before but aren&apos;t a registered customer yet.
              </p>
              <p className="text-sm font-semibold text-foreground/80">Complete Customer Signup</p>
              <NewCustomerForm
                defaultMobile={trimmed}
                defaultName={walkInKnown.name ?? ''}
                onCreated={handleNewCustomerCreated}
              />
            </div>
          )}

          {isMobileSearch && notFound && !walkIn.isLoading && !walkInKnown && (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">{TOAST.CUSTOMER.NOT_FOUND}</p>
              <p className="text-sm font-semibold text-foreground/80">Create New Customer</p>
              <NewCustomerForm
                defaultMobile={trimmed}
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
                onClick={() => { setNameResultSelection(null); walkIn.reset(); }}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground/80 w-fit"
              >
                <ChevronLeft size={15} aria-hidden="true" />
                Back to results
              </button>
              {walkIn.isLoading && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Loader2 size={12} className="animate-spin" aria-hidden="true" />
                  Recording visit…
                </p>
              )}
              {walkInKnown && (
                <p className="text-xs text-muted-foreground">
                  {walkInStatusText}{walkInKnown.name ? ` — welcome back, ${walkInKnown.name}` : ' — welcome back'}.
                </p>
              )}
              <CustomerDisplayCard customer={customer} />
              <Button type="button" onClick={handleAttachFound} className="h-11">
                Assign to Session
              </Button>
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
  );
}