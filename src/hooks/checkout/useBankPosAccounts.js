import { useQuery } from '@tanstack/react-query';
import { getBankPosAccounts } from '@/services/settingsService';
import { QUERY_KEYS } from '@/constants/queryKeys';
import APP_CONFIG from '@/constants/appConfig';

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
    staleTime: APP_CONFIG.STALE_TIME.STATIC,
  });

  return {
    bankPosAccounts: query.data ?? [],
    isLoading:       query.isLoading,
    isError:         query.isError,
    refetch:         query.refetch,
  };
}
