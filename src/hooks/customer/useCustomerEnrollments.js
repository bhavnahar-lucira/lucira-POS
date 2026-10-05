import { useQuery } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { getSchemeEnrollments } from '@/services/schemeService';
import { selectActiveStoreId } from '@/store/slices/storeSlice';
import { QUERY_KEYS } from '@/constants/queryKeys';
import APP_CONFIG from '@/constants/appConfig';

function isEmptyValue(v) {
  return v === null || v === undefined || v === 'NA' || v === '';
}

export function normalizeEnrollment(entity) {
  if (!entity) return null;
  const get = (key) => (!isEmptyValue(entity[key]) ? entity[key] : null);
  const monthlyDetails = entity.scheme_monthly_details ?? [];
  const investedFromMonths = monthlyDetails
    .filter((m) => m.payment_made)
    .reduce((sum, m) => sum + (Number(m.month_amount) || 0), 0);
  const hasPendingInstallment = monthlyDetails.length > 0
    ? monthlyDetails.some((m) => !m.payment_made)
    : true;
  const isCancelled = entity.scheme_status === 0;
  const isMatured   = entity.scheme_status === 2;
  const isRedeemed  = entity.scheme_status === 3;
  const status = isCancelled
    ? 'cancelled'
    : isRedeemed
      ? 'redeemed'
      : isMatured
        ? 'matured'
        : (hasPendingInstallment ? 'active' : 'completed');

  return {
    enrollmentId:    get('scheme_enrollment_id'),
    schemeName:      get('scheme_display_name') ?? get('scheme_code'),
    schemeCode:      get('scheme_code'),
    hasPendingInstallment,
    status,
    enrolledDate:    get('document_date'),
    schemeAmount:    get('scheme_amount'),
    tenure:          get('tenure'),
    investedAmount:  get('invested_amount') ?? investedFromMonths,
    benifitAmount:   get('benifit_amount'),       // ⚠️ preserve API typo
    totalPayable:    get('total_amount') ?? get('total_payable'),
    maturityYear:    get('maturity_year'),
    maturityMonth:   get('maturity_month'),
    customerId:      get('party_id'),
    customerName:    get('party_name'),
    customerMobile:  get('mobile'),
    nominee:         get('nominee'),
    nomineeAge:      get('nominee_age'),
    raw: entity,
  };
}

export function useCustomerEnrollments({ customerId, enabled = true } = {}) {
  // company_id must be sent so enrollments are scoped to the active store.
  const activeStoreId = useSelector(selectActiveStoreId);

  const query = useQuery({
    queryKey: QUERY_KEYS.SCHEMES.CUSTOMER_ENROLLMENTS(customerId ?? 'none', activeStoreId),
    queryFn:  async () => {
      // party_id + company_id together — both server-side filtered.
      const data     = await getSchemeEnrollments({ take: 0, party_id: customerId, company_id: activeStoreId });
      // SchemeEnrollment/List may return bare array or wrapped Entities
      const entities = Array.isArray(data)
        ? data
        : (data?.Entities ?? data?.data ?? []);
      return entities.map(normalizeEnrollment).filter(Boolean);
    },
    enabled:   enabled && !!customerId && !!activeStoreId,
    staleTime: APP_CONFIG.STALE_TIME.ORDERS,
  });

  return {
    enrollments: query.data ?? [],
    isLoading:   query.isLoading,
    isFetching:  query.isFetching,
    isError:     query.isError,
    refetch:     query.refetch,
  };
}