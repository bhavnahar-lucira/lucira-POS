import { useQuery } from '@tanstack/react-query';
import { getPartyReceipts, getPartyDailyCash } from '@/services/orderService';
import { QUERY_KEYS } from '@/constants/queryKeys';
import APP_CONFIG from '@/constants/appConfig';

const { DOCUMENT_TYPES } = APP_CONFIG;
const BUCKET_BY_DOCUMENT_ID = {
  [DOCUMENT_TYPES.RETURN]:         'creditNote',
  [DOCUMENT_TYPES.CREDIT_NOTE]:    'creditNote',
  [DOCUMENT_TYPES.EXCHANGE]:       'exchange',
  [DOCUMENT_TYPES.URD_PURCHASE]:   'oldGold',
  [DOCUMENT_TYPES.SCHEME_ENROLLMENT]: 'scheme',
  [DOCUMENT_TYPES.POS_ORDER]:      'advances',
  [DOCUMENT_TYPES.POS_INVOICE]:    'advances',
  [DOCUMENT_TYPES.POS_RECEIPT]:    'advances',
};

const BUCKET_KEYS = ['creditNote', 'exchange', 'oldGold', 'scheme', 'advances', 'other'];
const EMPTY_BUCKETS = Object.fromEntries(BUCKET_KEYS.map((k) => [k, []]));

function bucketReceipts(rows) {
  const buckets = Object.fromEntries(BUCKET_KEYS.map((k) => [k, []]));
  for (const row of rows) {
    const bucket = BUCKET_BY_DOCUMENT_ID[row.document_id] ?? 'other';
    buckets[bucket].push(row);
  }
  return buckets;
}

function sumBalance(rows) {
  return rows.reduce((sum, r) => sum + (Number(r.balance_amount) || 0), 0);
}

/**
 * @param {{ partyId: number|null, companyId: number|null }} params
 */
export function useInvoiceHelpers({ partyId, companyId }) {
  const enabled = !!partyId && !!companyId;

  const receiptsQuery = useQuery({
    queryKey:  QUERY_KEYS.INVOICE_HELPERS.RECEIPTS(partyId),
    queryFn:   () => getPartyReceipts({ party_id: partyId }),
    enabled:   !!partyId,
    staleTime: APP_CONFIG.STALE_TIME.CUSTOMER,
    retry:     false,
  });

  const dailyCash = useQuery({
    queryKey:  QUERY_KEYS.INVOICE_HELPERS.PARTY_DAILY_CASH(partyId, companyId),
    queryFn:   () => getPartyDailyCash({ party_id: partyId, company_id: companyId }),
    enabled,
    staleTime: APP_CONFIG.STALE_TIME.CUSTOMER,
    retry:     false,
  });

  const buckets = receiptsQuery.data ? bucketReceipts(receiptsQuery.data) : EMPTY_BUCKETS;

  function bucketResult(key) {
    return {
      amount:    sumBalance(buckets[key]),
      rows:      buckets[key], // underlying receipts — see NOTE above before wiring "apply" to these
      isLoading: receiptsQuery.isLoading,
      isError:   receiptsQuery.isError,
    };
  }
  
  function extractAmount(queryResult) {
    const d = queryResult.data;
    if (!d) return 0;
    return d?.amount ?? d?.balance ?? d?.available_amount ?? d?.Entity?.amount ?? 0;
  }

  return {
    advances:   bucketResult('advances'),
    creditNote: bucketResult('creditNote'),
    exchange:   bucketResult('exchange'),
    oldGold:    bucketResult('oldGold'),
    scheme:     bucketResult('scheme'),
    other:      bucketResult('other'),
    dailyCash:  { amount: extractAmount(dailyCash), isLoading: dailyCash.isLoading, isError: dailyCash.isError },

    // True when any helper has a non-zero available amount
    hasAnyBalance: BUCKET_KEYS.some((key) => sumBalance(buckets[key]) > 0),

    isLoading: receiptsQuery.isLoading || dailyCash.isLoading,
  };
}
