// src/lib/frejun/frejunClient.js
// SERVER-ONLY. Client for Frejun Cloud Telephony API (v2).

const DEFAULT_BASE_URL = 'https://api.frejun.com/api/v2';
function getApiKey() {
  const key = process.env.FREJUN_API_KEY;
  if (!key) throw new Error('FREJUN_API_KEY is not configured.');
  return key;
}

function getBaseUrl() {
  return (process.env.FREJUN_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

/**
 * Converts ISO/date strings to Frejun's required format: DD/MM/YY HH:MM:SS
 * @param {string|Date} dateStr 
 * @param {boolean} isEnd 
 * @returns {string|null}
 */
export function toFrejunDateFormat(dateStr, isEnd = false) {
  if (!dateStr) return null;
  const str = String(dateStr).trim();
  if (/^\d{2}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/.test(str)) return str;

  // Handles YYYY-MM-DD or standard Date parseable strings
  let d;
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [yyyy, mm, dd] = str.split('-').map(Number);
    d = new Date(yyyy, mm - 1, dd, isEnd ? 23 : 0, isEnd ? 59 : 0, isEnd ? 59 : 0);
  } else {
    d = new Date(str);
  }

  if (isNaN(d.getTime())) return null;

  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');

  return `${dd}/${mm}/${yy} ${hh}:${min}:${ss}`;
}

/**
 * Normalizes an Indian phone query (strips spaces, dashes, parentheses).
 */
export function normalizePhoneNumber(phone) {
  if (!phone) return null;
  const clean = String(phone).replace(/[\s\-()]/g, '');
  return clean || null;
}

/**
 * Fetch paginated call logs from Frejun
 */
export async function getFrejunCalls({
  page = 1,
  pageSize = 50,
  userEmail,
  candidateNumber,
  dateStart,
  dateEnd,
  callId,
} = {}) {
  const apiKey = getApiKey();
  const baseUrl = getBaseUrl();

  // Frejun API times out (504) if no date or user or phone filter is provided over 138k+ records.
  // Safeguard: default to last 30 days if completely unbounded.
  let effectiveDateStart = dateStart;
  let effectiveDateEnd = dateEnd;
  if (!effectiveDateStart && !effectiveDateEnd && !userEmail && !candidateNumber && !callId) {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    effectiveDateEnd = `${d.getFullYear()}-${mm}-${dd}`;
    d.setDate(d.getDate() - 30);
    const mmPast = String(d.getMonth() + 1).padStart(2, '0');
    const ddPast = String(d.getDate()).padStart(2, '0');
    effectiveDateStart = `${d.getFullYear()}-${mmPast}-${ddPast}`;
  }

  const params = new URLSearchParams();
  if (page) params.set('page', String(page));
  if (pageSize) params.set('page_size', String(pageSize));
  if (userEmail) params.set('user_email', String(userEmail).trim());
  if (candidateNumber) {
    const cleanNumber = normalizePhoneNumber(candidateNumber);
    if (cleanNumber) params.set('candidate_number', cleanNumber);
  }
  if (effectiveDateStart) {
    const formatted = toFrejunDateFormat(effectiveDateStart, false);
    if (formatted) params.set('date', formatted);
  }
  if (effectiveDateEnd) {
    const formatted = toFrejunDateFormat(effectiveDateEnd, true);
    if (formatted) params.set('date_end', formatted);
  }
  if (callId) params.set('call_id', String(callId).trim());

  const url = `${baseUrl}/integrations/calls/?${params.toString()}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Api-Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`Frejun API responded with ${res.status}: ${errorText || res.statusText}`);
  }

  const json = await res.json();
  return json?.data ?? { count: 0, next: null, previous: null, results: [] };
}

/**
 * Fetch staff call analytics from Frejun
 */
export async function getFrejunAnalytics({
  dateStart,
  dateEnd,
  users,
} = {}) {
  const apiKey = getApiKey();
  const baseUrl = getBaseUrl();

  const params = new URLSearchParams();
  // date_start and date_end must be YYYY-MM-DD
  if (dateStart) {
    const isoStart = String(dateStart).slice(0, 10);
    params.set('date_start', isoStart);
  }
  if (dateEnd) {
    const isoEnd = String(dateEnd).slice(0, 10);
    params.set('date_end', isoEnd);
  }
  if (users) {
    params.set('users', String(users).trim());
  }

  const url = `${baseUrl}/integrations/call-analytics/?${params.toString()}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Api-Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`Frejun API Analytics responded with ${res.status}: ${errorText || res.statusText}`);
  }

  const json = await res.json();
  return json?.data ?? [];
}
