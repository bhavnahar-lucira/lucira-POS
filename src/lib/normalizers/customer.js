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
    customerPhone:  entity.phone && entity.phone !== 'NA' ? entity.phone : null,

    // Nullable fields — treat "NA" and empty strings as null
    customerEmail:  entity.email  && entity.email  !== 'NA' ? entity.email  : null,
    customerPan:    entity.pan_no && entity.pan_no !== 'NA' ? entity.pan_no : null, // pan_no not pan
    customerPanDocument: entity.pan_document && entity.pan_document !== 'NA' ? entity.pan_document : null,
    customerOtherDocument: entity.other_document && entity.other_document !== 'NA' ? entity.other_document : null,
    taxNo: entity.tax_no && entity.tax_no !== 'NA' ? entity.tax_no : null,
    passportNumber: entity.passport_number && entity.passport_number !== 'NA' ? entity.passport_number : null,
    aadhaarNumber:  entity.aadhaar_number || null,
    dlNumber:       entity.dl_number       && entity.dl_number       !== 'NA' ? entity.dl_number       : null,
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
function phoneToStoredValue(e164) {
  if (!e164) return undefined;
  return e164.startsWith('+91') ? e164.slice(3) : e164;
}

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
    mobile: 'mobile' in formChanges ? phoneToStoredValue(formChanges.mobile) : originalRaw.mobile,
    phone:  'phone'  in formChanges ? (phoneToStoredValue(formChanges.phone) ?? 'NA') : originalRaw.phone,
    gender:         merged.gender         === 0 ? undefined : merged.gender,
    marital_status: merged.marital_status === 0 ? undefined : merged.marital_status,
    religion_id:    merged.religion_id    === 0 ? undefined : merged.religion_id,
  };
}

/**
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

export function normalizeCrmLead(entity) {
  if (!entity) return null;

  const name = [entity.first_name, entity.last_name].filter(Boolean).join(' ').trim();

  return {
    leadId:      entity.customer_id,
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