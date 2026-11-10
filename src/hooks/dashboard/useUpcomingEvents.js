import { useQuery } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import axiosInstance from '@/lib/axios/axiosInstance';
import API from '@/constants/apiEndpoints';
import { selectActiveStoreId } from '@/store/slices/storeSlice';
import { normalizeCustomer } from '@/lib/normalizers/customer';
import { QUERY_KEYS } from '@/constants/queryKeys';
import APP_CONFIG from '@/constants/appConfig';

// Store-specific: a customer is listed only under the store they registered at.
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
      companyId:  c.raw?.company_id ?? null,
      type,
      day:        occurrence.getDate(),
      monthLabel: occurrence.toLocaleDateString('en-IN', { month: 'long' }),
      daysUntil,
      isToday:    daysUntil === 0,
    });
  }
  return events.sort((a, b) => a.daysUntil - b.daysUntil);
}

// Store codes of the other stores each event's customer has walked into.
// Visit mobiles are masked, so visits come from the CRM record (linked by party_id).
async function attachVisitedStores(events) {
  if (!events.length) return events;
  const partyIds = [...new Set(events.map((e) => e.partyId))];
  const crm = await axiosInstance.post(API.CRM.CUSTOMER_LIST, {
    Take: 0, Criteria: [['party_id'], 'in', [partyIds]],
  });
  const stores = new Map();
  for (const c of crm.data?.Entities ?? []) {
    for (const v of c.customer_visits ?? []) {
      if (v.company_id == null) continue;
      if (!stores.has(c.party_id)) stores.set(c.party_id, new Map());
      stores.get(c.party_id).set(v.company_id, v.company_code ?? `#${v.company_id}`);
    }
  }
  return events.map((e) => ({
    ...e,
    visitedStoreCodes: [...(stores.get(e.partyId) ?? [])]
      .filter(([id]) => Number(id) !== Number(e.companyId))
      .map(([, code]) => code),
  }));
}

/**
 * @returns {{
 *   birthdays: Array<{partyId, name, mobile, day, monthLabel, daysUntil, isToday}>,
 *   anniversaries: Array<{partyId, name, mobile, day, monthLabel, daysUntil, isToday}>,
 *   isLoading, isError, refetch,
 * }}
 */
export function useUpcomingEvents() {
  const activeStoreId = useSelector(selectActiveStoreId);
  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // Keyed on today's actual date (not just a static scope string) so the
  // rolling window is a genuine cache miss every new day — fetched fresh
  // immediately — instead of showing yesterday's window for up to staleTime.
  const dateKey = todayMidnight.toISOString().slice(0, 10);

  const query = useQuery({
    queryKey: QUERY_KEYS.CUSTOMERS.LIST({ scope: 'dashboard-events', date: dateKey, companyId: activeStoreId }),
    queryFn: async () => {
      const response = await axiosInstance.post(API.CUSTOMERS.LIST, {
        Take: 0,
        EqualityFilter: { company_id: activeStoreId },
        Criteria: [['is not null', ['birth_date']], 'or', ['is not null', ['anniversary']]],
      });
      const customers = (response.data?.Entities ?? [])
        .map(normalizeCustomer)
        .filter(Boolean);
      const birthdays     = toUpcomingEvents(customers, 'birthDate', 'birthday', todayMidnight);
      const anniversaries = toUpcomingEvents(customers, 'anniversary', 'anniversary', todayMidnight);
      const withVisits = await attachVisitedStores([...birthdays, ...anniversaries]);
      return {
        birthdays:     withVisits.slice(0, birthdays.length),
        anniversaries: withVisits.slice(birthdays.length),
      };
    },
    enabled:   !!activeStoreId,
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
