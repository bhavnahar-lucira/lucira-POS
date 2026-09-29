'use client';

// Customer directory — search, list, view details, and attach a customer
// to the current cart session.
//
// Maps to: POST Services/POS/Customer/List (paginated, ~1400 customers)
//          POST Services/POS/Customer/GetCustomer (exact mobile lookup)
//
// Search behavior:
//   - A 10-digit mobile number triggers an exact lookup via GetCustomer
//     (same as the header Customer control).
//   - Any other text (2+ chars) hits Customer/List's own ContainsText
//     filter live (useCustomerSearch) — matches partial name OR mobile,
//     server-side, per search term (2026-09-28: replaced filtering a
//     locally-cached directory snapshot, which could miss/lag real data).
//   - Empty search shows the paginated browse list (50/page).
//
// "Edit customer" was requested but no update endpoint exists in
// API_MAPPING.md (Customer/Generate is create-only) — flagged as a
// blocker. The detail sheet is read-only with an Attach action.

import { useEffect, useRef, useState } from 'react';
import { Search, X, UserPlus, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import BottomSheet from '@/components/shared/BottomSheet';
import { StaggerList } from '@/components/shared/StaggerList';
import CustomerListItem from '@/components/features/customers/CustomerListItem';
import CustomerDetailSheet from '@/components/features/customers/CustomerDetailSheet';
import NewCustomerForm from '@/components/features/customers/NewCustomerForm';
import { useCustomerList } from '@/hooks/customer/useCustomerList';
import { useCustomerLookup } from '@/hooks/customer/useCustomerLookup';
import { useCustomerSearch } from '@/hooks/customer/useCustomerSearch';
import { useCart } from '@/hooks/cart/useCart';
import APP_CONFIG from '@/constants/appConfig';

const MOBILE_REGEX = /^\d{10}$/;

export default function CustomersPage() {
  const [inputVal, setInputVal] = useState('');
  const [searchQuery, setSearchQuery] = useState(''); // debounced value
  const [skip, setSkip] = useState(0);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [isNewCustomerOpen, setIsNewCustomerOpen] = useState(false);

  const debounceRef = useRef(null);

  const { customers, totalCount, take, isLoading, isFetching } = useCustomerList({ skip });
  const cart = useCart();

  const trimmed = searchQuery.trim();
  const isMobileSearch = MOBILE_REGEX.test(trimmed);
  const isNameSearch = !isMobileSearch && trimmed.length >= APP_CONFIG.SEARCH.MIN_QUERY_LENGTH;

  const { customer: lookedUpCustomer, isLoading: isLookingUp, notFound } = useCustomerLookup(
    trimmed,
    { enabled: isMobileSearch }
  );

  // API-backed search (2026-09-28) — hits Customer/List's own ContainsText
  // filter directly for every partial query, rather than filtering a
  // locally-cached directory snapshot (see useCustomerSearch.js). Query-key'd
  // per search term, so TanStack Query still avoids re-hitting the network
  // for a term already fetched within STALE_TIME.CUSTOMER — same caching
  // behavior any API call gets, not a local pre-load-everything shortcut.
  const { results: nameResults, isLoading: isNameSearching } = useCustomerSearch(trimmed, {
    enabled: isNameSearch,
  });

  // ── Debounced search input ──────────────────────────────
  const handleChange = (e) => {
    const val = e.target.value;
    setInputVal(val);
    clearTimeout(debounceRef.current);
    if (val.trim() === '') {
      setSearchQuery('');
      return;
    }
    debounceRef.current = setTimeout(() => setSearchQuery(val), APP_CONFIG.SEARCH.DEBOUNCE_MS);
  };

  const handleClear = () => {
    clearTimeout(debounceRef.current);
    setInputVal('');
    setSearchQuery('');
  };

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  const displayList = isMobileSearch
    ? (lookedUpCustomer ? [lookedUpCustomer] : [])
    : isNameSearch
      ? nameResults
      : customers;

  const totalPages = Math.max(1, Math.ceil(totalCount / take));
  const currentPage = Math.floor(skip / take) + 1;

  const wouldSwitchCustomer = (incomingId) => {
    if (cart.isEmpty) return false;
    if (!cart.customerId) return true; // guest cart with items
    return cart.customerId !== incomingId;
  };

  // Detaches the outgoing customer first (saving their cart under their own
  // id — see abandonedCartMiddleware's 'cart/detachCustomer' case) whenever
  // attaching would otherwise carry someone else's items over, then attaches
  // the new customer. No prompt, no choice — removed 2026-09-03. "Keep cart
  // & attach" used to misattribute the outgoing customer's items to whoever
  // was attaching next; now that every customer's cart is persisted
  // server-side and restored automatically next time THEY are attached
  // (same middleware), there's no reason to ever carry items across.
  const handleAttach = (customer) => {
    if (wouldSwitchCustomer(customer.customerId)) {
      cart.detachCustomer();
    }
    cart.attachCustomer(customer);
    setSelectedCustomer(null);
  };

  const isSearchActive = isMobileSearch || isNameSearch;
  const isBusy = isLoading
    || (isMobileSearch && isLookingUp)
    || (isNameSearch && isNameSearching);

  return (
    <div className="flex flex-col gap-4 max-w-3xl mx-auto w-full p-4 md:p-6">
      <div className='sticky top-0 z-10 -mx-4 -mt-4 flex flex-col gap-2 border-b border-border bg-background px-4 pt-4 pb-3 md:-mx-6 md:-mt-6 md:px-6 md:pt-6'>
        <div className='flex align-center justify-between gap-4'>
          <div className="relative w-full">
            <Search size={16} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              inputMode="search"
              placeholder="Search by name or mobile number"
              value={inputVal}
              onChange={handleChange}
              className="h-11 pl-9 pr-9"
              aria-label="Search customers"
            />
            {inputVal.length > 0 && (
              <button
                type="button"
                onClick={handleClear}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center h-7 w-7 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <X size={15} aria-hidden="true" />
              </button>
            )}
          </div>
          <Button type="button" onClick={() => setIsNewCustomerOpen(true)} className="gap-2 h-11">
            <UserPlus size={16} aria-hidden="true" />
            New Customer
          </Button>
        </div>
      </div>

      <StaggerList className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {isBusy ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            {isNameSearch ? 'Searching customers…' : 'Loading customers…'}
          </div>
        ) : isMobileSearch && notFound ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-sm text-muted-foreground">No customer found with this mobile number.</p>
            <Button type="button" variant="outline" onClick={() => setIsNewCustomerOpen(true)}>
              Create New Customer
            </Button>
          </div>
        ) : displayList.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10">
            {isSearchActive ? 'No matching customers found.' : 'No customers found.'}
          </p>
        ) : (
          displayList.map((customer) => (
            <CustomerListItem
              key={customer.customerId}
              customer={customer}
              onSelect={() => setSelectedCustomer(customer)}
            />
          ))
        )}
      </StaggerList>

      {/* Pagination — hidden while searching */}
      {!isSearchActive && totalCount > take && (
        <div className="flex items-center justify-between pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setSkip((s) => Math.max(0, s - take))}
            disabled={skip === 0 || isFetching}
            className="gap-1"
          >
            <ChevronLeft size={16} aria-hidden="true" />
            
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages} · {totalCount} customers
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setSkip((s) => s + take)}
            disabled={skip + take >= totalCount || isFetching}
            className="gap-1"
          >
            
            <ChevronRight size={16} aria-hidden="true" />
          </Button>
        </div>
      )}

      <CustomerDetailSheet
        customer={selectedCustomer}
        isOpen={!!selectedCustomer}
        onClose={() => setSelectedCustomer(null)}
        onAttach={() => handleAttach(selectedCustomer)}
        isAttached={cart.customerId === selectedCustomer?.customerId}
      />

      <BottomSheet
        isOpen={isNewCustomerOpen}
        onClose={() => setIsNewCustomerOpen(false)}
        title="New Customer"
      >
        <NewCustomerForm
          defaultMobile={isMobileSearch ? trimmed : ''}
          onCreated={(customer) => {
            handleAttach(customer);
            setIsNewCustomerOpen(false);
          }}
        />
      </BottomSheet>
    </div>
  );
}