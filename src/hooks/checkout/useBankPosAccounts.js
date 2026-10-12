import { useQuery } from '@tanstack/react-query';
import { getBankPosAccounts } from '@/services/settingsService';
import { QUERY_KEYS } from '@/constants/queryKeys';

function normalizeAccount(entity) {
  return {
    id:       entity.id,
    code:     entity.code ?? null,
    name:     entity.name && entity.name !== 'NA' ? entity.name : entity.code ?? 'Unknown',
    ledgerId: entity.ledger_id ?? null,
    raw:      entity,
  };
}

export function useBankPosAccounts() {
  const query = useQuery({
    queryKey: QUERY_KEYS.SETTINGS.BANK_POS_ACCOUNTS(),
    queryFn:  async () => {
      const data     = await getBankPosAccounts();
      const entities = data?.Entities ?? [];
      return entities.map(normalizeAccount);
    },
    // Checkout data must always reflect live state — see
    // useCheckoutPricing/useActivePromotions/useRetrieveCustomer.
    staleTime: 0,
  });

  return {
    bankPosAccounts: query.data ?? [],
    isLoading:       query.isLoading,
    isError:         query.isError,
    refetch:         query.refetch,
  };
}
