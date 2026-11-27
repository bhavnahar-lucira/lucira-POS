// Reserve (doc 141), same as OrnaVerse's Sales Counter "Reserve" tab: a posted document that holds stock
// jewellery for a customer against an optional advance. OrnaVerse has no convert-to-invoice step.

import axiosInstance from '@/lib/axios/axiosInstance';
import API from '@/constants/apiEndpoints';

const { RESERVES: EP } = API;

const post = async (url, body) => (await axiosInstance.post(url, body)).data;

export const createReserve = (entity) => post(EP.CREATE, { Entity: entity });

export const postReserve = (id) => post(EP.POST, { EntityId: id });

export async function retrieveReserve(id) {
  return (await post(EP.RETRIEVE, { EntityId: id }))?.Entity ?? null;
}

export async function listReserves({ companyId, take = 300 }) {
  const data = await post(EP.LIST, { company_id: companyId, Take: take, Sort: ['transaction_id DESC'] });
  return (data?.Entities ?? []).filter((r) => !companyId || r.company_id === companyId);
}

export async function cancelReserve(id) {
  const entity = await retrieveReserve(id);
  if (!entity) throw new Error('This reserve no longer exists in OrnaVerse');
  return post(EP.CANCEL, { EntityId: id, Entity: entity });
}

/** OrnaVerse's reserve "Pay": appends receipts to the posted reserve and saves it via Update. */
export async function addReserveAdvance(id, receiptRows) {
  const entity = await retrieveReserve(id);
  if (!entity) throw new Error('This reserve no longer exists in OrnaVerse');
  const receipt_details = [...(entity.receipt_details ?? []), ...receiptRows];
  const receipt_amount = +receipt_details.reduce((s, r) => s + (Number(r.amount) || 0), 0).toFixed(2);
  return post(EP.UPDATE, {
    EntityId: id,
    Entity: { ...entity, receipt_details, receipt_amount, balance_amount: +((entity.net_amount ?? 0) - receipt_amount).toFixed(2) },
  });
}
