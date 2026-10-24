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
// mobile/phone: the form holds E.164 with a country code ("+919812345670"),
// OrnaVerse stores and echoes back bare local digits ("9812345670") — a
// different digit COUNT, not just different punctuation, so comparing the
// last 10 digits (the actual subscriber number) is what makes these equal
// regardless of country-code prefix.
// birth_date/anniversary: the form holds a plain date ("1990-05-15"),
// OrnaVerse echoes back a full datetime with no UTC/offset marker
// ("1990-05-15T00:00:00.000"). Parsing that with `new Date` is timezone-
// sensitive — a bare (no-"Z") datetime parses as LOCAL time while a
// date-only string parses as UTC midnight, so converting both through
// `Date`/`toISOString` can shift one of them onto the adjacent calendar day
// depending on the server's timezone. Comparing the first 10 characters of
// each raw string sidesteps that entirely — no timezone math needed since
// both already spell the date the same way the moment they agree on the day.
// Both confirmed live 2026-10-24: a genuinely successful save was flagged
// as "didn't actually save" purely from these format mismatches, not a
// real persistence failure.
const PHONE_FIELDS = new Set(['mobile', 'phone']);
const DATE_FIELDS  = new Set(['birth_date', 'anniversary']);

function normalizeForCompare(value, key) {
  if (value == null || value === 'NA') return '';
  const str = String(value).trim();
  if (PHONE_FIELDS.has(key)) return str.replace(/\D/g, '').slice(-10);
  if (DATE_FIELDS.has(key)) return str.slice(0, 10);
  return str;
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
    if (FILE_FIELDS.has(key)) return normalizeForCompare(fresh[key], key) === '';
    // Confirmed live 2026-10-14: OrnaVerse returns some compliance fields
    // (pan_no, mobile, ...) fully masked in Customer/Retrieve for a non-
    // admin session, even right after that same session's own save
    // succeeded. An exact-match check against a field OrnaVerse won't echo
    // back can never pass, so a masked response is treated as "can't
    // verify, trust the save" rather than a mismatch.
    if (isMaskedValue(fresh[key])) return false;
    return normalizeForCompare(fresh[key], key) !== normalizeForCompare(formChanges[key], key);
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