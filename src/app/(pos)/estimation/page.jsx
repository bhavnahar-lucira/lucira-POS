'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useDispatch, useSelector } from 'react-redux';
import { toast } from 'sonner';

import CustomEstimateForm from '@/components/features/estimation/CustomEstimateForm';
import InlineLoader from '@/components/shared/InlineLoader';
import { useTicket } from '@/hooks/ticketing/useTickets';
import { selectActiveStoreId } from '@/store/slices/storeSlice';
import { attachCustomer, detachCustomer, selectCartCustomerId } from '@/store/slices/cartSlice';
import { TICKET_STATUS } from '@/lib/ticketing/constants';

function EstimationScreen() {
  const router = useRouter();
  const dispatch = useDispatch();
  const storeId = useSelector(selectActiveStoreId);
  const cartCustomerId = useSelector(selectCartCustomerId);
  const ticketNumber = useSearchParams().get('ticket');
  const { data: ticket, isLoading: isTicketLoading, isError: isTicketError } = useTicket(ticketNumber);
  const isTicketReady = ticket?.status === TICKET_STATUS.FINAL_RECEIVED && !!ticket.final_details;

  // The ticket's customer is the one the order is placed for.
  useEffect(() => {
    if (!isTicketReady || cartCustomerId === ticket.customer_party_id) return;
    if (cartCustomerId) dispatch(detachCustomer());
    dispatch(attachCustomer({
      customerId:     ticket.customer_party_id,
      customerName:   ticket.customer_name,
      customerMobile: ticket.customer_mobile,
      customerContactMobile: ticket.customer_mobile,
    }));
    toast.success(`Customer ${ticket.customer_name} attached from ticket ${ticket.ticket_number}.`);
  }, [isTicketReady, ticket, cartCustomerId, dispatch]);

  return (
    <div className="p-4 pb-8 flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">Price quotes before a purchase</p>

      {!storeId && (
        <div className="rounded-xl border border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">No store selected. Please switch to a store to view quotations.</p>
        </div>
      )}

      {storeId && ticketNumber && isTicketLoading && <InlineLoader label={`Loading ticket ${ticketNumber}…`} />}
      {storeId && ticketNumber && !isTicketLoading && (isTicketError || !isTicketReady) && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          Ticket {ticketNumber} has no final details ready for an estimate.
        </div>
      )}

      {storeId && (!ticketNumber || isTicketReady) && (
        <div className="rounded-xl border border-border bg-card p-4">
          <CustomEstimateForm
            key={ticketNumber ?? 'blank'}
            ticket={isTicketReady ? ticket : null}
            onDone={() => router.push('/checkout')}
          />
        </div>
      )}
    </div>
  );
}

export default function EstimationPage() {
  return (
    <Suspense fallback={<InlineLoader className="py-16" label="Loading…" />}>
      <EstimationScreen />
    </Suspense>
  );
}
