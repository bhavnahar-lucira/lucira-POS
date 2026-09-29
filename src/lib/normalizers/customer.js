// src/lib/normalizers/customer.js
// Shared normalizers for OrnaVerse customer (party) records.
//
// CONFIRMED FIELD NAMES (v1.json schemas):
//
// POS.CustomerRow (top-level):
//   party_id, party_name, mobile, email, pan_no (NOT pan)
//   address, address_1, pin_code (int32)
//   city_id, state_id, country_id  (numeric IDs)
//   city_name, state_name, country_name  (display strings)
//   birth_date, anniversary  (datetime strings)
//   gender, marital_status
//   party_address[]  → PartyAddressRow[]
//
// Master.PartyAddressRow (inside party_address[]):
//   address_id, party_id, address_type
//   address, address_1
//   city_id, state_id, country_id  (numeric IDs)
//   city, state, country            (display strings — NOT city_name)
//   pin_code  (string — different type from CustomerRow)
//   is_default

/**
 * Normalises an address record into the flat shape used by:
 *   cart.customerAddress
 *   order.shipping_address / billing_address payloads
 *
 * Handles BOTH sources:
 *   PartyAddressRow  → city/state/country (string fields)
 *   CustomerRow root → city_name/state_name/country_name
 *
 * @param {object|null} addr
 * @returns {{
 *   address:  string,
 *   address1: string,
 *   city:     string,
 *   state:    string,
 *   country:  string,
 *   zip:      string,
 *   city_id:    number|null,
 *   state_id:   number|null,
 *   country_id: number|null,
 * }|null}
 */
export function normalizeAddress(addr) {
  if (!addr) return null;

  const str = (key) => {
    const v = addr[key];
    return v && v !== 'NA' ? String(v) : '';
  };

  return {
    address:  str('address') || str('address_1'),
    address1: addr.address && addr.address_1 ? str('address_1') : '',

    // City — PartyAddressRow uses city, CustomerRow root uses city_name
    city:    str('city')    || str('city_name'),
    state:   str('state')   || str('state_name'),
    country: str('country') || str('country_name'),

    // Postal code — string on PartyAddressRow, int32 on CustomerRow
    zip: str('pin_code'),

    // Numeric IDs — needed when building update payloads
    city_id:    addr.city_id    ?? null,
    state_id:   addr.state_id   ?? null,
    country_id: addr.country_id ?? null,
  };
}

/**
 * Picks the best address from a customer's party_address[]:
 *   1. The entry flagged is_default: true
 *   2. Otherwise the first entry in the array
 *   3. Otherwise null
 *
 * @param {Array|null|undefined} partyAddress
 * @returns {object|null}
 */
function pickAddress(partyAddress) {
  if (!Array.isArray(partyAddress) || partyAddress.length === 0) return null;
  return partyAddress.find((a) => a.is_default) ?? partyAddress[0];
}

/**
 * Normalises a POS.CustomerRow into the shape used throughout the app:
 *   - cart.attachCustomer()   needs: customerId, customerName, customerMobile, customerAddress
 *   - CustomerDetailSheet     needs: all display fields
 *   - useUpdateCustomer hook  reads from normalised.raw to build the update payload
 *
 * @param {object|null} entity — raw POS.CustomerRow from API
 * @returns {{
 *   customerId:      number,
 *   customerName:    string,
 *   customerMobile:  string,
 *   customerEmail:   string|null,
 *   customerPan:     string|null,
 *   customerPanDocument: string|null,
 *   customerOtherDocument: string|null,
 *   taxNo:           string|null,
 *   passportNumber:  string|null,
 *   aadhaarNumber:   number|null,
 *   dlNumber:        string|null,
 *   nationalityId:   number|null,
 *   birthDate:       string|null,
 *   anniversary:     string|null,
 *   gender:          number|null,
 *   maritalStatus:   number|null,
 *   customerAddress: object|null,
 *   raw:             object,
 * }|null}
 */
