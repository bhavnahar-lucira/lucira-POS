import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  createEstimation, postEstimation, cancelEstimation,
} from '@/services/estimationService';
import { useSessionTrackingContext } from '@/hooks/analytics/useSessionTrackingContext';
import TOAST from '@/constants/toastMessages';
import tracker from '@/lib/analytics/tracker';
import EVENTS from '@/lib/analytics/events';

function getErrorMessage(error, fallback = 'Something went wrong.') {
  return (
    error?.response?.data?.Message ??
    error?.response?.data?.message ??
    error?.message ??
    fallback
  );
}

function creationDetails(payload) {
  return {
    party_id:        payload?.party_id,
    net_amount:      payload?.net_amount,
    pieces:          payload?.pieces,
    weight:          payload?.weight,
    line_item_count: Array.isArray(payload?.line_items) ? payload.line_items.length : undefined,
    document_date:   payload?.document_date,
  };
}

export function useCreateEstimation({ onSuccess } = {}) {
  const queryClient = useQueryClient();
  const sessionCtx = useSessionTrackingContext();
  return useMutation({
    mutationFn: (payload) => createEstimation(payload),
    onSuccess: (data, payload) => {
      queryClient.invalidateQueries({ queryKey: ['estimation'] });
      toast.success(TOAST.ESTIMATION.CREATED);
      tracker.track(EVENTS.ESTIMATION_CREATED, {
        transactionId: data?.EntityId, ...sessionCtx, ...creationDetails(payload),
      });
      onSuccess?.(data);
    },
    onError: (error, payload) => {
      const message = getErrorMessage(error, TOAST.ESTIMATION.CREATE_FAILED);
      toast.error(message);
      tracker.track(EVENTS.ESTIMATION_FAILED, {
        stage: 'create', error: message, ...sessionCtx, ...creationDetails(payload),
      });
    },
  });
}

export function usePostEstimation({ onSuccess } = {}) {
  const queryClient = useQueryClient();
  const sessionCtx = useSessionTrackingContext();
  return useMutation({
    mutationFn: (transactionId) => postEstimation(transactionId),
    onSuccess: (data, transactionId) => {
      queryClient.invalidateQueries({ queryKey: ['estimation'] });
      toast.success(TOAST.ESTIMATION.CONVERTED);
      tracker.track(EVENTS.ESTIMATION_POSTED, { transactionId, ...sessionCtx });
      onSuccess?.(data);
    },
    onError: (error, transactionId) => {
      const message = getErrorMessage(error, TOAST.ESTIMATION.CONVERT_FAILED);
      toast.error(message);
      tracker.track(EVENTS.ESTIMATION_FAILED, { stage: 'post', transactionId, error: message, ...sessionCtx });
    },
  });
}

export function useCancelEstimation({ onSuccess } = {}) {
  const queryClient = useQueryClient();
  const sessionCtx = useSessionTrackingContext();
  return useMutation({
    mutationFn: (transactionId) => cancelEstimation(transactionId),
    onSuccess: (data, transactionId) => {
      queryClient.invalidateQueries({ queryKey: ['estimation'] });
      toast.success(TOAST.ESTIMATION.CANCELLED);
      tracker.track(EVENTS.ESTIMATION_CANCELLED, { transactionId, ...sessionCtx });
      onSuccess?.(data);
    },
    onError: (error, transactionId) => {
      const message = getErrorMessage(error, TOAST.ESTIMATION.CANCEL_FAILED);
      toast.error(message);
      tracker.track(EVENTS.ESTIMATION_FAILED, { stage: 'cancel', transactionId, error: message, ...sessionCtx });
    },
  });
}
