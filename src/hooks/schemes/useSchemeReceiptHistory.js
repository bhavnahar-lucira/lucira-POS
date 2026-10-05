import { useQuery } from '@tanstack/react-query';
import { getSchemeReceipts } from '@/services/schemeService';
import { QUERY_KEYS } from '@/constants/queryKeys';

function normalizeReceipt(raw) {
  const details  = raw.scheme_receipt_details ?? [];
  const modeName = details.map((d) => d.mode_name).filter(Boolean).join(', ') || null;

  return {
    id:           raw.scheme_payment_id,
    documentNo:   raw.document_no ?? null,
    documentDate: raw.document_date ?? null,
    amount:       raw.amount ?? 0,
    modeName,
    raw,
  };
}

/**
 * @param {number|null} enrollmentId — scheme_enrollment_id, or null/undefined to disable.
 */
export function useSchemeReceiptHistory(enrollmentId) {
  return useQuery({
    queryKey: QUERY_KEYS.SCHEMES.RECEIPT_LIST(enrollmentId),
    queryFn: async () => {
      const data = await getSchemeReceipts({ scheme_enrollment_id: enrollmentId });
      const rows = data?.Entities ?? [];
      return rows
        .map(normalizeReceipt)
        .sort((a, b) => new Date(b.documentDate ?? 0) - new Date(a.documentDate ?? 0));
    },
    enabled: !!enrollmentId,
  });
}