export function normalizeCustomer(entity) {
  if (!entity) return null;

  const pickedAddress = pickAddress(entity.party_address);
  const customerAddress = pickedAddress
    ? normalizeAddress(pickedAddress)
    : normalizeAddress({
        address:    entity.address,
        address_1:  entity.address_1,
        city_name:  entity.city_name,
        state_name: entity.state_name,
        country_name: entity.country_name,
        city_id:    entity.city_id,
        state_id:   entity.state_id,
        country_id: entity.country_id,
        pin_code:   entity.pin_code,
      });

  return {
    customerId:     entity.party_id,
    customerName:   entity.party_name,
    customerMobile: entity.mobile,
    // Re-added 2026-09-26 (was dropped 2026-09-17 per explicit direction at
    // the time) — confirmed live on UAT's own edit-customer form: Mobile and
    // Phone are two separate fields there, Phone optional. See
    // phoneToStoredValue/storedValueToPhone below for the E.164 <-> bare
    // OrnaVerse-storage conversion these forms need at their boundary.
    customerPhone:  entity.phone && entity.phone !== 'NA' ? entity.phone : null,

    // Nullable fields — treat "NA" and empty strings as null
    customerEmail:  entity.email  && entity.email  !== 'NA' ? entity.email  : null,
    customerPan:    entity.pan_no && entity.pan_no !== 'NA' ? entity.pan_no : null, // pan_no not pan
    // Confirmed field on POS.CustomerRow via v1.json (2026-08-14) — a
    // string, holds either a stored path (once saved) or the base64 payload
    // just sent on this same Update call. See CheckoutPanCapture: OrnaVerse
    // rejects Create above the PAN threshold with "Please upload PAN & its
    // number", not just the number, so this has to be resolved alongside
    // customerPan, not instead of it.
    customerPanDocument: entity.pan_document && entity.pan_document !== 'NA' ? entity.pan_document : null,
    customerOtherDocument: entity.other_document && entity.other_document !== 'NA' ? entity.other_document : null,

    // Added 2026-09-17 — for GST-registered business customers. Confirmed
    // via a 200-row live sample that every existing customer already has
    // tax_reg_type populated (server-defaulted to 4 regardless of creation
    // path), but tax_no was never collected by either form — the field this
    // app was actually missing for B2B customers. (business_name was also
    // added in that same pass, then removed 2026-09-17 once the user
    // checked OrnaVerse's own live create form and confirmed it doesn't
    // show that field at all — only tax_no/GSTIN, under "Identity
    // Documents" alongside PAN.)
    taxNo: entity.tax_no && entity.tax_no !== 'NA' ? entity.tax_no : null,

    // Added 2026-09-17 — the rest of OrnaVerse's "Identity Documents"
    // section this app never collected. `phone` (separate landline field)
    // was also added in this pass, then dropped per explicit direction —
    // keep mobile as the only phone-type field, as before. Credit
    // (allow_credit/credit_limit) and religion_id deliberately NOT added
    // yet — held back per explicit direction pending real enum labels for
    // religion_id (OrnaVerse's own docs render that enum's values
    // client-side, not scrapeable) and a considered decision on credit.
    passportNumber: entity.passport_number && entity.passport_number !== 'NA' ? entity.passport_number : null,
    aadhaarNumber:  entity.aadhaar_number || null,
    dlNumber:       entity.dl_number       && entity.dl_number       !== 'NA' ? entity.dl_number       : null,
    // Confirmed live: nationality_id is a country_id (a real customer had
    // country_id:101 and nationality_id:101, both "India") — resolved via
    // the same Master/Countries/List this app already loads for Country.
    nationalityId:  entity.nationality_id ?? null,

    birthDate:    entity.birth_date   ?? null,
    anniversary:  entity.anniversary  ?? null,
    gender:       entity.gender       ?? null,
    maritalStatus:entity.marital_status ?? null,

    customerAddress,

    // Full raw entity preserved — used by useUpdateCustomer to build payload
    raw: entity,
  };
}

/**
 * Builds the Entity payload for POS/Customer/Create.
 * Maps form values (from NewCustomerForm / customerSchema) to CustomerRow fields.
 *
 * @param {{
 *   party_name:   string,
 *   mobile:       string,
 *   email?:       string,
 *   pan_no?:      string,
 *   tax_no?:      string,
 *   passport_number?: string,
 *   aadhaar_number?:  string,
 *   dl_number?:   string,
 *   address?:     string,
 *   address_1?:   string,
 *   city_id?:     number,
 *   state_id?:    number,
 *   country_id?:  number,
 *   nationality_id?: number,
 *   pin_code?:    string,
 *   birth_date?:  string,
 *   anniversary?: string,
 *   gender?:      number,
 *   marital_status?: number,
 *   company_id:   number,
 * }} formValues
 * @returns {object} CustomerRow entity ready for { Entity: ... } payload
 */
// The Mobile/Phone form fields hold a full E.164 string (e.g.
// "+919812345670") — see PhoneNumberField's own header for why. OrnaVerse
// itself, and every other system that reads this tenant's mobile field
// (Nector, WebEngage, wishlist/abandoned-cart lookups), assumes a BARE
// 10-digit Indian mobile with no country prefix — 100% of this tenant's
// real data is shaped that way. So a +91 number is stripped back to bare
// digits at this boundary to match; any OTHER country is kept in full E.164
// form, since there's no bare-digit convention to match it to. That's a
// known, deliberate ceiling: a genuinely international customer's number
// won't be found by the Nector/WebEngage mobile-keyed lookups above — not
// an oversight, there's simply nothing to match against for those today.
function phoneToStoredValue(e164) {
  if (!e164) return undefined;
  return e164.startsWith('+91') ? e164.slice(3) : e164;
}

