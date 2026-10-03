// Mutation hooks for all 6 POS transaction types.
//
// Standard flow (Returns, Credit Notes, Exchange, Buyback, URD):
//   useCreate[Type] -> useMutation calling service.create[Type], returns { EntityId }
//   usePost[Type]   -> commits the draft via service.post[Type](EntityId)
//   useCancel[Type] -> voids the draft via service.cancel[Type](EntityId)
//
// Refund flow is different (no Post step): useCreateRefund is one call that
// settles credit raised by a Return/Exchange/Buyback (detail + receipt rows
// nest into it — see refundService); useDeleteRefund voids it.
//
// Every onSuccess invalidates the matching LIST query key (prefix only, to
// bust all pages). Every onError toasts via getErrorMessage(), which prefers
// the server's own reason and falls back to a per-type TOAST.*_FAILED
// message; the raw error is also returned for field-level handling.
//
// Every mutation also fires tracker.track() (see events.js) with
// customer_id/store_id from the live session on every event, and — on
// CREATE only — party_id, net_amount, pieces, weight, net_weight and line
// item count read from the create payload itself.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast }                       from 'sonner';
import {
  createReturn,    postReturn,    cancelReturn,
  deleteRefund,
  createCreditNote, postCreditNote, cancelCreditNote,
  createExchange,  postExchange,  cancelExchange,
  createBuyback,   postBuyback,   cancelBuyback,
  createURDPurchase, postURDPurchase, cancelURDPurchase,
}                                      from '@/services/transactionService';
// createRefund lives in its own service — a refund settles credit raised by
// a Return/Exchange/Buy Back and has no line items of its own.
import { createRefund }                from '@/services/refundService';
import { useSessionTrackingContext }   from '@/hooks/analytics/useSessionTrackingContext';
import TOAST                           from '@/constants/toastMessages';
import tracker                         from '@/lib/analytics/tracker';
import EVENTS                          from '@/lib/analytics/events';

function getErrorMessage(error, fallback = 'Something went wrong.') {
  return (
    error?.response?.data?.Message ??
    error?.response?.data?.message ??
    error?.message ??
    fallback
  );
}

// `payload` is the exact object passed to createX.mutate()/mutateAsync() —
// the same Entity fields buildTransactionHeaderFields() produced, spread
// with line_items — so nothing here is re-derived, only read back.
function creationDetails(payload) {
  return {
    party_id:        payload?.party_id,
    net_amount:      payload?.net_amount,
    pieces:          payload?.pieces,
    weight:          payload?.weight,
    net_weight:      payload?.net_weight,
    line_item_count: Array.isArray(payload?.line_items) ? payload.line_items.length : undefined,
    document_date:   payload?.document_date,
  };
}

export function useCreateReturn({ onSuccess } = {}) {
  const queryClient = useQueryClient();
  const sessionCtx = useSessionTrackingContext();

  return useMutation({
    mutationFn: (payload) => createReturn(payload),
    onSuccess: (data, payload) => {
      queryClient.invalidateQueries({ queryKey: ['returns'] });
      toast.success(TOAST.RETURNS.CREATED);
      tracker.track(EVENTS.RETURN_CREATED, {
        transactionId: data?.EntityId, ...sessionCtx, ...creationDetails(payload),
      });
      onSuccess?.(data);
    },
    onError: (error, payload) => {
      const message = getErrorMessage(error, TOAST.RETURNS.CREATE_FAILED);
      toast.error(message);
      tracker.track(EVENTS.RETURN_FAILED, {
        stage: 'create', error: message, ...sessionCtx, ...creationDetails(payload),
      });
    },
  });
}

export function usePostReturn({ onSuccess } = {}) {
  const queryClient = useQueryClient();
  const sessionCtx = useSessionTrackingContext();

  return useMutation({
    mutationFn: (transactionId) => postReturn(transactionId),
    onSuccess: (data, transactionId) => {
      queryClient.invalidateQueries({ queryKey: ['returns'] });
      toast.success(TOAST.RETURNS.POST_SUCCESS);
      tracker.track(EVENTS.RETURN_POSTED, { transactionId, ...sessionCtx });
      onSuccess?.(data);
    },
    onError: (error, transactionId) => {
      const message = getErrorMessage(error, TOAST.RETURNS.POST_FAILED);
      toast.error(message);
      tracker.track(EVENTS.RETURN_FAILED, { stage: 'post', transactionId, error: message, ...sessionCtx });
    },
  });
}

