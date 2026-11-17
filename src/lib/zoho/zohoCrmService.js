// src/lib/zoho/zohoCrmService.js
// SERVER-ONLY service for Zoho CRM Integration.
// Strictly protected: handles OAuth token refresh and deals/leads fetching server-side.

function clean(val, fallback = '') {
  if (!val) return fallback;
  return String(val).trim().replace(/^["']|["']$/g, '').trim();
}

// Global cache to persist across Fast Refresh and dev server recompilations
globalThis.__zohoCache = globalThis.__zohoCache || {
  token: null,
  expiresAt: 0,
  rateLimitedUntil: 0,
  inFlightPromise: null,
  resolvedAccountsUrl: null,
  resolvedApiUrl: null,
};

function getCredentials() {
  return {
    accountsUrl: clean(process.env.ZOHO_CRM_ACCOUNTS_URL, 'https://accounts.zoho.in'),
    apiUrl: clean(process.env.ZOHO_CRM_API_URL, 'https://www.zohoapis.in'),
    clientId: clean(process.env.ZOHO_CRM_CLIENT_ID),
    clientSecret: clean(process.env.ZOHO_CRM_CLIENT_SECRET),
    refreshToken: clean(process.env.ZOHO_CRM_REFRESH_TOKEN),
  };
}

/**
 * Attempts token refresh against a specific Zoho Accounts domain.
 * Zoho OAuth 2.0 expects parameters in the URL query string on POST /oauth/v2/token.
 */
async function requestTokenFromDomain(domain, clientId, clientSecret, refreshToken) {
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });

  const url = `${domain}/oauth/v2/token?${params.toString()}`;

  const res = await fetchWithRetry(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });

  const rawText = await res.text();
  let json = {};
  try {
    json = JSON.parse(rawText);
  } catch {
    // not valid JSON
  }

  return { res, rawText, json };
}

/**
 * Retrieves a valid Zoho CRM access token, refreshing if expired.
 * Deduplicates concurrent calls via inFlightPromise and caches for 55 minutes.
 * Automatically tries .in and .com accounts domains if needed.
 * @returns {Promise<string>}
 */
export async function getZohoAccessToken() {
  const cache = globalThis.__zohoCache;
  const now = Date.now();

  // 1. Return cached token if still valid
  if (cache.token && now < cache.expiresAt) {
    return cache.token;
  }

  // 2. If a request is already in-flight, await the same promise
  if (cache.inFlightPromise) {
    return cache.inFlightPromise;
  }

  // 3. Cooldown check
  if (now < cache.rateLimitedUntil) {
    const remainingSec = Math.ceil((cache.rateLimitedUntil - now) / 1000);
    throw new Error(
      `Zoho CRM is cooling down from continuous requests. Please wait ${remainingSec}s before retrying.`
    );
  }

  const request = (async () => {
      const { accountsUrl, apiUrl, clientId, clientSecret, refreshToken } = getCredentials();

      if (!clientId || !clientSecret || !refreshToken) {
        throw new Error('Zoho CRM credentials (Client ID, Client Secret, Refresh Token) are missing in environment.');
      }

      // Try configured domain first (e.g. accounts.zoho.in)
      const primaryDomain = accountsUrl.replace(/\/+$/, '');
      const fallbackDomain = primaryDomain.includes('.in')
        ? 'https://accounts.zoho.com'
        : 'https://accounts.zoho.in';

      let result = await requestTokenFromDomain(primaryDomain, clientId, clientSecret, refreshToken);

      // Check for rate limit
      if (result.rawText.includes('too many requests') || result.rawText.includes('Access Denied')) {
        cache.rateLimitedUntil = Date.now() + 60 * 1000;
        throw new Error(
          'Zoho rate limit: Too many token requests made continuously. Zoho requires a 1–2 minute cooldown. Please wait a moment and try again.'
        );
      }

      // If invalid_client, try the alternate domain (.com vs .in) in case the app was registered in a different DC
      if (result.json?.error === 'invalid_client' || result.rawText.includes('invalid_client')) {
        console.warn(`[Zoho CRM] Domain (${primaryDomain}) returned invalid_client. Checking alternate domain (${fallbackDomain})...`);
        const altResult = await requestTokenFromDomain(fallbackDomain, clientId, clientSecret, refreshToken);
        if (altResult.json?.access_token) {
          result = altResult;
          cache.resolvedAccountsUrl = fallbackDomain;
          cache.resolvedApiUrl = fallbackDomain.includes('.in') ? 'https://www.zohoapis.in' : 'https://www.zohoapis.com';
        }
      }

      if (!result.res.ok && !result.json?.access_token) {
        throw new Error(`Failed to refresh Zoho token (${result.res.status}): ${result.rawText}`);
      }

      if (!result.json?.access_token) {
        const errDetail = result.json?.error_description || result.json?.error || result.rawText;
        throw new Error(`Zoho token error: ${errDetail}`);
      }

      cache.token = result.json.access_token;
      const expiresInSec = result.json.expires_in || result.json.expires_in_sec || 3600;
      // Cache for up to 55 minutes
      cache.expiresAt = Date.now() + (expiresInSec - 300) * 1000;
      if (!cache.resolvedAccountsUrl) {
        cache.resolvedAccountsUrl = primaryDomain;
        cache.resolvedApiUrl = result.json.api_domain || apiUrl;
      }

      return cache.token;
  })();
  cache.inFlightPromise = request.finally(() => { cache.inFlightPromise = null; });
  return cache.inFlightPromise;
}

