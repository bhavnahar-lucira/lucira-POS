// src/hooks/customer/useCreateCustomer.js
// Create a new customer via POS/Customer/Create.
// Checks for an existing customer by mobile first (matches CustomerSessionSheet's
// lookup-first behavior) to avoid duplicates; lookup failure fails open into create.
// Response shape: SaveResponse { EntityId, Error, CustomData }.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { toast } from 'sonner';
import { createCustomer, getCustomer } from '@/services/customerService';
import { buildCustomerCreatePayload, normalizeCustomer } from '@/lib/normalizers/customer';
import { selectActiveStoreId } from '@/store/slices/storeSlice';
import { QUERY_KEYS } from '@/constants/queryKeys';
import TOAST from '@/constants/toastMessages';

// Fire-and-forget — see api/customers/shopify-sync/route.js for why this
// exists (OrnaVerse's own push to Shopify drops the phone number, breaking
// Nector's mobile-based loyalty lookup). Never blocks or fails customer
// creation if Shopify errors.
function syncCustomerToShopify({ party_id, party_name, mobile, email }) {
  fetch('/api/customers/shopify-sync', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ party_id, party_name, mobile, email }),
  }).catch((err) => console.warn('[syncCustomerToShopify] failed', err));
}

export function useCreateCustomer() {
  const queryClient   = useQueryClient();
  const activeStoreId = useSelector(selectActiveStoreId);

  const mutation = useMutation({
    mutationFn: async (formValues) => {
      try {
        const lookupResponse = await getCustomer(formValues.mobile);
        const existing = lookupResponse?.data?.Entities?.[0] ?? null;
        if (existing) {
          return { _existing: true, customer: normalizeCustomer(existing) };
        }
      } catch {
        // Lookup failed — proceed to create (fail-open, not fail-closed)
      }

      const entity = buildCustomerCreatePayload({
        ...formValues,
        company_id: activeStoreId,
      });
      const response = await createCustomer(entity);
      return { _existing: false, response };
    },

    onSuccess: (result, formValues) => {
      const customerName   = formValues.party_name;
      const customerMobile = formValues.mobile;

      if (result._existing) {
        toast.info(`Customer ${customerName} already exists. Using existing record.`);
      } else {
        const customerId = result.response?.data?.EntityId;
        toast.success(TOAST.CUSTOMER.CREATED(customerName));
        syncCustomerToShopify({
          party_id:   customerId,
          party_name: customerName,
          mobile:     customerMobile,
          email:      formValues.email,
        });

        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.CUSTOMERS.LOOKUP(customerMobile),
        });
        queryClient.invalidateQueries({ queryKey: ['customers'] });
      }
    },

    // See useUpdateCustomer.js's identical fix — same reasoning, same
    // real repro (a duplicate mobile number returning a specific, useful
    // OrnaVerse message that this used to silently discard).
    onError: (error) => {
      toast.error(error?.serverMessage ?? TOAST.CUSTOMER.CREATE_FAILED);
    },
  });

  // Wrap mutateAsync to always return { customerId, customerName, customerMobile }
  const wrappedMutation = {
    ...mutation,
    mutateAsync: async (formValues) => {
      const result = await mutation.mutateAsync(formValues);

      if (result._existing) {
        return {
          customerId:     result.customer.customerId,
          customerName:   result.customer.customerName,
          customerMobile: result.customer.customerMobile,
          _existing:      true,
        };
      }

      return {
        customerId:     result.response?.data?.EntityId,
        customerName:   formValues.party_name,
        customerMobile: formValues.mobile,
        _existing:      false,
      };
    },
  };

  return wrappedMutation;
}