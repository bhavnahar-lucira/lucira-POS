import { useQuery } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import {
  getFinancialYears,
  resolveCurrentFinancialYear,
  getDocumentNumberingList,
  resolveDocumentConfig,
} from '@/services/documentConfigService';
import { selectActiveStoreId, selectActiveStoreCode } from '@/store/slices/storeSlice';
import { QUERY_KEYS } from '@/constants/queryKeys';
import APP_CONFIG from '@/constants/appConfig';

/**
 * @param {number} documentId — the document TYPE constant for this flow
 *   (e.g. 54 = POS Invoice, 53 = POS Order — see DocumentNumbering rows).
 */
export function useOrderHeaderConfig(documentId) {
  const companyId = useSelector(selectActiveStoreId);
  const storeCode = useSelector(selectActiveStoreCode);

  const finYearQuery = useQuery({
    queryKey: QUERY_KEYS.DOCUMENT_CONFIG.FINANCIAL_YEARS(),
    queryFn:  getFinancialYears,
    staleTime: APP_CONFIG.STALE_TIME.STATIC,
  });

  const docNumQuery = useQuery({
    queryKey: QUERY_KEYS.DOCUMENT_CONFIG.DOCUMENT_NUMBERING(),
    queryFn:  getDocumentNumberingList,
    staleTime: APP_CONFIG.STALE_TIME.STATIC,
  });

  const now = new Date();

  const currentFinancialYear = finYearQuery.data
    ? resolveCurrentFinancialYear(finYearQuery.data, now)
    : null;

  const docConfig = (docNumQuery.data && companyId)
    ? resolveDocumentConfig(docNumQuery.data, documentId, companyId, now)
    : null;
  const isConfigMissing = !!(
    docNumQuery.data && companyId && !docConfig &&
    !docNumQuery.data.some((r) => r.document_id === documentId && r.company_id === companyId)
  );

  return {
    financialYearId:        currentFinancialYear?.financial_year_id ?? null,
    ledgerId:                docConfig?.ledger_id ?? null,
    isTaxApplicable:         docConfig?.is_tax_applicable ?? true,
    autoPosting:             docConfig?.auto_posting ?? true,
    isDocumentNumberEditable:docConfig?.is_document_number_editable ?? false,
    payableLedgerId:         docConfig?.payable_ledger_id ?? null,
    receivableLedgerId:      docConfig?.receivable_ledger_id ?? null,
    numberOfBackdatedDays:   docConfig?.number_of_backdated_days ?? null,
    isLoading: finYearQuery.isLoading || docNumQuery.isLoading,
    isReady:   !!currentFinancialYear && !!docConfig,
    isError: finYearQuery.isError || docNumQuery.isError,
    isConfigMissing,
    refetch: () => {
      finYearQuery.refetch();
      docNumQuery.refetch();
    },
  };
}