export function useCancelReturn({ onSuccess } = {}) {
  const queryClient = useQueryClient();
  const sessionCtx = useSessionTrackingContext();

  return useMutation({
    mutationFn: (transactionId) => cancelReturn(transactionId),
    onSuccess: (data, transactionId) => {
      queryClient.invalidateQueries({ queryKey: ['returns'] });
      toast.success(TOAST.RETURNS.CANCELLED);
      tracker.track(EVENTS.RETURN_CANCELLED, { transactionId, ...sessionCtx });
      onSuccess?.(data);
    },
    onError: (error, transactionId) => {
      const message = getErrorMessage(error, TOAST.RETURNS.CANCEL_FAILED);
      toast.error(message);
      tracker.track(EVENTS.RETURN_FAILED, { stage: 'cancel', transactionId, error: message, ...sessionCtx });
    },
  });
}

export function useCreateRefund({ onSuccess } = {}) {
  const queryClient = useQueryClient();
  const sessionCtx = useSessionTrackingContext();

  return useMutation({
    mutationFn: (payload) => createRefund(payload),
    onSuccess: (data, payload) => {
      queryClient.invalidateQueries({ queryKey: ['refunds'] });
      toast.success(TOAST.REFUNDS.CREATED);
      // Refund has no line_items of its own — party_id/amount/credits
      // settled stand in for it, read off the createRefund() payload.
      tracker.track(EVENTS.REFUND_CREATED, {
        transactionId:   data?.EntityId,
        ...sessionCtx,
        party_id:        payload?.partyId,
        payout_amount:   payload?.payout?.amount,
        payout_mode_code: payload?.payout?.modeCode,
        credits_settled_count: Array.isArray(payload?.credits) ? payload.credits.length : undefined,
        credits_settled_total: Array.isArray(payload?.credits)
          ? +payload.credits.reduce((s, c) => s + (c.amount ?? 0), 0).toFixed(2)
          : undefined,
      });
      onSuccess?.(data);
    },
    onError: (error, payload) => {
      const message = getErrorMessage(error, TOAST.REFUNDS.CREATE_FAILED);
      toast.error(message);
      tracker.track(EVENTS.REFUND_FAILED, {
        stage: 'create', error: message, ...sessionCtx, party_id: payload?.partyId,
      });
    },
  });
}

export function useDeleteRefund({ onSuccess } = {}) {
  const queryClient = useQueryClient();
  const sessionCtx = useSessionTrackingContext();

  return useMutation({
    mutationFn: (transactionId) => deleteRefund(transactionId),
    onSuccess: (data, transactionId) => {
      queryClient.invalidateQueries({ queryKey: ['refunds'] });
      toast.success(TOAST.REFUNDS.DELETED);
      tracker.track(EVENTS.REFUND_DELETED, { transactionId, ...sessionCtx });
      onSuccess?.(data);
    },
    onError: (error) => {
      // No REFUNDS.DELETE_FAILED constant exists — falls back to the generic default.
      const message = getErrorMessage(error);
      toast.error(message);
      tracker.track(EVENTS.REFUND_FAILED, { stage: 'delete', error: message, ...sessionCtx });
    },
  });
}

export function useCreateCreditNote({ onSuccess } = {}) {
  const queryClient = useQueryClient();
  const sessionCtx = useSessionTrackingContext();

  return useMutation({
    mutationFn: (payload) => createCreditNote(payload),
    onSuccess: (data, payload) => {
      queryClient.invalidateQueries({ queryKey: ['credit-notes'] });
      toast.success(TOAST.CREDIT_NOTES.CREATED);
      tracker.track(EVENTS.CREDIT_NOTE_CREATED, {
        transactionId: data?.EntityId, ...sessionCtx, ...creationDetails(payload),
      });
      onSuccess?.(data);
    },
    onError: (error, payload) => {
      const message = getErrorMessage(error, TOAST.CREDIT_NOTES.CREATE_FAILED);
      toast.error(message);
      tracker.track(EVENTS.CREDIT_NOTE_FAILED, {
        stage: 'create', error: message, ...sessionCtx, ...creationDetails(payload),
      });
    },
  });
}

export function usePostCreditNote({ onSuccess } = {}) {
  const queryClient = useQueryClient();
  const sessionCtx = useSessionTrackingContext();

  return useMutation({
    mutationFn: (transactionId) => postCreditNote(transactionId),
    onSuccess: (data, transactionId) => {
      queryClient.invalidateQueries({ queryKey: ['credit-notes'] });
      toast.success(TOAST.CREDIT_NOTES.POSTED);
      tracker.track(EVENTS.CREDIT_NOTE_POSTED, { transactionId, ...sessionCtx });
      onSuccess?.(data);
    },
    onError: (error, transactionId) => {
      const message = getErrorMessage(error, TOAST.CREDIT_NOTES.POST_FAILED);
      toast.error(message);
      tracker.track(EVENTS.CREDIT_NOTE_FAILED, { stage: 'post', transactionId, error: message, ...sessionCtx });
    },
  });
}

