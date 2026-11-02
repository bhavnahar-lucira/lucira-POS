'use client';

import { HeartHandshake } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

export default function VocThankYouDialog({ customerName, onDone }) {
  return (
    <Dialog open={!!customerName} onOpenChange={(open) => { if (!open) onDone(); }}>
      <DialogContent showCloseButton={false} className="text-center sm:max-w-sm">
        <DialogHeader className="items-center gap-3">
          <span className="flex size-14 items-center justify-center rounded-full bg-status-in-stock/10 text-status-in-stock">
            <HeartHandshake size={28} aria-hidden="true" />
          </span>
          <DialogTitle className="text-lg">Thank you for your feedback!</DialogTitle>
          <DialogDescription>
            {customerName}&rsquo;s feedback has been saved. It helps us make every Lucira visit better.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" className="h-11 w-full" onClick={onDone} autoFocus>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