// The reverse direction — pre-fills PhoneNumberField from whatever
// OrnaVerse already has on file. A bare 10-digit Indian mobile becomes
// "+91XXXXXXXXXX"; anything already carrying a "+" (a genuinely
// international number stored by a previous edit) passes through as-is.
export function storedValueToPhone(raw) {
  if (!raw || raw === 'NA') return '';
  const value = String(raw);
  if (value.startsWith('+')) return value;
  return /^[6-9]\d{9}$/.test(value) ? `+91${value}` : value;
}

export function buildCustomerCreatePayload(formValues) {
  return {
    party_name:      formValues.party_name,
    mobile:          phoneToStoredValue(formValues.mobile),
    phone:           phoneToStoredValue(formValues.phone),
    email:           formValues.email          || undefined,
    pan_no:          formValues.pan_no         || undefined,
    tax_no:          formValues.tax_no         || undefined,
    passport_number: formValues.passport_number || undefined,
    // aadhaar_number is numeric on POS.CustomerRow — the form collects it
    // as a string (see customerSchema.js's aadhaarSchema comment).
    aadhaar_number:  formValues.aadhaar_number ? Number(formValues.aadhaar_number) : undefined,
    dl_number:       formValues.dl_number      || undefined,
    address:         formValues.address        || undefined,
    address_1:       formValues.address_1      || undefined,
    city_id:         formValues.city_id        ?? undefined,
    state_id:        formValues.state_id       ?? undefined,
    country_id:      formValues.country_id     ?? undefined,
    nationality_id:  formValues.nationality_id ?? undefined,
    pin_code:        formValues.pin_code       || undefined,
    birth_date:      formValues.birth_date     || undefined,
    anniversary:     formValues.anniversary    || undefined,
    gender:          formValues.gender         ?? undefined,
    marital_status:  formValues.marital_status ?? undefined,
    company_id:      formValues.company_id,
  };
}

/**
 * Builds the Entity payload for POS/Customer/Update.
 * Merges the original raw CustomerRow with form changes.
 * OrnaVerse requires the full record — partial updates are not supported.
 *
 * IMPORTANT: Always call retrieveCustomer() first to get the latest raw record,
 * then pass it here as `originalRaw`. Never use stale data from the list response.
 *
 * FIXED 2026-09-18 — confirmed live on UAT: sending gender/marital_status/
 * religion_id back as `0` 500s Update, even with every other field
 * unchanged (bisected field-by-field; each one alone reproduces it). `0` is
 * OrnaVerse's own Retrieve default for "never explicitly set" on these
 * three enums, not a real value any of them can hold — a customer created
 * without picking a gender, for instance, always retrieves as `0`. Since
 * this function unconditionally spreads the full raw record back in,
 * EVERY customer who has never had these three set would 500 on their
 * very next edit, regardless of what the operator actually changed.
 * religion_id in particular flows through purely from the raw record —
 * this app's own form doesn't even collect it (see customerSchema.js).
 * Dropping the key (rather than sending 0) lets Update succeed the same
 * way it already does when a field is simply absent.
 *
 * @param {object} originalRaw    — raw POS.CustomerRow from Customer/Retrieve
 * @param {object} formChanges    — only the fields the user changed
 * @returns {object} Merged CustomerRow entity ready for { EntityId, Entity: ... } payload
 */
export function buildCustomerUpdatePayload(originalRaw, formChanges) {
  const merged = {
    // Spread the full original record first (preserves all fields OrnaVerse requires)
    ...originalRaw,
    ...formChanges,
    // party_id must always be present (read-only in OrnaVerse but required in payload)
    party_id: originalRaw.party_id,
  };

  return {
    ...merged,
    // formChanges.mobile/phone are E.164 strings from PhoneNumberField (see
    // buildCustomerCreatePayload's own phoneToStoredValue comment for why
    // these convert back to OrnaVerse's bare-digit convention here) — the
    // plain spread above would otherwise send "+919812345670" straight
    // through unconverted. mobile is schema-mandatory (never legitimately
    // empty here); phone is optional, and CONFIRMED LIVE 2026-09-26 that
    // sending an OMITTED phone key (phoneToStoredValue's own undefined
    // result for '') does NOT clear a previously-set value — OrnaVerse just
    // silently keeps the old one. Explicit "NA" (this schema's own established
    // empty-string convention, per every other field's `!== 'NA'` check
    // above) is what actually clears it — confirmed on the same live test.
    mobile: 'mobile' in formChanges ? phoneToStoredValue(formChanges.mobile) : originalRaw.mobile,
    phone:  'phone'  in formChanges ? (phoneToStoredValue(formChanges.phone) ?? 'NA') : originalRaw.phone,
    gender:         merged.gender         === 0 ? undefined : merged.gender,
    marital_status: merged.marital_status === 0 ? undefined : merged.marital_status,
    religion_id:    merged.religion_id    === 0 ? undefined : merged.religion_id,
  };
}

