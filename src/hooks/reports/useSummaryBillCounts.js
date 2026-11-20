import { useQuery } from '@tanstack/react-query';
import { getSummaryBillCounts } from '@/services/reportsService';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { liveReportOptions, isFirstLoad } from '@/hooks/reports/liveReportOptions';

export function useSummaryBillCounts({ companyIds, fromDate, toDate, enabled = true }) {
  const params = { companyIds, fromDate, toDate };
  const query = useQuery({
    queryKey: QUERY_KEYS.REPORTS.SUMMARY_BILLS(params),
    queryFn:  () => getSummaryBillCounts(params),
    enabled:  enabled && !!companyIds?.length && !!fromDate && !!toDate,
    ...liveReportOptions(toDate),
    retry: false,
  });

  return {
    data:      query.data ?? null,
    isLoading: isFirstLoad(query),
    isError:   query.isError,
  };
}
