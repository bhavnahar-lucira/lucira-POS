import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { toast } from 'sonner';
import {
  createInterstoreReturn,
  submitInterstoreReturnForApproval,
  approveInterstoreReturn,
  rejectInterstoreReturn,
  resubmitInterstoreReturn,
  returnInterstoreReturnToOrigin,
  localAbsorbInterstoreReturn,
  withCompany,
} from '@/services/interstoreReturnService';
import { selectActiveStoreId } from '@/store/slices/storeSlice';
import TOAST from '@/constants/toastMessages';

function getErrorMessage(error, fallback = 'Something went wrong.') {
  return (
    error?.response?.data?.Message ??
    error?.response?.data?.message ??
    error?.message ??
    fallback
  );
}

function invalidateIRR(queryClient) {
  queryClient.invalidateQueries({ queryKey: ['interstore-return'] });
}

export function useCreateInterstoreReturn({ onSuccess } = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) => createInterstoreReturn(payload),
    onSuccess: (data) => {
      invalidateIRR(queryClient);
      toast.success(TOAST.INTERSTORE_RETURN.CREATED);
      onSuccess?.(data);
    },
    onError: (error) => toast.error(getErrorMessage(error, TOAST.INTERSTORE_RETURN.CREATE_FAILED)),
  });
}

export function useInterstoreReturnLifecycleActions({ onSuccess } = {}) {
  const queryClient = useQueryClient();
  const myStoreId = useSelector(selectActiveStoreId);

  const useLifecycleAction = (fn, { successMsg, failMsg }) =>
    useMutation({
      mutationFn: ({ entity, requiredCompanyId }) =>
        withCompany(requiredCompanyId, myStoreId, () => fn(entity.interstore_return_id)),
      onSuccess: (data) => {
        invalidateIRR(queryClient);
        toast.success(successMsg);
        onSuccess?.(data);
      },
      onError: (error) => toast.error(getErrorMessage(error, failMsg)),
    });

  const submitForApproval = useLifecycleAction(submitInterstoreReturnForApproval, {
    successMsg: TOAST.INTERSTORE_RETURN.SUBMITTED,
    failMsg: TOAST.INTERSTORE_RETURN.SUBMIT_FAILED,
  });
  const approve = useLifecycleAction(approveInterstoreReturn, {
    successMsg: TOAST.INTERSTORE_RETURN.APPROVED,
    failMsg: TOAST.INTERSTORE_RETURN.APPROVE_FAILED,
  });
  const resubmit = useLifecycleAction(resubmitInterstoreReturn, {
    successMsg: TOAST.INTERSTORE_RETURN.RESUBMITTED,
    failMsg: TOAST.INTERSTORE_RETURN.RESUBMIT_FAILED,
  });
  const returnToOrigin = useLifecycleAction(returnInterstoreReturnToOrigin, {
    successMsg: TOAST.INTERSTORE_RETURN.RETURNED_TO_ORIGIN,
    failMsg: TOAST.INTERSTORE_RETURN.RETURN_TO_ORIGIN_FAILED,
  });
  const localAbsorption = useLifecycleAction(localAbsorbInterstoreReturn, {
    successMsg: TOAST.INTERSTORE_RETURN.LOCALLY_ABSORBED,
    failMsg: TOAST.INTERSTORE_RETURN.LOCAL_ABSORPTION_FAILED,
  });

  // Reject carries extra fields, so it isn't shaped like the others.
  const reject = useMutation({
    mutationFn: ({ entity, requiredCompanyId, rejectionReasonId, rejectionNote }) =>
      withCompany(requiredCompanyId, myStoreId, () =>
        rejectInterstoreReturn(entity.interstore_return_id, { rejectionReasonId, rejectionNote })),
    onSuccess: (data) => {
      invalidateIRR(queryClient);
      toast.success(TOAST.INTERSTORE_RETURN.REJECTED);
      onSuccess?.(data);
    },
    onError: (error) => toast.error(getErrorMessage(error, TOAST.INTERSTORE_RETURN.REJECT_FAILED)),
  });

  return { submitForApproval, approve, reject, resubmit, returnToOrigin, localAbsorption };
}
