'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import TicketDetail from '@/components/features/ticketing/TicketDetail';
import InlineLoader from '@/components/shared/InlineLoader';
import ErrorState from '@/components/shared/ErrorState';
import { Button } from '@/components/ui/button';
import { useTicket } from '@/hooks/ticketing/useTickets';

function TicketScreen() {
  const router = useRouter();
  const { ticketNumber } = useParams();
  const partyParam = Number(useSearchParams().get('partyId'));
  const partyId = Number.isInteger(partyParam) && partyParam > 0 ? partyParam : null;
  const decodedNumber = decodeURIComponent(ticketNumber);
  const { data: ticket, isLoading, isError, error, refetch } = useTicket(decodedNumber, { partyId });

  return (
    <div className="p-4 pb-8 flex flex-col gap-4 md:p-6">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="-ml-2 self-start gap-1.5"
        onClick={() => (window.history.length > 1 ? router.back() : router.push('/ticketing'))}
      >
        <ArrowLeft size={16} aria-hidden="true" /> Back
      </Button>

      {isLoading && <InlineLoader className="py-16" label={`Loading ${decodedNumber}…`} />}
      {isError && !isLoading && (
        <ErrorState title={error?.message ?? 'Failed to load this ticket.'} onRetry={refetch} />
      )}
      {ticket && <TicketDetail ticket={ticket} partyId={partyId} />}
      {!ticket && !isLoading && !isError && (
        <Button asChild variant="outline"><Link href="/ticketing">Back to tickets</Link></Button>
      )}
    </div>
  );
}

export default function TicketPage() {
  return (
    <Suspense fallback={<InlineLoader className="py-16" label="Loading ticket…" />}>
      <TicketScreen />
    </Suspense>
  );
}
