// Settings, payment modes, taxes, metal rates, reason codes.
// All functions are pure HTTP wrappers — no business logic.
//
// NOTE: AppSettings/Retrieve and AppSettings/Update are NOT present in the
// v1.json spec — those endpoints no longer exist. Removed.

import axiosInstance from '@/lib/axios/axiosInstance';
import API from '@/constants/apiEndpoints';
import APP_CONFIG from '@/constants/appConfig';
import { todayDateString } from '@/lib/dateUtils';

/**
 * All payment receipt modes available for a sale (Cash, Card, UPI, etc.).
 * Filtered client-side by ALLOWLIST/DENYLIST in appConfig.js.
 * @returns {Promise<object>} Entities[] of PaymentReceiptModeRow
 */
export async function getPaymentModes() {
  const response = await axiosInstance.post(API.SETTINGS.GET_PAYMENT_MODES, {
    Take: 0,
  });
  return response.data;
}

/**
 * Payment modes available specifically for refund transactions.
 * Subset of getPaymentModes() — use this on the refund screen.
 * @returns {Promise<object>} Entities[] of PaymentReceiptModeRow
 */
export async function getPaymentModesForRefund() {
  const response = await axiosInstance.post(API.SETTINGS.GET_PAYMENT_MODES_REFUND, {
    Take: 0,
  });
  return response.data;
}

/**
 * Bank/POS accounts a bank-settled payment (Credit Card, Debit Card, UPI)
 * can be deposited against — e.g. "HDFC BANK MAIN", "ICICI BANK MAIN".
 * Do NOT pass company_id — this endpoint 500s if you do; it's scoped
 * server-side from the token.
 * @returns {Promise<object>} Entities[] of {id, code, name, ledger_id, company_id}
 */
export async function getBankPosAccounts() {
  const response = await axiosInstance.post(API.SETTINGS.GET_BANK_POS_ACCOUNTS, {
    Take: 0,
  });
  return response.data;
}

/**
 * Fetches applicable taxes for the store (GST slabs, etc.).
 *
 * `exchange_rate` is REQUIRED — omitting it fails with "Exchange rate must
 * be greater than zero" before the request reaches tax lookup. Even with it,
 * a store with no tax template configured returns "Tax Template Not
 * Defined!" — a real per-store config gap, not a bug here.
 * @param {{ company_id: number }} params
 * @returns {Promise<object>} OrnaVerse tax response
 */
export async function getTaxes({ company_id } = {}) {
  const response = await axiosInstance.post(API.SETTINGS.GET_TAXES, {
    company_id,
    exchange_rate: 1,
  });
  return response.data;
}

/**
 * Check whether a metal rate has been entered for today.
 * Call at POS startup — warn the operator if rates are missing.
 * @returns {Promise<object>} OrnaVerse response with rate status
 */
export async function checkMetalRateToday() {
  const response = await axiosInstance.post(API.SETTINGS.CHECK_METAL_RATE_TODAY, {});
  return response.data;
}

/**
 * Creates a new metal rate entry for the day.
 * @param {{
 *   metal_type_id: number,
 *   purchase_rate:  number,
 *   sales_rate:     number,
 *   from_date:      string,
 *   currency_id:    number
 * }} payload
 * @returns {Promise<object>} SaveResponse { EntityId, Error }
 */
export async function addMetalRate(payload) {
  const response = await axiosInstance.post(API.COSTING.ADD_METAL_RATE, payload);
  return response.data;
}

/**
 * TODAY's live sales rate for one specific karat/purity — the same call that
 * powers the highlighted rate strip on OrnaVerse's own POS header. One call
 * per karat, not a list endpoint — GetMetalRate needs karat_id up front;
 * nothing here returns "every configured karat" for a store.
 * @param {{ karatId: number, companyId: number }} params
 * @returns {Promise<{ is_cutomer_item: boolean, rate: number }>}
 *   `is_cutomer_item` is OrnaVerse's own field name (their typo, not ours).
 */
export async function getMetalRate({ karatId, companyId }) {
  // Use the local-calendar-day helper rather than new Date().toUTCString():
  // converting to UTC first rolls back to "yesterday" for an IST user before
  // ~5:30am local time, which could make today's rate come back missing or
  // stale during early-morning hours.
  const today = todayDateString();
  const response = await axiosInstance.post(API.HELPERS.GET_METAL_RATE, {
    item_group_id:   APP_CONFIG.METAL_TYPES.GOLD, // 106 — constant across every karat_id, gold or otherwise
    karat_id:         karatId,
    is_purchase:      false,
    from_date:        today,
    to_date:          today,
    company_id:       companyId,
    use_karat_rate:   true,
  });
  return response.data;
}

/**
 * Currency exchange rate — required on Order/Invoice Create alongside
 * currency_id. currency_id 103 (INR) returns exchange_rate: 1.
 * @param {{ currency_id: number, company_id?: number }} params
 * @returns {Promise<object>} { Entity: { exchange_rate, currency_id, ... } }
 */
export async function getExchangeRate({ currency_id, company_id } = {}) {
  const response = await axiosInstance.post(API.EXCHANGE_RATE.GET, {
    currency_id,
    company_id,
  });
  return response.data;
}

/**
 * Fetches reason codes used for returns, cancellations, exchanges.
 * Static dataset — cache for session.
 *
 * NOTE: Administration/Reason/List currently returns a generic 500
 * unconditionally on this tenant, regardless of payload shape. Not a payload
 * issue on our side; needs OrnaVerse's team.
 * @returns {Promise<object>} Entities[] of ReasonRow
 */
export async function getReasonCodes() {
  const response = await axiosInstance.post(API.SETTINGS.GET_REASON_CODES, {
    Take: 0,
  });
  return response.data;
}

/** OrnaVerse configuration value by code, as its own client reads it (e.g. 1056 = manual rates enabled). */
export async function getConfigValue(code) {
  const response = await axiosInstance.post(API.SETTINGS.GET_CONFIG, { configuration_code: code });
  return response.data?.value ?? '';
}

/** The signed-in operator's OrnaVerse user data: { is_admin, permissions: { [key]: true } }. */
export async function getUserData() {
  const response = await axiosInstance.get(API.SETTINGS.USER_DATA);
  return response.data ?? {};
}
