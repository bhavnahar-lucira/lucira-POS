import { useQuery }      from '@tanstack/react-query';
import { useSelector }   from 'react-redux';
import { getEstimations } from '@/services/estimationService';
import { QUERY_KEYS }    from '@/constants/queryKeys';
import APP_CONFIG        from '@/constants/appConfig';

function isNA(v) {
  return v === null || v === undefined || v === 'NA' || v === '';
}
function get(entity, key) {
  return !isNA(entity[key]) ? entity[key] : null;
}

export function normalizeEstimation(entity) {
  if (!entity) return null;
  return {
    transactionId: get(entity, 'transaction_id'),
    documentNo:    get(entity, 'document_no'),
    documentDate:  get(entity, 'document_date'),
    customerId:    get(entity, 'party_id'),
    customerName:  get(entity, 'party_name'),
    amount:        get(entity, 'net_amount'),
    isOrdered:     entity.line_items?.[0]?.is_ordered ?? false,
    isClosed:      entity.line_items?.[0]?.is_closed  ?? false,
    companyId:     get(entity, 'company_id'),
    lineItems:     Array.isArray(entity.line_items) ? entity.line_items : [],
    raw: entity,
  };
}

export function useEstimations({ skip = 0, enabled = true } = {}) {
  const storeId = useSelector((state) => state.store.activeStoreId);
  const take    = APP_CONFIG.PAGINATION.TRANSACTIONS_TAKE ?? 50;

  const query = useQuery({
    queryKey: QUERY_KEYS.ESTIMATION.LIST({ storeId, skip, take }),
    queryFn:  async () => {
      const data     = await getEstimations({ company_id: storeId, take, skip });
      const entities = data?.Entities ?? [];
      const items = entities
        .map(normalizeEstimation)
        .filter(Boolean)
        .filter((e) => e.companyId === storeId);
      return {
        items,
        totalCount: data?.TotalCount ?? entities.length,
      };
    },
    enabled:   enabled && !!storeId,
    staleTime: APP_CONFIG.STALE_TIME.ORDERS,
  });

  return {
    items:      query.data?.items      ?? [],
    totalCount: query.data?.totalCount ?? 0,
    take,
    isLoading:  query.isLoading,
    isFetching: query.isFetching,
    isError:    query.isError,
    refetch:    query.refetch,
  };
}
