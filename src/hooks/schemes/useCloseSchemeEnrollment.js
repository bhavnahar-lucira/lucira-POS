import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { closeSchemeEnrollment } from '@/services/schemeService';
import TOAST from '@/constants/toastMessages';

export function useCloseSchemeEnrollment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: closeSchemeEnrollment,

    onSuccess: () => {
      toast.success(TOAST.SCHEMES.CLOSURE_RECORDED);
      queryClient.invalidateQueries({ queryKey: ['schemes'] });
    },

    onError: () => {
      toast.error(TOAST.SCHEMES.CLOSURE_FAILED);
    },
  });
}
