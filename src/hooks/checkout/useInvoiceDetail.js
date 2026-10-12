import { useQuery } from '@tanstack/react-query';
import { getInvoiceDetail } from '@/services/orderService';
import { QUERY_KEYS } from '@/constants/queryKeys';

export function useInvoiceDetail(invoiceId) {
  const query = useQuery({
    queryKey: QUERY_KEYS.INVOICES.DETAIL(invoiceId),
    queryFn:  async () => {
      const data = await getInvoiceDetail(invoiceId);
      return data?.Entity ?? null;
    },
    enabled:   !!invoiceId,
    // Also used by OrderConfirmationScreen right after placing an invoice —
    // checkout data must always reflect live state (see
    // useCheckoutPricing/useActivePromotions/useRetrieveCustomer).
    staleTime: 0,
  });

  return {
    invoice:   query.data ?? null,
    isLoading: query.isLoading,
    isError:   query.isError,
    refetch:   query.refetch,
  };
}