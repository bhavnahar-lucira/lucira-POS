'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSelector } from 'react-redux';
import { ArrowLeft } from 'lucide-react';

import TicketForm from '@/components/features/ticketing/TicketForm';
import { ticketHref } from '@/components/features/ticketing/TicketList';
import { Button } from '@/components/ui/button';
import { selectActiveStoreId } from '@/store/slices/storeSlice';

export default function NewTicketPage() {
  const router = useRouter();
  const storeId = useSelector(selectActiveStoreId);

  return (
    <div className="p-4 pb-8 flex flex-col gap-4 md:p-6">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" className="-ml-2 size-9" aria-label="Back to tickets">
          <Link href="/ticketing"><ArrowLeft size={18} aria-hidden="true" /></Link>
        </Button>
        <p className="text-sm text-muted-foreground">New custom design request</p>
      </div>

      {storeId ? (
        <TicketForm onCreated={(ticket) => router.replace(ticketHref(ticket.ticket_number))} />
      ) : (
        <div className="rounded-xl border border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">No store selected. Please switch to a store to raise a ticket.</p>
        </div>
      )}
    </div>
  );
}
