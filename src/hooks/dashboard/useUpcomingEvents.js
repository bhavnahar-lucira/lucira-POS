import { useQuery } from '@tanstack/react-query';
import { getCustomerList } from '@/services/customerService';
import { normalizeCustomer } from '@/lib/normalizers/customer';
import { QUERY_KEYS } from '@/constants/queryKeys';
import APP_CONFIG from '@/constants/appConfig';

// Global by design — a customer's store of first enrollment has no bearing
// on when they were born or married, unlike schemes (see useSchemeReminders).
const WINDOW_DAYS = 15;

function daysBetween(fromMidnight, toMidnight) {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  return Math.round((toMidnight - fromMidnight) / MS_PER_DAY);
}

// This year's occurrence of a given month/day, rolled to next year if it
// already passed — so the window keeps rolling day-to-day instead of
// resetting at a fixed calendar-month boundary (where, e.g., an Oct 15
// lookup would miss a birthday on Nov 1 entirely until the month flipped).
function nextOccurrence(month, day, todayMidnight) {
  let candidate = new Date(todayMidnight.getFullYear(), month, day);
  if (daysBetween(todayMidnight, candidate) < 0) {
    candidate = new Date(todayMidnight.getFullYear() + 1, month, day);
  }
  return candidate;
}

function toUpcomingEvents(customers, field, type, todayMidnight) {
  const events = [];
  for (const c of customers) {
    const raw = c[field];
    if (!raw) continue;
    const d = new Date(raw);
    if (isNaN(d.getTime())) continue;

    const occurrence = nextOccurrence(d.getMonth(), d.getDate(), todayMidnight);
    const daysUntil = daysBetween(todayMidnight, occurrence);
    if (daysUntil > WINDOW_DAYS) continue;

    events.push({
      partyId:    c.customerId,
      name:       c.customerName,
      mobile:     c.customerMobile,
      type,
      day:        occurrence.getDate(),
      monthLabel: occurrence.toLocaleDateString('en-IN', { month: 'long' }),
      daysUntil,
      isToday:    daysUntil === 0,
    });
  }
  return events.sort((a, b) => a.daysUntil - b.daysUntil);
}

/**
 * @returns {{
 *   birthdays: Array<{partyId, name, mobile, day, monthLabel, daysUntil, isToday}>,
 *   anniversaries: Array<{partyId, name, mobile, day, monthLabel, daysUntil, isToday}>,
 *   isLoading, isError, refetch,
 * }}
 */
export function useUpcomingEvents() {
  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // Keyed on today's actual date (not just a static scope string) so the
  // rolling window is a genuine cache miss every new day — fetched fresh
  // immediately — instead of showing yesterday's window for up to staleTime.
  const dateKey = todayMidnight.toISOString().slice(0, 10);

  const query = useQuery({
    queryKey: QUERY_KEYS.CUSTOMERS.LIST({ scope: 'dashboard-events', date: dateKey }),
    queryFn: async () => {
      const data = await getCustomerList({ take: 0 });
      const customers = (data?.Entities ?? []).map(normalizeCustomer).filter(Boolean);
      return {
        birthdays:     toUpcomingEvents(customers, 'birthDate', 'birthday', todayMidnight),
        anniversaries: toUpcomingEvents(customers, 'anniversary', 'anniversary', todayMidnight),
      };
    },
    staleTime: APP_CONFIG.STALE_TIME.STATIC,
  });

  return {
    birthdays:     query.data?.birthdays ?? [],
    anniversaries: query.data?.anniversaries ?? [],
    isLoading: query.isLoading,
    isError:   query.isError,
    refetch:   query.refetch,
  };
}
