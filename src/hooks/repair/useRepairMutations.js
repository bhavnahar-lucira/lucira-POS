// Mutation hooks for the 3-stage repair workflow.
// Mirrors useTransactionMutations.js — same Create -> Post pattern, except
// RepairInvoice also gets a receipt step (like Invoice/InvoiceReceipt).
//
// Every mutation fires tracker.track() with customer_id/store_id
// (useSessionTrackingContext, session-derived since Post/Cancel only ever
// receive a bare transactionId), and every CREATE additionally carries
// party_id/net_amount/pieces/weight/line_item_count off the same payload
// posted to OrnaVerse (creationDetails()) — see events.js.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  createRepairOrder,   postRepairOrder,
  createRepairIn,      postRepairIn,      cancelRepairIn,
  createRepairOut,     postRepairOut,
  createRepairInvoice, postRepairInvoice, createRepairInvoiceReceipt,
} from '@/services/repairService';
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

// `payload` here is the raw entity object each createX() call posts
// straight through to OrnaVerse, unmodified.
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

// ─── REPAIR ORDER (what the counter actually raises) ──────────────────────────
// OrnaVerse's own POS Repair tab creates a Repair Order (document 75) — its
// button reads "Save Repair Order". Repair In/Out are workshop-side documents
// raised later. See [[repair-flow-contract]].

export function useCreateRepairOrder({ onSuccess } = {}) {
  const queryClient = useQueryClient();
  const sessionCtx = useSessionTrackingContext();
  return useMutation({
    mutationFn: (payload) => createRepairOrder(payload),
    onSuccess: (data, payload) => {
      queryClient.invalidateQueries({ queryKey: ['repair', 'orders'] });
      toast.success(TOAST.REPAIR.INTAKE_CREATED);
      tracker.track(EVENTS.REPAIR_IN_CREATED, {
        transactionId: data?.EntityId, ...sessionCtx, ...creationDetails(payload),
      });
      onSuccess?.(data);
    },
    onError: (error, payload) => {
      const message = getErrorMessage(error, TOAST.REPAIR.INTAKE_FAILED);
      toast.error(message);
      tracker.track(EVENTS.REPAIR_IN_FAILED, {
        stage: 'create', error: message, ...sessionCtx, ...creationDetails(payload),
      });
    },
  });
}

export function usePostRepairOrder({ onSuccess } = {}) {
  const queryClient = useQueryClient();
  const sessionCtx = useSessionTrackingContext();
  return useMutation({
    mutationFn: (transactionId) => postRepairOrder(transactionId),
    onSuccess: (data, transactionId) => {
      queryClient.invalidateQueries({ queryKey: ['repair', 'orders'] });
      tracker.track(EVENTS.REPAIR_IN_POSTED, { transactionId, ...sessionCtx });
      onSuccess?.(data);
    },
    onError: (error, transactionId) => {
      const message = getErrorMessage(error, TOAST.REPAIR.INTAKE_POST_FAILED);
      toast.error(message);
      tracker.track(EVENTS.REPAIR_IN_FAILED, { stage: 'post', transactionId, error: message, ...sessionCtx });
    },
  });
}

export function useCreateRepairIn({ onSuccess } = {}) {
  const queryClient = useQueryClient();
  const sessionCtx = useSessionTrackingContext();
  return useMutation({
    mutationFn: (payload) => createRepairIn(payload),
    onSuccess: (data, payload) => {
      queryClient.invalidateQueries({ queryKey: ['repair', 'repair-ins'] });
      toast.success(TOAST.REPAIR.INTAKE_CREATED);
      tracker.track(EVENTS.REPAIR_IN_CREATED, {
        transactionId: data?.EntityId, ...sessionCtx, ...creationDetails(payload),
      });
      onSuccess?.(data);
    },
    onError: (error, payload) => {
      const message = getErrorMessage(error, TOAST.REPAIR.INTAKE_FAILED);
      toast.error(message);
      tracker.track(EVENTS.REPAIR_IN_FAILED, {
        stage: 'create', error: message, ...sessionCtx, ...creationDetails(payload),
      });
    },
  });
}

export function usePostRepairIn({ onSuccess } = {}) {
  const queryClient = useQueryClient();
  const sessionCtx = useSessionTrackingContext();
  return useMutation({
    mutationFn: (transactionId) => postRepairIn(transactionId),
    onSuccess: (data, transactionId) => {
      queryClient.invalidateQueries({ queryKey: ['repair', 'repair-ins'] });
      toast.success(TOAST.REPAIR.INTAKE_POSTED);
      tracker.track(EVENTS.REPAIR_IN_POSTED, { transactionId, ...sessionCtx });
      onSuccess?.(data);
    },
    onError: (error, transactionId) => {
      const message = getErrorMessage(error, TOAST.REPAIR.INTAKE_POST_FAILED);
      toast.error(message);
      tracker.track(EVENTS.REPAIR_IN_FAILED, { stage: 'post', transactionId, error: message, ...sessionCtx });
    },
  });
}

export function useCancelRepairIn({ onSuccess } = {}) {
  const queryClient = useQueryClient();
  const sessionCtx = useSessionTrackingContext();
  return useMutation({
    mutationFn: (transactionId) => cancelRepairIn(transactionId),
    onSuccess: (data, transactionId) => {
      queryClient.invalidateQueries({ queryKey: ['repair', 'repair-ins'] });
      tracker.track(EVENTS.REPAIR_IN_CANCELLED, { transactionId, ...sessionCtx });
      onSuccess?.(data);
    },
    onError: (error, transactionId) => {
      // No REPAIR.*_CANCEL_FAILED constant exists for repair-in — falls back to the generic default.
      const message = getErrorMessage(error);
      toast.error(message);
      tracker.track(EVENTS.REPAIR_IN_FAILED, { stage: 'cancel', transactionId, error: message, ...sessionCtx });
    },
  });
}