export function useCancelCreditNote({ onSuccess } = {}) {
  const queryClient = useQueryClient();
  const sessionCtx = useSessionTrackingContext();

  return useMutation({
    mutationFn: (transactionId) => cancelCreditNote(transactionId),
    onSuccess: (data, transactionId) => {
      queryClient.invalidateQueries({ queryKey: ['credit-notes'] });
      toast.success(TOAST.CREDIT_NOTES.CANCELLED);
      tracker.track(EVENTS.CREDIT_NOTE_CANCELLED, { transactionId, ...sessionCtx });
      onSuccess?.(data);
    },
    onError: (error, transactionId) => {
      const message = getErrorMessage(error, TOAST.CREDIT_NOTES.CANCEL_FAILED);
      toast.error(message);
      tracker.track(EVENTS.CREDIT_NOTE_FAILED, { stage: 'cancel', transactionId, error: message, ...sessionCtx });
    },
  });
}

export function useCreateExchange({ onSuccess } = {}) {
  const queryClient = useQueryClient();
  const sessionCtx = useSessionTrackingContext();

  return useMutation({
    mutationFn: (payload) => createExchange(payload),
    onSuccess: (data, payload) => {
      queryClient.invalidateQueries({ queryKey: ['exchange'] });
      toast.success(TOAST.EXCHANGE.CREATED);
      tracker.track(EVENTS.EXCHANGE_CREATED, {
        transactionId: data?.EntityId, ...sessionCtx, ...creationDetails(payload),
      });
      onSuccess?.(data);
    },
    onError: (error, payload) => {
      const message = getErrorMessage(error, TOAST.EXCHANGE.CREATE_FAILED);
      toast.error(message);
      tracker.track(EVENTS.EXCHANGE_FAILED, {
        stage: 'create', error: message, ...sessionCtx, ...creationDetails(payload),
      });
    },
  });
}

export function usePostExchange({ onSuccess } = {}) {
  const queryClient = useQueryClient();
  const sessionCtx = useSessionTrackingContext();

  return useMutation({
    mutationFn: (transactionId) => postExchange(transactionId),
    onSuccess: (data, transactionId) => {
      queryClient.invalidateQueries({ queryKey: ['exchange'] });
      toast.success(TOAST.EXCHANGE.POSTED);
      tracker.track(EVENTS.EXCHANGE_POSTED, { transactionId, ...sessionCtx });
      onSuccess?.(data);
    },
    onError: (error, transactionId) => {
      const message = getErrorMessage(error, TOAST.EXCHANGE.POST_FAILED);
      toast.error(message);
      tracker.track(EVENTS.EXCHANGE_FAILED, { stage: 'post', transactionId, error: message, ...sessionCtx });
    },
  });
}

export function useCancelExchange({ onSuccess } = {}) {
  const queryClient = useQueryClient();
  const sessionCtx = useSessionTrackingContext();

  return useMutation({
    mutationFn: (transactionId) => cancelExchange(transactionId),
    onSuccess: (data, transactionId) => {
      queryClient.invalidateQueries({ queryKey: ['exchange'] });
      toast.success(TOAST.EXCHANGE.CANCELLED);
      tracker.track(EVENTS.EXCHANGE_CANCELLED, { transactionId, ...sessionCtx });
      onSuccess?.(data);
    },
    onError: (error, transactionId) => {
      const message = getErrorMessage(error, TOAST.EXCHANGE.CANCEL_FAILED);
      toast.error(message);
      tracker.track(EVENTS.EXCHANGE_FAILED, { stage: 'cancel', transactionId, error: message, ...sessionCtx });
    },
  });
}

export function useCreateBuyback({ onSuccess } = {}) {
  const queryClient = useQueryClient();
  const sessionCtx = useSessionTrackingContext();

  return useMutation({
    mutationFn: (payload) => createBuyback(payload),
    onSuccess: (data, payload) => {
      queryClient.invalidateQueries({ queryKey: ['buyback'] });
      toast.success(TOAST.BUYBACK.CREATED);
      tracker.track(EVENTS.BUYBACK_CREATED, {
        transactionId: data?.EntityId, ...sessionCtx, ...creationDetails(payload),
      });
      onSuccess?.(data);
    },
    onError: (error, payload) => {
      const message = getErrorMessage(error, TOAST.BUYBACK.CREATE_FAILED);
      toast.error(message);
      tracker.track(EVENTS.BUYBACK_FAILED, {
        stage: 'create', error: message, ...sessionCtx, ...creationDetails(payload),
      });
    },
  });
}

