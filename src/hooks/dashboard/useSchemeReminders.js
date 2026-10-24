import { useQuery } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { getSchemeEnrollments } from '@/services/schemeService';
import { normalizeEnrollment } from '@/hooks/customer/useCustomerEnrollments';
import { selectActiveStoreId } from '@/store/slices/storeSlice';
import { QUERY_KEYS } from '@/constants/queryKeys';
import APP_CONFIG from '@/constants/appConfig';

// Store-wise by design — where the scheme was actually enrolled, unlike
// birthdays/anniversaries (see useUpcomingEvents).
const OPEN_STATUSES = ['active', 'completed']; // not yet cancelled/matured/redeemed

function nextDueThisMonth(enrollment) {
  const today = new Date();
  const rows  = enrollment.raw?.scheme_monthly_details ?? [];
  const due = rows.find((m) => {
    if (m.payment_made) return false;
    const d = new Date(m.due_date);
    return !isNaN(d.getTime()) && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
  });
  return due ? { dueDate: due.due_date, dueAmount: due.month_amount } : null;
}

function maturesThisMonth(enrollment) {
  const today = new Date();
  if (enrollment.maturityYear == null || enrollment.maturityMonth == null) return false;
  return Number(enrollment.maturityYear) === today.getFullYear()
    && Number(enrollment.maturityMonth) === today.getMonth() + 1; // calendar 1–12, see buildSchemeMonthlyDetails
}

/**
 * @returns {{
 *   due: Array,       — enrollments with an unpaid instalment due this month
 *   maturing: Array,  — enrollments reaching their scheduled maturity this month
 *   isLoading, isError, refetch,
 * }}
 */
export function useSchemeReminders() {
  const activeStoreId = useSelector(selectActiveStoreId);

  const query = useQuery({
    queryKey: QUERY_KEYS.SCHEMES.ENROLLMENTS({ companyId: activeStoreId, scope: 'dashboard-reminders' }),
    queryFn: async () => {
      const data = await getSchemeEnrollments({ take: 0, company_id: activeStoreId });
      const entities = Array.isArray(data) ? data : (data?.Entities ?? data?.data ?? []);
      const open = entities.map(normalizeEnrollment).filter(Boolean).filter((e) => OPEN_STATUSES.includes(e.status));

      const due = [];
      const maturing = [];
      for (const enrollment of open) {
        const dueInfo = nextDueThisMonth(enrollment);
        if (dueInfo) due.push({ ...enrollment, ...dueInfo });
        if (maturesThisMonth(enrollment)) maturing.push(enrollment);
      }
      return { due, maturing };
    },
    enabled:   !!activeStoreId,
    staleTime: APP_CONFIG.STALE_TIME.ORDERS,
  });

  return {
    due:       query.data?.due ?? [],
    maturing:  query.data?.maturing ?? [],
    isLoading: query.isLoading,
    isError:   query.isError,
    refetch:   query.refetch,
  };
}
