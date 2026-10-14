import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { updateCustomer, retrieveCustomer } from '@/services/customerService';
import { buildCustomerUpdatePayload, isMaskedValue } from '@/lib/normalizers/customer';
import { normalizeCustomer } from '@/lib/normalizers/customer';
import { QUERY_KEYS } from '@/constants/queryKeys';
import TOAST from '@/constants/toastMessages';

// OrnaVerse's own Customer/Update can return a normal 200 while silently
// NOT persisting the change — confirmed directly (2026-10-12) on OrnaVerse's
// own native client, logged in as a non-admin operator: the UI showed the
// edited PAN number as "updated", but logging back in as admin showed the
// field unchanged; only the admin's own re-save actually stuck. A 200
// response here is therefore not proof the write happened — this re-reads
// the record right after and treats any field that doesn't match what was
// just sent as a failure, so a caller never shows "saved" for something
// that silently didn't. 'NA' and empty/null are treated as equivalent,
// matching OrnaVerse's own convention of storing an empty field as "NA".
function normalizeForCompare(value) {
  if (value == null || value === 'NA') return '';
  return String(value).trim();
}

// pan_document/other_document are never stored verbatim — OrnaVerse moves
// the uploaded temp file to a permanent "Documents/..." path on save, so an
// exact-match comparison against the temp path we sent always fails even
// when the save genuinely succeeded. These two only need to be non-empty.
const FILE_FIELDS = new Set(['pan_document', 'other_document']);

async function verifyPersisted(partyId, formChanges) {
  const response = await retrieveCustomer(partyId);
  const fresh = response?.data?.Entity ?? {};
  const mismatched = Object.keys(formChanges).filter((key) => {
    if (FILE_FIELDS.has(key)) return normalizeForCompare(fresh[key]) === '';
    // Confirmed live 2026-10-14: OrnaVerse returns some compliance fields
    // (pan_no, mobile, ...) fully masked in Customer/Retrieve for a non-
    // admin session, even right after that same session's own save
    // succeeded. An exact-match check against a field OrnaVerse won't echo
    // back can never pass, so a masked response is treated as "can't
    // verify, trust the save" rather than a mismatch.
    if (isMaskedValue(fresh[key])) return false;
    return normalizeForCompare(fresh[key]) !== normalizeForCompare(formChanges[key]);
  });
  if (mismatched.length > 0) {
    const err = new Error(
      `${mismatched.join(', ')} didn't actually save on OrnaVerse's side — this may require an admin account.`
    );
    err.serverMessage = err.message;
    throw err;
  }
}

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
    mutationFn: async ({ partyId, originalRaw, formChanges }) => {
      const mergedEntity = buildCustomerUpdatePayload(originalRaw, formChanges);
      const response = await updateCustomer(partyId, mergedEntity);
      await verifyPersisted(partyId, formChanges);
      return response;
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