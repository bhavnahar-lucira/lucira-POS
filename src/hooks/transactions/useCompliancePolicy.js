import { useQuery } from '@tanstack/react-query';
import { getCompliancePolicy } from '@/services/complianceService';
import { QUERY_KEYS } from '@/constants/queryKeys';
import APP_CONFIG from '@/constants/appConfig';

/**
 * Tenant-wide compliance policy — same shape every operator sees, changes
 * rarely, so cached long like other master/reference data.
 */
export function useCompliancePolicy() {
  const query = useQuery({
    queryKey:  QUERY_KEYS.COMPLIANCE.POLICY(),
    queryFn:   getCompliancePolicy,
    staleTime: APP_CONFIG.STALE_TIME.MASTER_DATA,
    gcTime:    APP_CONFIG.STALE_TIME.MASTER_DATA,
  });

  return {
    salesReturnDays: query.data?.salesReturnDays ?? null,
    dailyCashLimit:  query.data?.dailyCashLimit ?? null,
    maximumRefund:   query.data?.maximumRefund ?? null,
    creditLimit:     query.data?.creditLimit ?? null,
    isLoading: query.isLoading,
  };
}
