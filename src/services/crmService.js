// Walk-in lead registration + retrieval — CONFIRMED LIVE via OrnaVerse's own
// API reference (2026-09-28): WalkIn/Register (its own module has no listing
// mode) writes into the same CRM.Customer table Services/CRM/Customer/List
// reads from, so a real walk-in lead list is possible with no local DB.
//
// WalkIn/Register real request shape (fields beyond mobile/name are all
// optional on OrnaVerse's own form):
//   mobile*, first_name*, last_name, phone, email, gender, birth_date,
//   anniversary, marital_status, country_id, state_id, city_id, pin_code,
//   address, source_id, sales_representative_id (an employee_id — same
//   master list checkout's own SalesPersonSelect uses), interest: number[]
//   (type_id — the SAME Master/Type ids the catalog category filter uses,
//   confirmed via CustomerInterestRel's own EqualityFilter carrying a
//   type_id field), budget, notes.
//
// CAPTURED VERBATIM from OrnaVerse's own WalkIn form (2026-09-30, partial
// fill): unfilled optional fields are OMITTED from the request entirely —
// never sent as null or ''. WalkInRegisterForm's onSubmit strips them the
// same way before posting (see its own comment).
import axiosInstance from '@/lib/axios/axiosInstance';
import API from '@/constants/apiEndpoints';

/**
 * @returns {Promise<object>} response.data — { Customer, WalkInRecorded, Message }
 *   (per OrnaVerse's own apidog schema, shared directly 2026-09-30) — Customer
 *   is the full newly-created CRM row (customer_id, party_id, creation_date,
 *   customer_visits[], etc.), same shape normalizeCrmLead already expects.
 */
export async function registerWalkIn(payload) {
  const response = await axiosInstance.post(API.WALKIN.REGISTER, payload);
  return response.data;
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
    // Without this, the server's default order is oldest-first — CONFIRMED
    // LIVE 2026-10-08: with 447 total visits for one store, an unsorted
    // Take:300 returned only Feb-Sept records, silently missing every visit
    // from the last month (including ones recorded the same day). This made
    // real, successfully-recorded walk-ins look like they "weren't recorded."
    Sort: ['date DESC'],
  });
  return response.data;
}
