import { useQuery } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { getSchemeEnrollments } from '@/services/schemeService';
import { normalizeEnrollment } from '@/hooks/customer/useCustomerEnrollments';
import { selectActiveStoreId } from '@/store/slices/storeSlice';
import { QUERY_KEYS } from '@/constants/queryKeys';
import APP_CONFIG from '@/constants/appConfig';

// Store-wise by design — where the scheme was actually enrolled, unlike
// birthdays/anniversaries (see useUpcomingEvents).
const EMPTY_JC_OPTIONS = new Map();
const OPEN_STATUSES = ['active', 'completed']; // not yet cancelled/matured/redeemed

// Due dates are plain local dates ("2026-10-28T00:00:00"), so compare as YYYY-MM-DD strings.
const dayOf = (value) => (value ? String(value).slice(0, 10) : null);
function todayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const unpaidRows = (enrollment) => (enrollment.raw?.scheme_monthly_details ?? [])
  .filter((m) => !m.payment_made && dayOf(m.due_date));

// An unpaid instalment due from today to the end of this month (once its date passes it becomes overdue).
function nextDueThisMonth(enrollment, today) {
  const due = unpaidRows(enrollment)
    .filter((m) => dayOf(m.due_date) >= today && dayOf(m.due_date).slice(0, 7) === today.slice(0, 7))
    .sort((a, b) => dayOf(a.due_date).localeCompare(dayOf(b.due_date)))[0];
  return due ? { dueDate: due.due_date, dueAmount: due.month_amount } : null;
}

// Every unpaid instalment whose due date has already passed, from any month.
function overdueInfo(enrollment, today) {
  const rows = unpaidRows(enrollment).filter((m) => dayOf(m.due_date) < today);
  if (!rows.length) return null;
  const oldest = rows.map((m) => dayOf(m.due_date)).sort()[0];
  return {
    overdueCount:  rows.length,
    overdueAmount: rows.reduce((sum, m) => sum + (Number(m.month_amount) || 0), 0),
    overdueSince:  oldest,
  };
}

function maturesThisMonth(enrollment) {
  const today = new Date();
  if (enrollment.maturityYear == null || enrollment.maturityMonth == null) return false;
  return Number(enrollment.maturityYear) === today.getFullYear()
    && Number(enrollment.maturityMonth) === today.getMonth() + 1; // calendar 1–12, see buildSchemeMonthlyDetails
}

/**
 * @returns {{
 *   due: Array,       — enrollments with an unpaid instalment due from today to month end
 *   overdue: Array,   — enrollments with unpaid instalments past their due date (overdueCount/Amount/Since)
 *   maturing: Array,  — enrollments reaching their scheduled maturity this month
 *   isLoading, isError, refetch,
 * }}
 */
export function useSchemeReminders({ jcId = null } = {}) {
  const activeStoreId = useSelector(selectActiveStoreId);

  const query = useQuery({
    queryKey: QUERY_KEYS.SCHEMES.ENROLLMENTS({ companyId: activeStoreId, scope: 'dashboard-reminders' }),
    queryFn: async () => {
      const data = await getSchemeEnrollments({ take: 0, company_id: activeStoreId });
      const entities = Array.isArray(data) ? data : (data?.Entities ?? data?.data ?? []);
      const open = entities.map(normalizeEnrollment).filter(Boolean).filter((e) => OPEN_STATUSES.includes(e.status));

      const today = todayString();
      const due = [];
      const overdue = [];
      const maturing = [];
      for (const enrollment of open) {
        const dueInfo = nextDueThisMonth(enrollment, today);
        if (dueInfo) due.push({ ...enrollment, ...dueInfo });
        const lateInfo = overdueInfo(enrollment, today);
        if (lateInfo) overdue.push({ ...enrollment, ...lateInfo });
        if (maturesThisMonth(enrollment)) maturing.push(enrollment);
      }
      overdue.sort((a, b) => a.overdueSince.localeCompare(b.overdueSince));
      const jcOptions = new Map();
      for (const e of open) {
        const id = e.raw?.sales_person_id;
        if (id != null && !jcOptions.has(id)) jcOptions.set(id, e.raw?.employee_name?.trim() || `JC #${id} (name not found)`);
      }
      return { due, overdue, maturing, jcOptions };
    },
    enabled:   !!activeStoreId,
    staleTime: APP_CONFIG.STALE_TIME.ORDERS,
  });

  const byJc = (list = []) => (jcId == null ? list : list.filter((e) => e.raw?.sales_person_id === jcId));

  return {
    due:       byJc(query.data?.due),
    overdue:   byJc(query.data?.overdue),
    maturing:  byJc(query.data?.maturing),
    jcOptions: query.data?.jcOptions ?? EMPTY_JC_OPTIONS,
    isLoading: query.isLoading,
    isError:   query.isError,
    refetch:   query.refetch,
  };
}
