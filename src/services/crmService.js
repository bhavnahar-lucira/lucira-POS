// Walk-in lead registration + retrieval — CONFIRMED LIVE via OrnaVerse's own
// API reference (2026-09-28): WalkIn/Register (its own module has no listing
// mode) writes into the same CRM.Customer table Services/CRM/Customer/List
// reads from, so a real walk-in lead list is possible with no local DB.
//
// WalkIn/Register real request shape (fields beyond mobile/name are all
// optional on OrnaVerse's own form):
//   mobile*, first_name*, last_name, phone, email, gender, birth_date,
//   anniversary, marital_status, country_id, state_id, city_id, pin_code,
//   address, source_id, interest: number[] (type_id — the SAME Master/Type
//   ids the catalog category filter uses, confirmed via CustomerInterestRel's
//   own EqualityFilter carrying a type_id field), budget, notes.
import axiosInstance from '@/lib/axios/axiosInstance';
import API from '@/constants/apiEndpoints';

export function registerWalkIn(payload) {
  return axiosInstance.post(API.WALKIN.REGISTER, payload);
}

/**
 * @param {{ take?: number, skip?: number }} params
 * @returns {Promise<object>} response.data — { Entities: CRM.Customer[] }
 */
export async function getCrmLeads({ take = 100, skip = 0 } = {}) {
  const response = await axiosInstance.post(API.CRM.CUSTOMER_LIST, { Take: take, Skip: skip });
  return response.data;
}

/** Lookup values for WalkIn/Register's source_id. */
export async function getSources() {
  const response = await axiosInstance.post(API.CRM.SOURCES_LIST, { Take: 0 });
  return response.data;
}

/**
 * Real walk-in visit log — Services/CRM/CustomerVisits/List, EqualityFilter
 * narrows server-side to one store (CONFIRMED LIVE 2026-09-28). Replaces the
 * old Mongo-backed walkins_POS log entirely (2026-09-28, explicit direction:
 * no DB for walk-in data) — every field here comes straight from OrnaVerse.
 * @param {{ companyId: number, take?: number }} params
 */
export async function getCustomerVisits({ companyId, take = 200 }) {
  const response = await axiosInstance.post(API.CRM.CUSTOMER_VISITS_LIST, {
    Take: take,
    EqualityFilter: { company_id: companyId },
  });
  return response.data;
}
