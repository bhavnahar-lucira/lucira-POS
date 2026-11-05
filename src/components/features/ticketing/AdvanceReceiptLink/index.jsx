'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';

import TransactionDetailSheet from '@/components/features/transactions/TransactionDetailSheet';
import { getAdvanceReceiptDetail } from '@/services/advanceReceiptService';
import { normalizeTransaction } from '@/hooks/transactions/useTransactionLists';
import { QUERY_KEYS } from '@/constants/queryKeys';

/** The ticket's advance receipt number; opens the receipt live from OrnaVerse, as on Transactions (view and print only). */
export default function AdvanceReceiptLink({ receipt, customerName }) {
  const [open, setOpen] = useState(false);
  const transactionId = receipt?.transaction_id;
  const { data, isFetching, isError, refetch } = useQuery({
    queryKey: QUERY_KEYS.ADVANCE_RECEIPT.DETAIL(transactionId),
    queryFn: async () => {
      const entity = (await getAdvanceReceiptDetail(transactionId))?.Entity;
      if (!entity) return null;
      // Retrieve adds these two to the List row Transactions shows; PAN is never displayed here.
      const { pan_no: _pan, is_posted: _posted, ...rest } = entity;
      return normalizeTransaction(rest);
    },
    enabled: open && !!transactionId,
    staleTime: 0,
  });

  if (!receipt) return '—';
  const label = receipt.document_no ?? `#${transactionId}`;
  if (!transactionId) return label;

  return (
    <>
      <button
        type="button"
        onClick={() => (isError ? refetch() : setOpen(true))}
        className="inline-flex items-center gap-1.5 font-medium text-primary underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:rounded-sm"
        aria-label={`View advance receipt ${label}`}
      >
        {label}
        {open && isFetching && <Loader2 size={13} className="animate-spin" aria-hidden="true" />}
      </button>
      {open && isError && <span className="block text-xs text-destructive">Couldn&rsquo;t load the receipt. Tap to retry.</span>}
      {open && data && (
        <TransactionDetailSheet
          transaction={{ ...data, customerName: data.customerName ?? customerName ?? null }}
          type="advance-receipt"
          allowCancel={false}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
