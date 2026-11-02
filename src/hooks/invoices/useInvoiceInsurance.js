import { useQuery } from '@tanstack/react-query';
import { getInsurancePolicies } from '@/services/insuranceService';
import { QUERY_KEYS } from '@/constants/queryKeys';

/**
 * Policies already issued against one invoice.
 *
 * Reads our own record (see lib/mongo/insurancePolicies) rather than
 * Olocker — their API issues policies but offers no way to list them back.
 *
 * @param {number|null} transactionId
 */
export function useInvoiceInsurance(transactionId) {
  const query = useQuery({
    queryKey: QUERY_KEYS.INSURANCE.BY_INVOICE(transactionId),
    queryFn:  () => getInsurancePolicies(transactionId),
    enabled:  !!transactionId,
    staleTime: 0,
  });

  return {
    policies:  query.data?.items ?? [],
    // True once this invoice holds a policy Olocker returned without enough
    // information to tie it to a line — the sheet must stop offering to
    // generate more (see the route's own guard).
    unattributed: query.data?.unattributed === true,
    isLoading: query.isLoading,
    isError:   query.isError,
  };
}
