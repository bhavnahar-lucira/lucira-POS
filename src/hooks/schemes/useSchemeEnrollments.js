import { useQuery } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { getSchemeEnrollments } from '@/services/schemeService';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { selectIsAuthenticated } from '@/store/slices/authSlice';
import { selectActiveStoreId } from '@/store/slices/storeSlice';

export function useSchemeEnrollments({ partyId } = {}) {
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const storeId         = useSelector(selectActiveStoreId);

  const params = { storeId, partyId };

  return useQuery({
    queryKey: partyId
      ? QUERY_KEYS.SCHEMES.CUSTOMER_ENROLLMENTS(partyId, storeId)
      : QUERY_KEYS.SCHEMES.ENROLLMENTS(params),

    queryFn: () => getSchemeEnrollments({
      take:       0,
      party_id:   partyId,
      company_id: storeId,
    }),

    enabled:   !!isAuthenticated && !!storeId,
    staleTime: 5 * 60 * 1000,

    select: (data) => {
      const raw = Array.isArray(data) ? data : (data?.Entities ?? []);
      return raw.map(normalizeEnrollment);
    },
  });
}

function normalizeEnrollment(raw) {
  const monthlyDetails = raw.scheme_monthly_details ?? [];
  const investedFromMonths = monthlyDetails
    .filter((m) => m.payment_made)
    .reduce((sum, m) => sum + (Number(m.month_amount) || 0), 0);
  const isCancelled = raw.scheme_status === 0;
  const isMatured   = raw.scheme_status === 2;
  const isRedeemed  = raw.scheme_status === 3;
  const hasPendingInstallment = monthlyDetails.length > 0
    ? monthlyDetails.some((m) => !m.payment_made)
    : true; // no monthly schedule loaded yet — don't block payment on that
  const isFullyPaid = monthlyDetails.length > 0 && !hasPendingInstallment;

  return {
    enrollmentId:      raw.scheme_enrollment_id,
    partyId:           raw.party_id,
    partyName:         raw.party_name   ?? '',
    mobile:            raw.mobile       ?? '',
    email:             raw.email        ?? '',
    schemeId:          raw.scheme_id,
    schemeName:        raw.scheme_display_name ?? raw.scheme_code ?? '',
    schemeCode:        raw.scheme_code  ?? '',
    schemeType:        raw.scheme_type,
    schemeUniqueCode:  raw.scheme_unique_code ?? '',
    status:            isCancelled ? 'cancelled' : isRedeemed ? 'redeemed' : isMatured ? 'matured' : (isFullyPaid ? 'completed' : 'active'),
    hasPendingInstallment,
    documentDate:      raw.document_date,
    schemeAmount:      raw.scheme_amount    ?? 0,
    tenure:            raw.tenure           ?? 0,
    investedAmount:    raw.invested_amount  ?? investedFromMonths,
    benefitAmount:     raw.benifit_amount   ?? 0,
    totalPayable:      raw.total_amount ?? raw.total_payable ?? 0,
    maturityYear:      raw.maturity_year,
    maturityMonth:     raw.maturity_month,
    raw,
  };
}
