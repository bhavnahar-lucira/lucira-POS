import { useQuery } from '@tanstack/react-query';
import { getSchemeMonthlyDetails } from '@/services/schemeService';
import { QUERY_KEYS } from '@/constants/queryKeys';

function normalizeMonth(raw) {
  const isOverdue = !raw.payment_made && !!raw.due_date && new Date(raw.due_date) < new Date();

  return {
    id:         raw.scheme_monthly_details_id,
    monthId:    raw.month_id,
    amount:     raw.month_amount ?? 0,
    isPaid:     !!raw.payment_made,
    isOverdue,
    dueDate:    raw.due_date ?? null,
    paidOnDate: raw.paid_on_date ?? null,
    delayDays:  raw.delay_days ?? 0,
    raw,
  };
}

/**
 * @param {number|null} enrollmentId — scheme_enrollment_id, or null/undefined to disable.
 */
export function useSchemeMonthlyDetails(enrollmentId) {
  return useQuery({
    queryKey: QUERY_KEYS.SCHEMES.MONTHLY_DETAILS(enrollmentId),
    queryFn: async () => {
      const data = await getSchemeMonthlyDetails({ scheme_enrollment_id: enrollmentId });
      const rows = data?.Entities ?? [];
      return rows.map(normalizeMonth).sort((a, b) => {
        if (a.dueDate && b.dueDate) return new Date(a.dueDate) - new Date(b.dueDate);
        if (a.dueDate) return -1;
        if (b.dueDate) return 1;
        return a.monthId - b.monthId;
      });
    },
    enabled: !!enrollmentId,
  });
}
