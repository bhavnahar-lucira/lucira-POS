import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { redeemSchemeEnrollment } from '@/services/schemeService';
import TOAST from '@/constants/toastMessages';

export function useRedeemSchemeEnrollment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: redeemSchemeEnrollment,

    onSuccess: () => {
      toast.success(TOAST.SCHEMES.REDEEMED);
      queryClient.invalidateQueries({ queryKey: ['schemes'] });
    },

    onError: () => {
      toast.error(TOAST.SCHEMES.REDEEM_FAILED);
    },
  });
}
