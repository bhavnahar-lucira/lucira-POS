'use client';

// BottomSheet-based sheet for the header Customer Session control.
// Flow: lookup by mobile (exact match) OR name/partial-mobile (live API
// search via Customer/List's ContainsText, may return several) -> show
// found customer(s) (attach/detach) or "not found" -> NewCustomerForm.
// Search is live as-you-type (2026-09-28, CustomerLookupInput) — no submit
// step, and clearing the box immediately clears results too.
//
// Trust/session-hygiene: if the cart already has items under a DIFFERENT
// real, already-attached customer, the outgoing cart is now ALWAYS detached
// (saved under its own owner, then cleared) before the new customer attaches
// — no more "Keep Cart" choice. A guest cart (no customer attached yet) is
// NOT detached first — see wouldSwitchCustomer below for why that would
// destroy the operator's own just-added items instead of protecting anyone.
//
// REMOVED 2026-09-03 — "Keep Cart" used to leave the outgoing customer's
// items sitting in the cart, which abandonedCartMiddleware's own
// 'cart/attachCustomer' case then saved under the NEWLY-attached customer
// (wrong owner) rather than the one who actually added them. Now that every
// customer's cart is persisted server-side and restored automatically the
// next time THEY are attached (same middleware), there's no reason to ever
// carry items into a different customer's session — detaching first (not a
// bare clearCart(), which means "this cart is resolved" and DELETES the
// saved record) is what actually preserves the outgoing customer's cart for
// them to pick back up later. Detaching no longer prompts either
// (2026-08-24) — cartSlice's detachCustomer reducer always saves-then-clears
// unconditionally — so switching customers is now fully automatic.

import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
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

  // Store-entry check-in — fired once per mobile search from handleSearch
  // below (never auto-refetched, since every call also records a visit).
  // walkIn.result.customer, when present, is a CRM-level profile that may
  // or may not correspond to a registered billing customer (party) — see
  // normalizeWalkInCustomer for why the two must never be conflated.
  const walkIn = useWalkInLookup();
  const walkInKnown = walkIn.result?.found ? walkIn.result.customer : null;

  // API-backed search (2026-09-28) — hits Customer/List's own ContainsText
  // filter directly per search term (name OR mobile, partial or full — e.g.
  // "8149" finds "8149639991"), instead of filtering a locally-cached
  // directory snapshot. See useCustomerSearch.js.
  const { results: nameResults, isLoading: isNameSearching } = useCustomerSearch(trimmed, {
    enabled: isNameSearch,
  });

  // The customer currently under consideration for attach — either the
  // exact mobile match, or whichever name-search result was tapped.
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

  // Does attaching `incomingCustomerId` risk carrying over a DIFFERENT real
  // customer's cart? A guest cart (no customerId yet) has no owner to
  // misattribute — reported directly (2026-09-30): treating "not yet
  // attached" as "would switch" forced a detach first even for a guest's own
  // walk-in basket, and detachCustomer's reducer clears items unconditionally
  // (there being no customerId to save them under), wiping the very items the
  // operator just added the moment ANY customer was picked. Attaching straight
  // over a guest cart is safe: attachCustomer's own reducer only clears items
  // when switching between two real, different customerIds, and
  // abandonedCartMiddleware's 'cart/attachCustomer' case merges in this
  // customer's own saved abandoned cart rather than replacing anything.
  const wouldSwitchCustomer = (incomingCustomerId) => {
    if (isEmpty) return false;
    if (!session.isAttached) return false; // guest cart with items — attach() alone merges, nothing to detach
    return session.customerId !== incomingCustomerId;
  };

  // Detaches the outgoing customer first (saving their cart under their own
  // id — see abandonedCartMiddleware's 'cart/detachCustomer' case) only when
  // switching from one real, already-attached customer to a different one —
  // never for a guest cart (see wouldSwitchCustomer above).
  const performAttach = (customerToAttach, options) => {
    if (wouldSwitchCustomer(customerToAttach.customerId)) {
      session.detach();
    }
    session.attach(customerToAttach, options);
    handleClose();
  };

  const handleAttachFound = () => {
    performAttach(customer);
  };

  // A name-search result was tapped — record the walk-in visit right away
  // (mirrors handleSearch's mobile-search path), so the "Visit recorded"
  // note is visible before the staff commits to attaching.
  //
  // RESOLVED 2026-09-08 — this used to be a documented, accepted
  // limitation: Customer/List and Customer/Retrieve were confirmed live
  // 2026-07-21 to both pre-mask mobile ("******9991"), which would make
  // this WALKIN.LOOKUP call always miss. Re-confirmed live against LIVE
  // (both Customer/List and Customer/Retrieve, several unrelated real
  // customers each) that this tenant does NOT mask mobile/email — full
  // digits come back from a name search exactly as they would from typing
  // the number directly. selected.customerMobile here is real, so this
  // now works correctly for a name-search attach too, no fix needed beyond
  // this comment no longer describing a limitation that isn't there.
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

  // No confirmation needed (2026-08-24) — cartSlice's detachCustomer reducer
  // now always saves the outgoing customer's cart to Mongo and clears it
  // locally, unconditionally. See that reducer's own comment.
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

              {/* Redirect to full profile — only shown once a customer is
                  actually attached (2026-08-13); there's nothing to view a
                  profile for before that.
                  ROLLED BACK 2026-09-08 — used to build a name-first slug
                  (/customers/tahir-kutty-12345); reverted to the plain id
                  route after that broke loading the profile. Name still
                  passed as ?name= so the destination can show it while
                  loading — see that page's own fallbackCustomerName. */}
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
                  Visit recorded{walkInKnown.name ? ` — welcome back, ${walkInKnown.name}` : ' — welcome back'}.
                </p>
              )}
              <CustomerDisplayCard customer={customer} />
              <Button type="button" onClick={handleAttachFound} className="h-11">
                Assign to Session
              </Button>
            </div>
          )}

          {/* Mobile search: not found as a billing customer — still checking
              whether they're a known walk-in before deciding what to show */}
          {isMobileSearch && notFound && walkIn.isLoading && (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              Checking visit history…
            </div>
          )}

          {/* Mobile search: not found, and a known walk-in (visited before,
              never registered as a billing customer) -> signup, name pre-filled */}
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
                  Visit recorded{walkInKnown.name ? ` — welcome back, ${walkInKnown.name}` : ' — welcome back'}.
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