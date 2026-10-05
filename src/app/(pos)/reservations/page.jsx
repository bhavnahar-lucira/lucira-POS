'use client';

import Link from 'next/link';
import { Bookmark, ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ReservationsPage() {
  return (
    <div className="flex flex-col gap-4 max-w-2xl mx-auto w-full">
      <div className="flex justify-end">
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Coming Soon
        </span>
      </div>

      <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border px-6 py-12 text-center">
        <Bookmark size={40} className="text-muted-foreground/50" aria-hidden="true" strokeWidth={1.5} />

        <div className="space-y-1.5 max-w-md">
          <p className="text-sm font-medium text-foreground">
            Product reservations are coming soon
          </p>
          <p className="text-xs text-muted-foreground">
            The ability to place a hold on an item for a customer — and to
            view, manage, or cancel active reservations — is pending
            availability of reservation endpoints in the OrnaVerse API
            collection. This screen will be expanded into a full reservation
            management workflow once those endpoints are added.
          </p>
        </div>

        <Button asChild size="sm" variant="outline" className="gap-2 mt-1">
          <Link href="/catalog">
            <ShoppingBag size={16} aria-hidden="true" />
            Browse Catalog
          </Link>
        </Button>
      </div>
    </div>
  );
}