export function useCreateRepairOut({ onSuccess } = {}) {
  const queryClient = useQueryClient();
  const sessionCtx = useSessionTrackingContext();
  return useMutation({
    mutationFn: (payload) => createRepairOut(payload),
    onSuccess: (data, payload) => {
      queryClient.invalidateQueries({ queryKey: ['repair', 'repair-outs'] });
      toast.success(TOAST.REPAIR.OUT_CREATED);
      tracker.track(EVENTS.REPAIR_OUT_CREATED, {
        transactionId: data?.EntityId, ...sessionCtx, ...creationDetails(payload),
      });
      onSuccess?.(data);
    },
    onError: (error, payload) => {
      const message = getErrorMessage(error, TOAST.REPAIR.OUT_FAILED);
      toast.error(message);
      tracker.track(EVENTS.REPAIR_OUT_FAILED, {
        stage: 'create', error: message, ...sessionCtx, ...creationDetails(payload),
      });
    },
  });
}

export function usePostRepairOut({ onSuccess } = {}) {
  const queryClient = useQueryClient();
  const sessionCtx = useSessionTrackingContext();
  return useMutation({
    mutationFn: (transactionId) => postRepairOut(transactionId),
    onSuccess: (data, transactionId) => {
      queryClient.invalidateQueries({ queryKey: ['repair', 'repair-outs'] });
      toast.success(TOAST.REPAIR.OUT_POSTED);
      tracker.track(EVENTS.REPAIR_OUT_POSTED, { transactionId, ...sessionCtx });
      onSuccess?.(data);
    },
    onError: (error, transactionId) => {
      const message = getErrorMessage(error, TOAST.REPAIR.OUT_POST_FAILED);
      toast.error(message);
      tracker.track(EVENTS.REPAIR_OUT_FAILED, { stage: 'post', transactionId, error: message, ...sessionCtx });
    },
  });
}

export function useCreateRepairInvoice({ onSuccess } = {}) {
  const queryClient = useQueryClient();
  const sessionCtx = useSessionTrackingContext();
  return useMutation({
    mutationFn: (payload) => createRepairInvoice(payload),
    onSuccess: (data, payload) => {
      queryClient.invalidateQueries({ queryKey: ['repair', 'repair-invoices'] });
      toast.success(TOAST.REPAIR.INVOICE_CREATED);
      tracker.track(EVENTS.REPAIR_INVOICE_CREATED, {
        transactionId: data?.EntityId, ...sessionCtx, ...creationDetails(payload),
      });
      onSuccess?.(data);
    },
    onError: (error, payload) => {
      const message = getErrorMessage(error, TOAST.REPAIR.INVOICE_FAILED);
      toast.error(message);
      tracker.track(EVENTS.REPAIR_INVOICE_FAILED, {
        stage: 'create', error: message, ...sessionCtx, ...creationDetails(payload),
      });
    },
  });
}

export function usePostRepairInvoice({ onSuccess } = {}) {
  const queryClient = useQueryClient();
  const sessionCtx = useSessionTrackingContext();
  return useMutation({
    mutationFn: (transactionId) => postRepairInvoice(transactionId),
    onSuccess: (data, transactionId) => {
      queryClient.invalidateQueries({ queryKey: ['repair', 'repair-invoices'] });
      toast.success(TOAST.REPAIR.INVOICE_POSTED);
      tracker.track(EVENTS.REPAIR_INVOICE_POSTED, { transactionId, ...sessionCtx });
      onSuccess?.(data);
    },
    onError: (error, transactionId) => {
      const message = getErrorMessage(error, TOAST.REPAIR.INVOICE_POST_FAILED);
      toast.error(message);
      tracker.track(EVENTS.REPAIR_INVOICE_FAILED, { stage: 'post', transactionId, error: message, ...sessionCtx });
    },
  });
}

export function useCreateRepairInvoiceReceipt({ onSuccess } = {}) {
  const queryClient = useQueryClient();
  const sessionCtx = useSessionTrackingContext();
  return useMutation({
    mutationFn: (payload) => createRepairInvoiceReceipt(payload),
    onSuccess: (data, payload) => {
      queryClient.invalidateQueries({ queryKey: ['repair', 'repair-invoices'] });
      toast.success(TOAST.REPAIR.RECEIPT_CREATED);
      tracker.track(EVENTS.REPAIR_RECEIPT_CREATED, {
        amount: payload?.amount, ...sessionCtx, transactionId: payload?.transaction_id ?? payload?.transactionId,
        // Same payment_reference field name as orderTracking.js's
        // trackDocumentPlaced — reported directly that reference number
        // should be captured everywhere a payment is recorded, not just
        // checkout. No mode_code/mode_name passed into this call (only
        // mode_id — see repair/page.jsx's addReceipt.mutateAsync), so that's
        // reported as payment_mode_id instead of a name.
        payment_mode_id:   payload?.mode_id ?? null,
        payment_reference: payload?.ref_no || null,
      });
      onSuccess?.(data);
    },
    onError: (error, payload) => {
      const message = getErrorMessage(error, TOAST.REPAIR.RECEIPT_FAILED);
      toast.error(message);
      tracker.track(EVENTS.REPAIR_RECEIPT_FAILED, { error: message, ...sessionCtx, amount: payload?.amount });
    },
  });
}
