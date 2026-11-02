'use client';

import Link from 'next/link';
import { useSelector } from 'react-redux';
import { Plus } from 'lucide-react';

import TicketList from '@/components/features/ticketing/TicketList';
import { Button } from '@/components/ui/button';
import { selectActiveStoreId } from '@/store/slices/storeSlice';
import { selectIsSuperAdmin } from '@/store/slices/authSlice';

export default function TicketingPage() {
  const storeId = useSelector(selectActiveStoreId);
  const isSuperAdmin = useSelector(selectIsSuperAdmin);

  return (
    <div className="p-4 pb-8 flex flex-col gap-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Custom design requests sent to the CAD team{isSuperAdmin ? ' · all stores' : ''}
        </p>
        {storeId && (
          <Button asChild className="h-11 gap-1.5">
            <Link href="/ticketing/new">
              <Plus size={16} aria-hidden="true" /> Create new ticket
            </Link>
          </Button>
        )}
      </div>

      {storeId ? (
        <TicketList />
      ) : (
        <div className="rounded-xl border border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">No store selected. Please switch to a store to view tickets.</p>
        </div>
      )}
    </div>
  );
}
