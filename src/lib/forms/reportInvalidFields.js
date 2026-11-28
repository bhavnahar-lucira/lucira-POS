import { toast } from 'sonner';

const CUSTOMER_FIELD_LABELS = {
  party_name: 'Full name', mobile: 'Mobile', phone: 'Phone', email: 'Email', pan_no: 'PAN', tax_no: 'GSTIN',
  passport_number: 'Passport No', aadhaar_number: 'Aadhaar No', dl_number: 'Driving License', address: 'Address',
  address_1: 'Address line 2', country_id: 'Country', state_id: 'State', city_id: 'City', nationality_id: 'Nationality',
  pin_code: 'PIN Code', birth_date: 'Birth Date', anniversary: 'Anniversary', gender: 'Gender',
  marital_status: 'Marital status', religion_id: 'Religion', allow_credit: 'Allow credit', credit_limit: 'Credit limit',
};

/** react-hook-form onInvalid: say which fields block the save and why, and bring the first one into view. */
export function reportInvalidFields(fieldErrors, labels = CUSTOMER_FIELD_LABELS) {
  const keys = Object.keys(fieldErrors ?? {});
  if (!keys.length) return;
  const lines = keys.map((key) => `${labels[key] ?? key}: ${fieldErrors[key]?.message || 'needs a valid value'}`);
  toast.error(`Can't save yet — fix ${keys.length === 1 ? 'this field' : 'these fields'}`, {
    description: lines.join(' · '),
    duration: 8000,
  });
  const el = document.querySelector(`[name="${keys[0]}"]`);
  el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el?.focus?.();
}
