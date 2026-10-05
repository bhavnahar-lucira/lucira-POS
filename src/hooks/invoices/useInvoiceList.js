import { useQuery } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { fetchStoreScopedDocuments } from '@/services/crossStoreDocuments';
import { selectIsAuthenticated } from '@/store/slices/authSlice';
import { selectActiveStoreId } from '@/store/slices/storeSlice';
import { QUERY_KEYS } from '@/constants/queryKeys';
import APP_CONFIG from '@/constants/appConfig';
import { deriveDocumentStatus } from '@/hooks/customer/useCustomerOrders';

function isEmptyValue(v) {
  return v === null || v === undefined || v === 'NA' || v === '';
}

export function normalizeInvoice(entity) {
  if (!entity) return null;
  const get = (key) => (!isEmptyValue(entity[key]) ? entity[key] : null);

  const balanceAmount = get('balance_amount');
  const receiptAmount = get('receipt_amount');
  const status = deriveDocumentStatus(entity.document_status, balanceAmount, receiptAmount);

  return {
    invoiceId:      get('transaction_id'),
    invoiceNo:      get('document_no'),
    invoiceDate:    get('document_date'),
    customerName:   get('party_name'),
    customerMobile: get('mobile'),
    customerEmail:  get('email'),
    totalAmount:    get('net_amount'),
    balanceAmount,
    receiptAmount,
    status,
    storeName:      get('company_name'),
    raw: entity,
  };
}

export function useInvoiceList({ skip = 0 } = {}) {
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const activeStoreId   = useSelector(selectActiveStoreId);
  const take = APP_CONFIG.PAGINATION.INVOICES_TAKE;

  const query = useQuery({
    queryKey: QUERY_KEYS.INVOICES.LIST({ skip, take, companyId: activeStoreId }),
    queryFn: async () => {
      const result   = await fetchStoreScopedDocuments({ kind: 'invoice', companyId: activeStoreId, take, skip });
      const entities = result.entities;
      return {
        invoices:   entities.map(normalizeInvoice).filter(Boolean),
        totalCount: result.totalCount,
        viaFallback: result.viaFallback,
      };
    },
    enabled:   isAuthenticated && !!activeStoreId,
    staleTime: APP_CONFIG.STALE_TIME.ORDERS,
  });

  return {
    invoices:    query.data?.invoices   ?? [],
    totalCount:  query.data?.totalCount ?? 0,
    viaFallback: query.data?.viaFallback ?? false,
    take,
    isLoading:  query.isLoading,
    isFetching: query.isFetching,
    isError:    query.isError,
    refetch:    query.refetch,
  };
}