export function usePostBuyback({ onSuccess } = {}) {
  const queryClient = useQueryClient();
  const sessionCtx = useSessionTrackingContext();

  return useMutation({
    mutationFn: (transactionId) => postBuyback(transactionId),
    onSuccess: (data, transactionId) => {
      queryClient.invalidateQueries({ queryKey: ['buyback'] });
      toast.success(TOAST.BUYBACK.POSTED);
      tracker.track(EVENTS.BUYBACK_POSTED, { transactionId, ...sessionCtx });
      onSuccess?.(data);
    },
    onError: (error, transactionId) => {
      const message = getErrorMessage(error, TOAST.BUYBACK.POST_FAILED);
      toast.error(message);
      tracker.track(EVENTS.BUYBACK_FAILED, { stage: 'post', transactionId, error: message, ...sessionCtx });
    },
  });
}

export function useCancelBuyback({ onSuccess } = {}) {
  const queryClient = useQueryClient();
  const sessionCtx = useSessionTrackingContext();

  return useMutation({
    mutationFn: (transactionId) => cancelBuyback(transactionId),
    onSuccess: (data, transactionId) => {
      queryClient.invalidateQueries({ queryKey: ['buyback'] });
      toast.success(TOAST.BUYBACK.CANCELLED);
      tracker.track(EVENTS.BUYBACK_CANCELLED, { transactionId, ...sessionCtx });
      onSuccess?.(data);
    },
    onError: (error, transactionId) => {
      const message = getErrorMessage(error, TOAST.BUYBACK.CANCEL_FAILED);
      toast.error(message);
      tracker.track(EVENTS.BUYBACK_FAILED, { stage: 'cancel', transactionId, error: message, ...sessionCtx });
    },
  });
}

export function useCreateURDPurchase({ onSuccess } = {}) {
  const queryClient = useQueryClient();
  const sessionCtx = useSessionTrackingContext();

  return useMutation({
    mutationFn: (payload) => createURDPurchase(payload),
    onSuccess: (data, payload) => {
      queryClient.invalidateQueries({ queryKey: ['urd-purchase'] });
      toast.success(TOAST.URD_PURCHASE.CREATED);
      tracker.track(EVENTS.URD_PURCHASE_CREATED, {
        transactionId: data?.EntityId, ...sessionCtx, ...creationDetails(payload),
      });
      onSuccess?.(data);
    },
    onError: (error, payload) => {
      const message = getErrorMessage(error, TOAST.URD_PURCHASE.CREATE_FAILED);
      toast.error(message);
      tracker.track(EVENTS.URD_PURCHASE_FAILED, {
        stage: 'create', error: message, ...sessionCtx, ...creationDetails(payload),
      });
    },
  });
}

export function usePostURDPurchase({ onSuccess } = {}) {
  const queryClient = useQueryClient();
  const sessionCtx = useSessionTrackingContext();

  return useMutation({
    mutationFn: (transactionId) => postURDPurchase(transactionId),
    onSuccess: (data, transactionId) => {
      queryClient.invalidateQueries({ queryKey: ['urd-purchase'] });
      toast.success(TOAST.URD_PURCHASE.POSTED);
      tracker.track(EVENTS.URD_PURCHASE_POSTED, { transactionId, ...sessionCtx });
      onSuccess?.(data);
    },
    onError: (error, transactionId) => {
      const message = getErrorMessage(error, TOAST.URD_PURCHASE.POST_FAILED);
      toast.error(message);
      tracker.track(EVENTS.URD_PURCHASE_FAILED, { stage: 'post', transactionId, error: message, ...sessionCtx });
    },
  });
}

export function useCancelURDPurchase({ onSuccess } = {}) {
  const queryClient = useQueryClient();
  const sessionCtx = useSessionTrackingContext();

  return useMutation({
    mutationFn: (transactionId) => cancelURDPurchase(transactionId),
    onSuccess: (data, transactionId) => {
      queryClient.invalidateQueries({ queryKey: ['urd-purchase'] });
      toast.success(TOAST.URD_PURCHASE.CANCELLED);
      tracker.track(EVENTS.URD_PURCHASE_CANCELLED, { transactionId, ...sessionCtx });
      onSuccess?.(data);
    },
    onError: (error, transactionId) => {
      const message = getErrorMessage(error, TOAST.URD_PURCHASE.CANCEL_FAILED);
      toast.error(message);
      tracker.track(EVENTS.URD_PURCHASE_FAILED, { stage: 'cancel', transactionId, error: message, ...sessionCtx });
    },
  });
}
