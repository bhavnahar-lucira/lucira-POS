// OrnaVerse Categories module — Types, SubTypes, ItemGroups.
// All functions are pure HTTP wrappers. No business logic.
// Source of truth: API_MAPPING.md Section 4

import axiosInstance from '@/lib/axios/axiosInstance';
import API from '@/constants/apiEndpoints';
import APP_CONFIG from '@/constants/appConfig';

/**
 * Fetches all product categories (Types) from OrnaVerse.
 * Take: 0 returns the full list (small static dataset).
 * Maps to: POST Services/Master/Type/List
 */
export async function getCategories() {
  const response = await axiosInstance.post(API.CATEGORIES.GET_TYPES, {
    Take: APP_CONFIG.PAGINATION.CATEGORIES_TAKE,
  });
  return response.data;
}

/**
 * Fetches all product sub-categories (SubTypes) from OrnaVerse.
 * Take: 0 returns the full list (small static dataset).
 * Maps to: POST Services/Master/SubType/List
 */
export async function getSubTypes() {
  const response = await axiosInstance.post(API.CATEGORIES.GET_SUBTYPES, {
    Take: APP_CONFIG.PAGINATION.CATEGORIES_TAKE,
  });
  return response.data;
}

/**
 * Fetches the sub-types belonging to a single category (Type). Distinct from
 * getSubTypes() above — that endpoint's rows carry no type_id to scope them
 * by category (see its own comment); this one takes type_id directly and
 * returns just that category's own sub-types, matching the catalog Filters
 * panel's "Sub Category" dropdown (disabled until a category is picked).
 * Maps to: POST Services/Master/SubTypeDetails/List
 * @param {number} typeId
 */
export async function getSubTypeDetails(typeId) {
  const response = await axiosInstance.post(API.CATEGORIES.GET_SUBTYPE_DETAILS, {
    type_id: typeId,
    Take:    APP_CONFIG.PAGINATION.CATEGORIES_TAKE,
  });
  return response.data;
}

/**
 * Fetches all item groups from OrnaVerse.
 * Take: 0 returns the full list (small static dataset).
 * Maps to: POST Services/Master/ItemGroups/List
 */
export async function getItemGroups() {
  const response = await axiosInstance.post(API.CATEGORIES.GET_ITEM_GROUPS, {
    Take: APP_CONFIG.PAGINATION.CATEGORIES_TAKE,
  });
  return response.data;
}
