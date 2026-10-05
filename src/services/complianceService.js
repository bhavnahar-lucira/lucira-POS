// Tenant-wide compliance policy (Services/Costing/Policy/List, policy_code
// "Compliance") — the same source OrnaVerse's own Return/Create endpoint
// enforces `sales_return_days` from, confirmed live (2026-10-05): a
// same-day Return on this tenant was rejected with "Item ... is outside
// the return window" while Buyback/Exchange accepted the identical item —
// this tenant's real policy has sales_return_days: 40, which only the
// Return flow was actually honouring. Buyback/Exchange must exclude a sold
// item from selection until it's past this same window, mirroring
// OrnaVerse's own compliance model instead of silently allowing a Buyback/
// Exchange to route around a Return's cooling-off period.

import axiosInstance from '@/lib/axios/axiosInstance';
import API from '@/constants/apiEndpoints';

/**
 * @returns {Promise<{ salesReturnDays: number|null, dailyCashLimit: number|null,
 *   maximumRefund: number|null, creditLimit: number|null }>}
 *   Any field is null if this tenant has no "Compliance" policy configured —
 *   callers must treat null as "no limit known", never as 0.
 */
export async function getCompliancePolicy() {
  const response = await axiosInstance.post(API.COSTING.POLICY_LIST, {});
  const entities = response.data?.Entities ?? [];
  const policy = entities.find((p) => p.policy_code === 'Compliance');
  if (!policy) {
    return { salesReturnDays: null, dailyCashLimit: null, maximumRefund: null, creditLimit: null };
  }
  return {
    salesReturnDays: policy.sales_return_days ?? null,
    dailyCashLimit:  policy.daily_cash_transaction_limit_in_pos ?? null,
    maximumRefund:   policy.maximum_refund ?? null,
    creditLimit:     policy.credit_limit_for_pos_customer ?? null,
  };
}
