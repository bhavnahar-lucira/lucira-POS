// Customer lookup, creation, and update — all via native POS endpoints.
//
// RESPONSE CONVENTION:
//   getCustomer()      → raw AxiosResponse (useCustomerLookup reads .data.Entities)
//   retrieveCustomer() → raw AxiosResponse (useRetrieveCustomer reads .data.Entity)
//   getCustomerList()  → response.data     (useCustomerList/useAllCustomers read .Entities)
//   createCustomer()   → raw AxiosResponse (useCreateCustomer reads .data.EntityId)
//   updateCustomer()   → raw AxiosResponse

import axiosInstance from '@/lib/axios/axiosInstance';
import API from '@/constants/apiEndpoints';

export function getCustomer(mobile) {
  return axiosInstance.post(API.CUSTOMERS.GET_CUSTOMER, { mobile });
}

export function retrieveCustomer(partyId) {
  return axiosInstance.post(API.CUSTOMERS.RETRIEVE, { EntityId: partyId });
}

// NOT a pure read — every call also records a customer_visits row against the
// active store (resolved server-side from the token). Only call this once per
// staff-initiated mobile search, never speculatively. See apiEndpoints.js
// WALKIN.LOOKUP for the full confirmed contract.
export function walkInLookup(mobile) {
  return axiosInstance.post(API.WALKIN.LOOKUP, { mobile });
}

/**
 * @param {{ take?: number, skip?: number, companyId?: number, containsText?: string }} params
 *   containsText — CONFIRMED LIVE (2026-09-28): Customer/List's real free-text
 *   filter (Serenity's ListRequest.ContainsText), matches partial name OR
 *   mobile server-side (e.g. "8149" finds "8149639991") — this is what
 *   powers real, API-backed partial search instead of filtering a
 *   locally-cached directory snapshot.
 * Returns response.data — hooks read .Entities directly.
 */
export async function getCustomerList({ take = 50, skip = 0, companyId, containsText } = {}) {
  const response = await axiosInstance.post(API.CUSTOMERS.LIST, {
    Take:         take,
    Skip:         skip,
    company_id:   companyId,
    ContainsText: containsText || undefined,
  });
  return response.data;  // ← unwrapped so hooks do data?.Entities not data?.data?.Entities
}

export function createCustomer(payload) {
  return axiosInstance.post(API.CUSTOMERS.CREATE, { Entity: payload });
}

export function updateCustomer(partyId, payload) {
  return axiosInstance.post(API.CUSTOMERS.UPDATE, {
    EntityId: partyId,
    Entity:   payload,
  });
}