/** Drops the cached token so the next call refreshes it (e.g. after Zoho rejects it with 401). */
function invalidateZohoToken() {
  const cache = globalThis.__zohoCache;
  cache.token = null;
  cache.expiresAt = 0;
}

// The connection to Zoho drops now and then ("fetch failed" — nothing reached Zoho), so a request is tried
// up to 3 times before giving up with a readable message.
async function fetchWithRetry(url, options, attempts = 3) {
  for (let i = 1; ; i += 1) {
    try {
      return await fetch(url, { ...options, signal: AbortSignal.timeout(20000) });
    } catch (err) {
      if (i >= attempts) {
        throw new Error('Could not reach Zoho CRM — the connection dropped. Please press Refresh in a moment.', { cause: err });
      }
      await new Promise((r) => setTimeout(r, 800 * i));
    }
  }
}

async function zohoGet(url) {
  let res = await fetchWithRetry(url, { headers: { Authorization: `Zoho-oauthtoken ${await getZohoAccessToken()}` } });
  if (res.status === 401) {
    invalidateZohoToken();
    res = await fetchWithRetry(url, { headers: { Authorization: `Zoho-oauthtoken ${await getZohoAccessToken()}` } });
  }
  return res;
}

export const UNASSIGNED_STORE = 'Unassigned';

/** A Zoho field as plain text — lookup fields arrive as { name, id }. */
function fieldText(v) {
  if (v == null) return '';
  if (typeof v === 'object') return String(v.name ?? '').trim();
  return String(v).trim();
}

/**
 * Zoho search criteria treat ( ) , and \ as syntax, so they're escaped in user text.
 * Name fields only support starts_with (matches the start of any word), not contains.
 */
function criteriaValue(text) {
  return text.replace(/([\\(),])/g, '\\$1');
}

/**
 * Normalizes a raw Zoho CRM Deal or Lead object into a clean, flat structure.
 * Supports both Deals and Leads modules seamlessly.
 * @param {object} d
 * @returns {object}
 */
