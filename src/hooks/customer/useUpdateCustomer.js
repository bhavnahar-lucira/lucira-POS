import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { updateCustomer } from '@/services/customerService';
import { buildCustomerUpdatePayload } from '@/lib/normalizers/customer';
import { normalizeCustomer } from '@/lib/normalizers/customer';
import { QUERY_KEYS } from '@/constants/queryKeys';
import TOAST from '@/constants/toastMessages';

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
    
    onError: (error) => {
      toast.error(error?.serverMessage ?? TOAST.CUSTOMER.UPDATE_FAILED);
    },
  });

  return mutation;
}