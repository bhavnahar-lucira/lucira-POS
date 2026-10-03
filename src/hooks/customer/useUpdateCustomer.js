// Update an existing customer via POS/Customer/Update.
//
// IMPORTANT: OrnaVerse requires the FULL CustomerRow on update.
// Always: retrieveCustomer() → merge changes → updateCustomer()
// Never send partial updates — missing fields will be cleared.
// buildCustomerUpdatePayload() in normalizers/customer.js handles this merge.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { updateCustomer } from '@/services/customerService';
import { buildCustomerUpdatePayload } from '@/lib/normalizers/customer';
import { normalizeCustomer } from '@/lib/normalizers/customer';
import { QUERY_KEYS } from '@/constants/queryKeys';
import TOAST from '@/constants/toastMessages';

// Fire-and-forget — mirrors useCreateCustomer.js's syncCustomerToShopify.
// Looked up by the ORIGINAL mobile/email (what Shopify already has on file)
// since the edit itself may be what changed one of those; applies the NEW
// party_name/mobile/email onto that record. Never blocks or fails the
// OrnaVerse update if Shopify errors. See api/customers/shopify-sync/route.js.
function syncCustomerUpdateToShopify({ party_name, mobile, email, originalMobile, originalEmail }) {
  fetch('/api/customers/shopify-sync', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      action: 'update', party_name, mobile, email, originalMobile, originalEmail,
    }),
  }).catch((err) => console.warn('[syncCustomerUpdateToShopify] failed', err));
}

export function useUpdateCustomer() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    /**
     * @param {{
     *   partyId:     number,
     *   originalRaw: object,   — raw entity from Customer/Retrieve
     *   formChanges: object,   — only the changed fields from the edit form
     * }} params
     */
    mutationFn: ({ partyId, originalRaw, formChanges }) => {
      const mergedEntity = buildCustomerUpdatePayload(originalRaw, formChanges);
      return updateCustomer(partyId, mergedEntity);
    },

    onSuccess: (response, { partyId, originalRaw, formChanges }) => {
      const customerName = formChanges.party_name;
      toast.success(TOAST.CUSTOMER.UPDATED(customerName));

      syncCustomerUpdateToShopify({
        party_name:     formChanges.party_name,
        mobile:         formChanges.mobile,
        email:          formChanges.email,
        originalMobile: originalRaw.mobile,
        originalEmail:  originalRaw.email && originalRaw.email !== 'NA' ? originalRaw.email : null,
      });

      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CUSTOMERS.RETRIEVE(partyId) });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },

    // FIXED 2026-09-26 (reported directly, and reproduced live: editing a
    // customer's mobile to one already used by another party) — this used
    // to always show a generic "Failed to update customer" regardless of
    // WHY, silently discarding OrnaVerse's own specific reason (e.g. "mobile
    // number already exists"). normalizeError (interceptors.js) already
    // lifts that onto error.serverMessage for exactly this purpose — same
    // pattern useCreateInvoice.js's onError already uses.
    onError: (error) => {
      toast.error(error?.serverMessage ?? TOAST.CUSTOMER.UPDATE_FAILED);
    },
  });

  return mutation;
}