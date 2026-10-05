import { useQuery } from '@tanstack/react-query';
import axiosInstance from '@/lib/axios/axiosInstance';
import API from '@/constants/apiEndpoints';
import { QUERY_KEYS } from '@/constants/queryKeys';
import APP_CONFIG from '@/constants/appConfig';

export function useCustomer360(customerId, { enabled = true } = {}) {
  const query = useQuery({
    queryKey: QUERY_KEYS.CUSTOMER_360.ALL(customerId),
    queryFn: async () => {
      const [partyRes, txRes, insightsRes] = await Promise.all([
        axiosInstance.post(API.PARTY.RETRIEVE, { EntityId: customerId }),
        axiosInstance.post(API.CUSTOMER_HISTORY.PARTY_TRANSACTIONS, { party_id: customerId }),
        axiosInstance.post(API.CUSTOMER_HISTORY.SALES_INSIGHTS, { party_id: customerId }),
      ]);

      const party = partyRes?.data?.Entity ?? null;
      const tx = txRes?.data ?? {};
      const insights = insightsRes?.data?.Entities ?? [];
      const creditBalance = tx.credit_balance ?? 0;
      const exchangeTotal = tx.exchange_total ?? 0;
      const buybackTotal = tx.buyback_total ?? 0;
      const invoiceTotal = (tx.invoice_total ?? 0) - exchangeTotal - buybackTotal;

      return {
        party,
        insights,
        documents: {
          invoice:  tx.Invoices  ?? [],
          order:    tx.Orders    ?? [],
          return:   tx.Returns   ?? [],
          exchange: tx.Exchanges ?? [],
          urd:      tx.URDs      ?? [],
          buyback:  tx.BuyBacks  ?? [],
          receipt:  tx.Receipts  ?? [],
        },
        totals: {
          invoiceTotal,
          buybackTotal,
          exchangeTotal,
          creditBalance,
        },
      };
    },
    enabled:   enabled && !!customerId,
    staleTime: APP_CONFIG.STALE_TIME.CUSTOMER,
  });

  const data = query.data;

  return {
    party:        data?.party ?? null,
    insights:     data?.insights ?? [],
    documents:    data?.documents ?? {
      invoice: [], order: [], return: [], exchange: [], urd: [], buyback: [], receipt: [],
    },
    totals: data?.totals ?? {
      invoiceTotal: 0, buybackTotal: 0, exchangeTotal: 0, creditBalance: 0,
    },

    isLoading:  query.isLoading,
    isFetching: query.isFetching,
    isError:    query.isError,
    refetch:    query.refetch,
  };
}
