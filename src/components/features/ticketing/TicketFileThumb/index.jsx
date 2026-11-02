'use client';

import { useState } from 'react';
import { FileText, X } from 'lucide-react';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export default function TicketFileThumb({ file, onRemove }) {
  const [isOpen, setIsOpen] = useState(false);
  const isPdf = file.type === 'application/pdf';
  // Same-origin path: the stored absolute URL points at whichever deployment created the ticket, which the CSP blocks elsewhere.
  const src = file.id ? `/api/ticketing/files/${file.id}` : file.url;
  return (
    <div className="relative size-24 shrink-0 overflow-hidden rounded-lg border border-border bg-muted/40">
      {isPdf ? (
        <a href={src} target="_blank" rel="noopener noreferrer" className="block size-full" title={file.file_name}>
          <span className="flex size-full flex-col items-center justify-center gap-1 p-2 text-muted-foreground">
            <FileText size={24} aria-hidden="true" />
            <span className="w-full truncate text-center text-[10px]">{file.file_name}</span>
          </span>
        </a>
      ) : (
        <button type="button" onClick={() => setIsOpen(true)} className="block size-full" title={file.file_name}>
          {/* eslint-disable-next-line @next/next/no-img-element -- served by our own file route or the CAD panel, not a configured remote host */}
          <img src={src} alt={file.file_name} className="size-full object-cover" loading="lazy" />
        </button>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${file.file_name}`}
          className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-background/90 text-foreground shadow"
        >
          <X size={14} aria-hidden="true" />
        </button>
      )}
      {!isPdf && (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogContent className="sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle className="truncate pr-8">{file.file_name}</DialogTitle>
            </DialogHeader>
            {/* eslint-disable-next-line @next/next/no-img-element -- see above */}
            <img src={src} alt={file.file_name} className="max-h-[75vh] w-full rounded-lg object-contain" />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
