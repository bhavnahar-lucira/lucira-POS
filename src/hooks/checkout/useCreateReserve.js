import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { toast } from 'sonner';
import { createReserve, postReserve } from '@/services/reserveService';
import { buildInvoiceEntity } from '@/hooks/checkout/useCreateInvoice';
import { useCustomerSession } from '@/hooks/customer/useCustomerSession';
import { useExchangeRate } from '@/hooks/checkout/useExchangeRate';
import { useOrderHeaderConfig } from '@/hooks/checkout/useOrderHeaderConfig';
import { selectActiveStoreId } from '@/store/slices/storeSlice';
import APP_CONFIG from '@/constants/appConfig';

const RESERVE = APP_CONFIG.DOCUMENT_TYPES.RESERVE;
const JEWELLERY_BASE_ITEM = 11;

/** OrnaVerse's own Reserve rules (POSReserveTab completePosReserve). Returns the first broken rule, or null. */
export function reserveBlocker(lineItems, { customerId, hasPromos }) {
  if (!customerId) return 'Select a customer before reserving stock.';
  if (!lineItems?.length) return 'Reserve takes stock lines only.';
  if (hasPromos) return 'Offers can’t be applied to a reserve — remove them first.';
  if (lineItems.some((l) => l.base_item_id != null && Number(l.base_item_id) !== JEWELLERY_BASE_ITEM)) {
    return 'Reserve is only for jewellery. Stone, metal, and other materials cannot be reserved.';
  }
  if (lineItems.some((l) => !String(l.sku ?? '').trim())) return 'Jewellery reserve requires a SKU.';
  return null;
}

export function useCreateReserve() {
  const queryClient = useQueryClient();
  const { customerId, customerName, customerMobile } = useCustomerSession();
  const activeStoreId = useSelector(selectActiveStoreId);
  const { exchangeRate } = useExchangeRate();
  const headerConfig = useOrderHeaderConfig(RESERVE);

  const mutation = useMutation({
    mutationFn: async ({ paymentModes, narration, salesPersonId, pricedLineItems, panNumber }) => {
      if (!headerConfig.isReady) {
        if (headerConfig.isError) headerConfig.refetch();
        throw new Error(headerConfig.isConfigMissing
          ? 'Reserve document is not configured for this store.'
          : 'Store configuration is still loading — please try again in a moment');
      }
      const blocker = reserveBlocker(pricedLineItems, { customerId, hasPromos: false });
      if (blocker) throw new Error(blocker);

      const lineItems = pricedLineItems.map((row) => ({ ...row, sales_person_id: salesPersonId }));
      const { promotion_details: _omit, ...entity } = buildInvoiceEntity({
        lineItems, promotionDetails: [],
        customerId, customerName, customerMobile,
        activeStoreId, paymentModes, narration,
        salesPersonId, exchangeRate, headerConfig, panNumber,
        documentId: RESERVE,
      });
      entity.balance_amount = Math.max(0, entity.balance_amount);

      const created = await createReserve(entity);
      const transactionId = created?.EntityId;
      if (!transactionId) throw new Error('Reserve save failed.');
      if (!headerConfig.autoPosting) await postReserve(transactionId);
      return { transactionId, entity };
    },
    onSuccess: () => {
      toast.success('Stock reserved.');
      queryClient.invalidateQueries({ queryKey: ['reserves'] });
    },
    onError: (error) => {
      console.error('[useCreateReserve]', error);
      toast.error(error?.serverMessage ?? error?.message ?? 'Reserve save failed.');
    },
  });

  return { placeReserve: mutation.mutateAsync, isPlacingReserve: mutation.isPending };
}
