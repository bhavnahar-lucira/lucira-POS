// Interstore Return mutations: create + the 6 lifecycle actions. (Photo
// attach is a plain service call — addInterstoreReturnItemImage — not a
// mutation hook, since transfers/page.jsx fires one per line in parallel.)
// Store-role-gated actions (Approve/SubmitForApproval/Resubmit/
// ReturnToOrigin/LocalAbsorption) temporarily switch the OrnaVerse session
// to whichever company the action requires and always switch back — see
// interstoreReturnService.withCompany's own header for why.

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

/**
 * One hook exposing all 6 status-transition actions, each aware of which
 * side of the transfer (origin vs receiving) it requires and switching the
 * OrnaVerse session there and back around the call. `myStoreId` is read
 * from Redux once here rather than per-action, since it's the same
 * "restore to" target for all of them.
 */
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
