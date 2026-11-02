import { getSessionFromRequest } from '@/lib/ornaverse/session';
import {
  DATE_RE, isValidCompanyIds, getAuthorizedStores, postUpstream, toRfc1123,
} from '@/lib/reports/serverAccess';

// OrnaVerse's Jewellery Stock report ignores Take/IncludeColumns and returns ~130
// fields per piece (incl. cost), ~15MB for all stores — so it's projected here.
const STOCK_FIELDS = [
  'company_id', 'item_code', 'item_name', 'location_name', 'item_group_name',
  'type_name', 'sub_type_name', 'karat_name', 'metal_color_name', 'item_size_name',
  'sku', 'huid', 'certificate_no', 'hsn', 'supplier_style', 'supplier_batch',
  'pieces', 'weight', 'net_weight', 'diamond_pieces', 'diamond_weight',
  'color_stone_pieces', 'color_stone_weight', 'stone_pieces', 'stone_weight',
  'other_pieces', 'other_weight', 'is_allocated',
  'center_stone_shape_name', 'center_stone_weight_name', 'center_stone_color_name', 'center_stone_quality_name',
];
const JEWELLERY_BASE_ITEM_ID = 11;

export async function POST(request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { companyIds, toDate } = body ?? {};
  if (!isValidCompanyIds(companyIds) || !DATE_RE.test(toDate ?? '')) {
    return Response.json({ error: 'companyIds and toDate (YYYY-MM-DD) are required' }, { status: 400 });
  }

  let stores;
  try {
    stores = await getAuthorizedStores(session, companyIds);
  } catch (err) {
    console.error('[api/reports/stock] store authorization check failed', err);
    return Response.json({ error: 'Could not verify store access' }, { status: 502 });
  }
  if (!stores) {
    return Response.json({ error: 'Not authorized for this store' }, { status: 403 });
  }

  try {
    const data = await postUpstream(session, 'Services/Reports/StockReport/List', {
      document_status: 1,
      company_ids: companyIds,
      base_item_id: JEWELLERY_BASE_ITEM_ID,
      to_date: toRfc1123(toDate),
    });
    const allowed = new Set(companyIds);
    const rows = (data?.Entities ?? [])
      .filter((entity) => allowed.has(entity.company_id))
      .map((entity) => {
        const row = {};
        for (const field of STOCK_FIELDS) row[field] = entity[field];
        return row;
      });
    return Response.json({ rows });
  } catch (err) {
    console.error('[api/reports/stock] failed', err);
    return Response.json({ error: 'Stock report failed' }, { status: err.status === 401 ? 401 : 502 });
  }
}
