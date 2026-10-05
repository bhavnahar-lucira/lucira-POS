import { useQuery } from '@tanstack/react-query';
import { getPaymentModes } from '@/services/settingsService';
import { QUERY_KEYS } from '@/constants/queryKeys';
import APP_CONFIG from '@/constants/appConfig';

function normalizeMode(entity) {
  return {
    modeId:       entity.mode_id,
    modeCode:     entity.mode_code   ?? null,
    modeName:     entity.mode_name && entity.mode_name !== 'NA' ? entity.mode_name : 'Unknown',
    onlyForPos:   entity.only_for_pos  ?? false,
    allowSelection:entity.allow_selection ?? true,
    isPosMachine: entity.is_pos_machine  ?? false,  // bank POS terminal
    isDisabled:   entity.is_disabled     ?? false,
    modeSubType:  entity.mode_sub_type ?? null,
    modeType:     entity.mode_type ?? null,
    ledgerId:     entity.ledger_id ?? null,
    raw:          entity,
  };
}

function isPosPaymentMode(mode) {
  if (mode.isDisabled) return false;
  if (mode.modeSubType === 2 && mode.modeType !== APP_CONFIG.PAYMENT_MODES.LOYALTY_MODE_TYPE) return false;
  const { ALLOWLIST, DENYLIST } = APP_CONFIG.PAYMENT_MODES;
  if (DENYLIST.includes(mode.modeCode)) return false;
  return mode.onlyForPos === true || ALLOWLIST.includes(mode.modeCode);
}

export function usePaymentModes() {
  const query = useQuery({
    queryKey: QUERY_KEYS.SETTINGS.PAYMENT_MODES(),
    queryFn:  async () => {
      const data     = await getPaymentModes();
      const entities = data?.Entities ?? [];
      return entities.map(normalizeMode).filter(isPosPaymentMode);
    },
    staleTime: APP_CONFIG.STALE_TIME.STATIC,
  });

  return {
    paymentModes: query.data ?? [],
    isLoading:    query.isLoading,
    isError:      query.isError,
    refetch:      query.refetch,
  };
}