export function formatDealRow(d) {
  if (!d) return null;

  const contactName =
    d.Contact_Name?.name ||
    d.Full_Name ||
    `${d.First_Name || ''} ${d.Last_Name || ''}`.trim() ||
    '';

  const dealName =
    d.Deal_Name ||
    d.Full_Name ||
    (contactName ? `${contactName}'s Opportunity` : 'Untitled Deal');

  // Only the deal's own store fields — the record owner is a person, not a store.
  const storeAssigned = fieldText(d.Store_Assigned) || fieldText(d.Store_Name);

  return {
    id:                     String(d.id || ''),
    dealName,
    dealOwner:              d.Owner?.name || '',
    dealOwnerEmail:         d.Owner?.email || '',
    contactName,
    contactId:              d.Contact_Name?.id || String(d.id || ''),
    stage:                  d.Stage || d.Lead_Status || 'New Lead',
    mobile:                 d.Mobile || d.Phone || '',
    alternateMobile:        d.Alternate_mobile || '',
    email:                  d.Email || '',
    customerActivityDate:   d.Customer_activity_date || null,
    dealTriggerEvent:       d.Deal_Trigger_Event || '',
    probability:            d.Probability != null ? Number(d.Probability) : null,
    lastActivityTime:       d.Last_Activity_Time || null,
    modifiedTime:           d.Modified_Time || null,
    dealScore:              d.Deal_Score != null ? Number(d.Deal_Score) : (d.Engagement_Score != null ? Number(d.Engagement_Score) : null),
    utmSource:              d.UTM_Source || '',
    utmMedium:              d.UTM_Medium || '',
    utmCampaign:            d.UTM_Campaign || '',
    storeAssigned,
    amount:                 d.Amount != null ? Number(d.Amount) : 0,
    closingDate:            d.Closing_Date || null,
    type:                   d.Type || d.Record_Type || '',
    expectedRevenue:        d.Expected_Revenue != null ? Number(d.Expected_Revenue) : 0,
    nextStep:               d.Next_Step || '',
    leadSource:             d.Lead_Source || '',
    campaignSource:         d.Campaign_Source || '',
    createdBy:              d.Created_By?.name || '',
    createdTime:            d.Created_Time || null,
    modifiedBy:             d.Modified_By?.name || '',
    leadConversionTime:     d.Lead_Conversion_Time || null,
    salesCycleDuration:     d.Sales_Cycle_Duration || null,
    overallSalesDuration:   d.Overall_Sales_Duration || null,
    tag:                    Array.isArray(d.Tag) ? d.Tag.map((t) => t?.name ?? t).filter(Boolean).join(', ') : (d.Tag || ''),
    description:            d.Description || '',
    reasonForLoss:          d.Reason_For_Loss__s || '',
    connectedTo:            d.Account_Name?.name || (typeof d.Account_Name === 'string' ? d.Account_Name : '') || d.Company || '',
    recordType:             d.Record_Type || '',
    firstActivityDate:      d.First_Activity_Date || null,
    lastActivityDate:       d.Last_Activity_date || null,
    intentStage:            d.Intent_Stage || '',
    assignedAt:             d.Assigned_At || null,
    assignmentStatus:       typeof d.Assignment_Status === 'boolean' ? (d.Assignment_Status ? 'Assigned' : 'Unassigned') : (d.Assignment_Status || ''),
    socialLeadId:           d.leadchain0__Social_Lead_ID || '',
    addressCoordinates:     d.Address_Coordinates || d.Coordinates || '',
    addressCountry:         d.Address_Country_Region || d.Country || '',
    addressFlat:            d.Address_Flat_House_No_Building_Apartment_Name || d.Flat_House_No_Building_Apartment_Name || '',
    addressStreet:          d.Address_Street_Address || d.Street || '',
    addressCity:            d.Address_City || d.City || '',
    addressState:           d.Address_State_Province || d.State || '',
    addressZip:             d.Address_Zip_Postal_Code || d.Zip_Code || '',
    fullAddress:            d.full_Address || d.Full_Address || d.Address || '',
    // Jewelry specific clienteling & scheme fields
    purchaseReason:         d.Purchase_Reason || '',
    storeExecutive:         fieldText(d.Store_Executive),
    appointmentDateTime:    d.Appointment_Date_Time || null,
    birthday:               d.Birthday || null,
    anniversary:            d.Anniversary || null,
    schemeId:               d.Scheme_ID || null,
    schemeMonthlyAmount:    d.Scheme_Monthly_Amount != null ? Number(d.Scheme_Monthly_Amount) : null,
    enrollmentCode:         d.Enrollment_code || '',
    schemeDueDate:          d.Scheme_Due_date || null,
    allocationType:         d.Allocation_Type || '',
    numberOfActivity:       d.Number_of_activity != null ? Number(d.Number_of_activity) : null,
  };
}

const LEAD_FIELDS = [
  'id', 'Full_Name', 'First_Name', 'Last_Name', 'Email', 'Mobile', 'Phone',
  'Owner', 'Lead_Status', 'Lead_Source', 'UTM_Source', 'UTM_Medium', 'UTM_Campaign',
  'Deal_Trigger_Event', 'Record_Type', 'Created_Time', 'Modified_Time',
  'City', 'State', 'Country', 'Store_Name', 'Engagement_Score', 'Intent_Stage',
  'Assignment_Status', 'Full_Address', 'Street', 'Coordinates',
  'Purchase_Reason', 'Store_Executive', 'Appointment_Date_Time', 'Birthday', 'Anniversary',
  'Scheme_Monthly_Amount', 'Scheme_ID', 'Enrollment_code', 'Scheme_Due_date',
  'Allocation_Type', 'Number_of_activity',
].join(',');

