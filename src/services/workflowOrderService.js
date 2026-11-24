// src/services/workflowOrderService.js

/**
 * Service to query workflow orders from /api/pos/workflow-orders
 */
export async function fetchWorkflowOrders(params = {}) {
  const queryParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      queryParams.set(key, String(value));
    }
  }

  const res = await fetch(`/api/pos/workflow-orders?${queryParams.toString()}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    throw new Error(errorJson.error || `Failed to fetch workflow orders (status: ${res.status})`);
  }

  return res.json();
}

async function getJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}

export async function fetchWorkflowStatuses(docNos) {
  if (!docNos.length) return {};
  const res = await fetch('/api/workflow-orders/by-document', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ document_no: docNos }),
    cache: 'no-store',
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json.statuses ?? {};
}

export async function fetchWorkflowOrderByDocument(docNo) {
  const json = await getJson(`/api/workflow-orders/by-document?full=1&document_no=${encodeURIComponent(docNo)}`);
  return json.order ?? null;
}
