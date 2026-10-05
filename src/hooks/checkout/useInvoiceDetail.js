import { useQuery } from '@tanstack/react-query';
import { getInvoiceDetail } from '@/services/orderService';
import { QUERY_KEYS } from '@/constants/queryKeys';
import APP_CONFIG from '@/constants/appConfig';

export function useInvoiceDetail(invoiceId) {
  const query = useQuery({
    queryKey: QUERY_KEYS.INVOICES.DETAIL(invoiceId),
    queryFn:  async () => {
      const data = await getInvoiceDetail(invoiceId);
      return data?.Entity ?? null;
    },
    enabled:   !!invoiceId,
    staleTime: APP_CONFIG.STALE_TIME.ORDERS,
  });

  return {
    invoice:   query.data ?? null,
    isLoading: query.isLoading,
    isError:   query.isError,
    refetch:   query.refetch,
  };
}