/**
 * Fetches records from Zoho CRM (tries Deals first, falls back to Leads if scope requires).
 * Supports date-wise criteria filtering (fromDate, toDate).
 * @param {{
 *   page?: number,
 *   perPage?: number,
 *   store?: string,
 *   stage?: string,
 *   search?: string,
 *   fromDate?: string,
 *   toDate?: string,
 * }} params
 */
export async function getZohoDeals({
  page = 1,
  perPage = 50,
  store = 'all',
  stage = 'all',
  search = '',
  fromDate = '',
  toDate = '',
} = {}) {
  await getZohoAccessToken();
  const cache = globalThis.__zohoCache || {};
  const baseUrl = cache.resolvedApiUrl || clean(process.env.ZOHO_CRM_API_URL, 'https://www.zohoapis.in');


  // Zoho rejects a word search shorter than 2 characters.
  search = search?.trim().length >= 2 ? search.trim() : '';

  // Construct date criteria if date filter is active
  let dateCriteria = '';
  if (fromDate && toDate) {
    dateCriteria = `((Created_Time:greater_equal:${fromDate}T00:00:00+05:30)and(Created_Time:less_equal:${toDate}T23:59:59+05:30))`;
  } else if (fromDate) {
    dateCriteria = `(Created_Time:greater_equal:${fromDate}T00:00:00+05:30)`;
  } else if (toDate) {
    dateCriteria = `(Created_Time:less_equal:${toDate}T23:59:59+05:30)`;
  }

  // 1. Attempt Deals module first
  let primaryUrl;
  if (dateCriteria) {
    const criteria = search?.trim()
      ? `(${dateCriteria}and(Deal_Name:starts_with:${criteriaValue(search)}))`
      : dateCriteria;
    primaryUrl = `${baseUrl}/crm/v8/Deals/search?criteria=${encodeURIComponent(criteria)}&per_page=${perPage}&page=${page}`;
  } else if (search?.trim()) {
    const term = encodeURIComponent(search.trim());
    primaryUrl = `${baseUrl}/crm/v8/Deals/search?word=${term}&per_page=${perPage}&page=${page}`;
  } else {
    primaryUrl = `${baseUrl}/crm/v8/Deals?per_page=${perPage}&page=${page}`;
  }

  let res = await zohoGet(primaryUrl);

  // 2. If Deals returns OAUTH_SCOPE_MISMATCH (e.g. token only has leads scope), fetch from Leads module!
  if (!res.ok) {
    const errText = await res.text();
    if (errText.includes('OAUTH_SCOPE_MISMATCH') || errText.includes('invalid oauth scope')) {
      let leadsUrl;
      if (dateCriteria) {
        const criteria = search?.trim()
          ? `(${dateCriteria}and(Full_Name:starts_with:${criteriaValue(search)}))`
          : dateCriteria;
        leadsUrl = `${baseUrl}/crm/v8/Leads/search?criteria=${encodeURIComponent(criteria)}&fields=${LEAD_FIELDS}&per_page=${perPage}&page=${page}`;
      } else if (search?.trim()) {
        const term = encodeURIComponent(search.trim());
        leadsUrl = `${baseUrl}/crm/v8/Leads/search?word=${term}&fields=${LEAD_FIELDS}&per_page=${perPage}&page=${page}`;
      } else {
        leadsUrl = `${baseUrl}/crm/v8/Leads?fields=${LEAD_FIELDS}&per_page=${perPage}&page=${page}`;
      }
      res = await zohoGet(leadsUrl);
    } else if (res.status !== 204) {
      throw new Error(`Zoho API Deals fetch failed (${res.status}): ${errText}`);
    }
  }

  if (res.status === 204) {
    return {
      deals: [],
      info: { page, per_page: perPage, count: 0, more_records: false },
      summary: { total: 0, totalValue: 0, wonCount: 0, lostCount: 0, stores: [], stages: [], utmSources: [] },
    };
  }

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Zoho API fetch failed (${res.status}): ${errorText}`);
  }

  const json = await res.json();
  const rawList = Array.isArray(json.data) ? json.data : [];
  const pageRows = rawList.map(formatDealRow);
  let formattedList = pageRows;

  // Store and stage filter the page Zoho returned; the dropdown options always come from the whole page.
  if (store && store !== 'all') {
    // Zoho's record owner is the store / team that works the lead.
    formattedList = formattedList.filter((d) =>
      (d.dealOwner || UNASSIGNED_STORE).toLowerCase() === store.toLowerCase()
    );
  }
  if (stage && stage !== 'all') {
    formattedList = formattedList.filter((d) =>
      d.stage?.toLowerCase() === stage.toLowerCase()
    );
  }

  // Calculate high-level summary KPIs for Super Admin
  const totalValue = formattedList.reduce((acc, d) => acc + (d.amount || 0), 0);
  const wonCount   = formattedList.filter((d) =>
    d.stage?.toLowerCase().includes('won') ||
    d.stage?.toLowerCase().includes('closed won') ||
    d.stage?.toLowerCase().includes('converted')
  ).length;
  const lostCount  = formattedList.filter((d) =>
    d.stage?.toLowerCase().includes('lost') ||
    d.stage?.toLowerCase().includes('closed lost') ||
    d.stage?.toLowerCase().includes('junk') ||
    d.stage?.toLowerCase().includes('not interested')
  ).length;

  const storeMap = {};
  const stageMap = {};
  const utmMap   = {};

  for (const d of pageRows) {
    const storeKey = d.dealOwner || UNASSIGNED_STORE;
    storeMap[storeKey] = (storeMap[storeKey] || 0) + 1;
    if (d.stage) {
      stageMap[d.stage] = (stageMap[d.stage] || 0) + 1;
    }
  }
  for (const d of formattedList) {
    if (d.utmSource) {
      utmMap[d.utmSource] = (utmMap[d.utmSource] || 0) + 1;
    }
  }

  return {
    deals: formattedList,
    info: json.info || { page, per_page: perPage, count: formattedList.length, more_records: false },
    summary: {
      total: formattedList.length,
      totalValue,
      wonCount,
      lostCount,
      stores: Object.entries(storeMap).map(([name, count]) => ({ name, count })),
      stages: Object.entries(stageMap).map(([name, count]) => ({ name, count })),
      utmSources: Object.entries(utmMap).map(([name, count]) => ({ name, count })),
    },
  };
}

/**
 * Fetches a single deal or lead by Zoho ID.
 * @param {string} recordId
 * @returns {Promise<object|null>}
 */
export async function getSingleZohoDeal(recordId) {
  if (!recordId) return null;
  await getZohoAccessToken();
  const cache = globalThis.__zohoCache || {};
  const baseUrl = cache.resolvedApiUrl || clean(process.env.ZOHO_CRM_API_URL, 'https://www.zohoapis.in');

  // Try Deals first
  let res = await zohoGet(`${baseUrl}/crm/v8/Deals/${recordId}`);

  if (!res.ok) {
    // If scope mismatch or 404, try Leads
    res = await zohoGet(`${baseUrl}/crm/v8/Leads/${recordId}`);
  }

  if (res.status === 404 || res.status === 204) return null;

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Zoho record fetch failed (${res.status}): ${errorText}`);
  }

  const json = await res.json();
  const item = json?.data?.[0];
  return item ? formatDealRow(item) : null;
}

