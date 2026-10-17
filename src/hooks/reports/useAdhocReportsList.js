import { useQuery } from '@tanstack/react-query';
import { listAdhocReports } from '@/services/adhocReportsService';
import { QUERY_KEYS } from '@/constants/queryKeys';
import APP_CONFIG from '@/constants/appConfig';

export function useAdhocReportsList() {
  const query = useQuery({
    queryKey: QUERY_KEYS.ADHOC_REPORTS.LIST(),
    queryFn:  listAdhocReports,
    staleTime: APP_CONFIG.STALE_TIME.ANALYTICS,
  });

  return {
    reports:   query.data ?? [],
    isLoading: query.isLoading,
    isError:   query.isError,
    // Serenity's stable error code for "this account has no role/permission
    // granting Reporting:AdhocReports:View" — confirmed live 2026-10-16
    // against a real restricted account, distinct from a transient failure.
    isPermissionError: query.error?.response?.data?.Error?.Code === 'AccessDenied',
    refetch:   query.refetch,
  };
}