/**
 * Normalises the `Customer` object from Services/POS/WalkIn/Lookup.
 *
 * IMPORTANT: this is a DIFFERENT identity space from POS.CustomerRow —
 * `customer_id` here is a CRM-level walk-in profile id, NOT a party_id.
 * Confirmed live 2026-07-19: a mobile with a WalkIn/Lookup match can still
 * return zero results from Customer/GetCustomer (customer_id 787 has no
 * matching party — they visited but were never onboarded as a billing
 * customer). Never pass walkInCustomerId anywhere a party_id is expected
 * (cart.attachCustomer, Order/Invoice Create, etc.) — use it only for
 * display ("welcome back") and to pre-fill the signup form.
 *
 * @param {object|null} entity — raw WalkIn/Lookup `Customer` object
 * @returns {{
 *   walkInCustomerId: number,
 *   name:             string,
 *   mobileMasked:     string|null,
 *   visitCount:       number,
 * }|null}
 */
export function normalizeWalkInCustomer(entity) {
  if (!entity) return null;

  const name = [entity.first_name, entity.last_name]
    .filter(Boolean)
    .join(' ')
    .trim();

  return {
    walkInCustomerId: entity.customer_id,
    name:             name || null,
    mobileMasked:     entity.mobile ?? null,
    visitCount:       Array.isArray(entity.customer_visits) ? entity.customer_visits.length : 0,
  };
}

/**
 * A single real visit record — from Services/CRM/CustomerVisits/List
 * (CONFIRMED LIVE 2026-09-28), replacing the old Mongo-backed walkins_POS
 * log entirely. Flat rows (no nested arrays), already store-scoped by the
 * caller's EqualityFilter — see crmService.js's getCustomerVisits.
 */
export function normalizeCrmVisit(entity) {
  if (!entity) return null;
  return {
    visitId:      entity.id,
    leadId:       entity.customer_id,
    customerName: entity.customer_name?.trim() || null,
    mobile:       entity.mobile ?? null,
    email:        entity.email && entity.email !== 'NA' ? entity.email : null,
    visitedAt:    entity.date ?? null,
    companyName:  entity.company_name ?? null,
    companyCode:  entity.company_code ?? null,
    source:       entity.source ?? null,
    notes:        entity.notes ?? null,
  };
}

/**
 * Full CRM lead detail — from Services/CRM/Customer/List, the same table
 * WalkIn/Register writes into (see crmService.js's own header). Same
 * customer_id identity space as normalizeWalkInCustomer above — never a
 * party_id.
 */
export function normalizeCrmLead(entity) {
  if (!entity) return null;

  const name = [entity.first_name, entity.last_name].filter(Boolean).join(' ').trim();

  return {
    leadId:      entity.customer_id,
    // CONFIRMED LIVE 2026-09-28: this table is the tenant's FULL CRM
    // history (3,926 rows, unfiltered), not just open walk-in leads — most
    // rows already carry a party_id, meaning they're a real, already-created
    // billing customer, not someone still waiting to be converted. Carried
    // through so useCrmLeads.js can filter to genuinely open leads only.
    partyId:     entity.party_id ?? null,
    name:        name || null,
    mobile:      entity.mobile ?? null,
    phone:       entity.phone && entity.phone !== 'NA' ? entity.phone : null,
    email:       entity.email && entity.email !== 'NA' ? entity.email : null,
    budget:      entity.budget || null,
    sourceId:    entity.source_id || null,
    // type_id array — same master as the catalog's own category filter.
    interestTypeIds: Array.isArray(entity.interest)
      ? entity.interest.map((i) => (typeof i === 'object' ? i.type_id : i)).filter((id) => id != null)
      : [],
    notes:       entity.notes ?? null,
    isDisabled:  !!entity.is_disabled,
    createdAt:   entity.creation_date ?? null,
    visitCount:  Array.isArray(entity.customer_visits) ? entity.customer_visits.length : 0,
    raw:         entity,
  };
}