function zohoApiBase() {
  const cache = globalThis.__zohoCache || {};
  return cache.resolvedApiUrl || clean(process.env.ZOHO_CRM_API_URL, 'https://www.zohoapis.in');
}

async function zohoJson(url) {
  const res = await zohoGet(url);
  if (res.status === 204) return { data: [], info: { more_records: false } };
  if (!res.ok) throw new Error(`Zoho request failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

const EVENT_FIELDS = 'Event_Title,Start_DateTime,End_DateTime,Owner,Who_Id,What_Id,Venue,Description,Created_Time';

/**
 * Zoho "Meetings" (the Events module), read-only. Dates filter on the meeting's start (IST);
 * owner (the store / team that owns it in Zoho) filters the page Zoho returned.
 * @param {{ page?: number, perPage?: number, fromDate?: string, toDate?: string, owner?: string, search?: string }} params
 */
export async function getZohoMeetings({ page = 1, perPage = 100, fromDate = '', toDate = '', owner = 'all', search = '' } = {}) {
  await getZohoAccessToken();
  const base = zohoApiBase();
  const term = search?.trim().length >= 2 ? search.trim() : '';
  const range = fromDate || toDate
    ? `(Start_DateTime:between:${fromDate || '2000-01-01'}T00:00:00+05:30,${toDate || '2100-12-31'}T23:59:59+05:30)`
    : '';
  const criteria = [range, term ? `(Event_Title:starts_with:${criteriaValue(term)})` : ''].filter(Boolean);
  const url = criteria.length
    ? `${base}/crm/v8/Events/search?criteria=${encodeURIComponent(criteria.length > 1 ? `(${criteria.join('and')})` : criteria[0])}&fields=${EVENT_FIELDS}&per_page=${perPage}&page=${page}`
    : `${base}/crm/v8/Events?fields=${EVENT_FIELDS}&per_page=${perPage}&page=${page}&sort_by=Created_Time&sort_order=desc`;
  const json = await zohoJson(url);
  const all = (json.data ?? []).map((e) => ({
    id: String(e.id),
    title: fieldText(e.Event_Title) || 'Meeting',
    start: e.Start_DateTime ?? null,
    end: e.End_DateTime ?? null,
    owner: fieldText(e.Owner) || 'Unassigned',
    customer: fieldText(e.Who_Id) || null,
    relatedTo: fieldText(e.What_Id) || null,
    venue: fieldText(e.Venue) || null,
    description: fieldText(e.Description) || null,
    createdTime: e.Created_Time ?? null,
  }));
  const owners = [...new Set(all.map((m) => m.owner))].sort();
  const meetings = (owner && owner !== 'all' ? all.filter((m) => m.owner === owner) : all)
    .sort((a, b) => new Date(a.start ?? 0) - new Date(b.start ?? 0));
  return { meetings, owners, info: json.info ?? { page, per_page: perPage, more_records: false } };
}

/**
 * Leads carrying a Birthday or Anniversary in Zoho, read-only, soonest upcoming first.
 * @param {{ type?: 'all'|'birthday'|'anniversary', month?: string|number, owner?: string }} params
 *   month — 1–12 to keep only that month, or 'all'.
 */
export async function getZohoBirthdays({ type = 'all', month = 'all', owner = 'all' } = {}) {
  await getZohoAccessToken();
  const base = zohoApiBase();
  const fields = 'Full_Name,First_Name,Last_Name,Mobile,Phone,Email,Birthday,Anniversary,Owner,City,Lead_Status';
  const kinds = type === 'all' ? ['Birthday', 'Anniversary'] : [type === 'birthday' ? 'Birthday' : 'Anniversary'];
  const rows = [];
  for (const field of kinds) {
    for (let page = 1; page <= 10; page += 1) {
      const json = await zohoJson(`${base}/crm/v8/Leads/search?criteria=${encodeURIComponent(`(${field}:not_equal:null)`)}&fields=${fields}&per_page=200&page=${page}`);
      for (const l of json.data ?? []) {
        if (!l[field]) continue;
        rows.push({
          id: `${l.id}-${field}`,
          leadId: String(l.id),
          kind: field === 'Birthday' ? 'Birthday' : 'Anniversary',
          date: l[field],
          name: fieldText(l.Full_Name) || `${fieldText(l.First_Name)} ${fieldText(l.Last_Name)}`.trim() || 'Unknown',
          mobile: fieldText(l.Mobile) || fieldText(l.Phone) || null,
          email: fieldText(l.Email) || null,
          owner: fieldText(l.Owner) || 'Unassigned',
          city: fieldText(l.City) || null,
          status: fieldText(l.Lead_Status) || null,
        });
      }
      if (!json.info?.more_records) break;
    }
  }
  // "Today" in India time — the server may run in UTC.
  const [ty, tm, td] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date()).split('-').map(Number);
  const today = new Date(ty, tm - 1, td);
  const nextOccurrence = (iso) => {
    const [, m, d] = String(iso).split('-').map(Number);
    let next = new Date(today.getFullYear(), m - 1, d);
    if (next < today) next = new Date(today.getFullYear() + 1, m - 1, d);
    return next;
  };
  const owners = [...new Set(rows.map((r) => r.owner))].sort();
  const list = rows
    .filter((r) => month === 'all' || Number(String(r.date).split('-')[1]) === Number(month))
    .filter((r) => owner === 'all' || r.owner === owner)
    .map((r) => {
      const n = nextOccurrence(r.date);
      const pad = (x) => String(x).padStart(2, '0');
      return { ...r, next: `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}` };
    })
    .sort((a, b) => a.next.localeCompare(b.next));
  return { rows: list, owners };
}
