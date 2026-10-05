'use client';

// Upload + display a customer's PAN card / identity document.
//
// Two-step OrnaVerse contract (fileUploadService.js): uploadTemporaryFile()
// first to get a `temporary/<guid>.<ext>` path, then save THAT path onto
// Customer/Update's own `pan_document` field — a raw base64 data URI sent
// directly into that field 500s (confirmed 2026-09-17). OrnaVerse promotes
// the temp file into permanent storage itself once the customer record is
// saved, which is also why a fresh refetch right after saving can't be
// trusted to reflect it immediately — same masking/timing reason
// CheckoutPanCapture's own justSavedPan exists for the PAN NUMBER; this
// component tracks a `justSavedPath` of its own for the DOCUMENT for the
// identical reason.
//
// Shared by CheckoutPanCapture (where OrnaVerse's real Invoice/Create
// requirement for this was discovered live — "Please upload PAN & its
// number" even with a valid number already on file) and the customer
// profile Edit tab, so both save/display it identically rather than two
// drifting copies.

import { useRef, useState } from 'react';
import { Paperclip, CheckCircle2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { uploadTemporaryFile } from '@/services/fileUploadService';
import { useUpdateCustomer } from '@/hooks/customer/useUpdateCustomer';
import { resolveImageSrc } from '@/lib/resolveImageSrc';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];

/**
 * @param {{
 *   customerId: number,
 *   customerName: string,
 *   originalRaw: object,       — raw entity from Customer/Retrieve, for the
 *                                 full-record merge Customer/Update requires.
 *   savedPath: string|null,    — customer.customerPanDocument (already
 *                                 normalized — null/"NA" collapsed to null).
 *   onSaved?: (path: string) => void,
 * }} props
 */
export default function PanDocumentUpload({
  customerId, customerName, originalRaw, savedPath, onSaved,
}) {
  const updateCustomer = useUpdateCustomer();
  const fileInputRef = useRef(null);
  const [error, setError] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  // Tracks ONLY "a save just succeeded this session", not a URL — CONFIRMED
  // LIVE 2026-10-03: the temp path a successful save resolves is NOT the
  // final one. OrnaVerse promotes it server-side into permanent storage
  // during Customer/Update (e.g. "temporary/<guid>.png" becomes
  // "Documents/00002/00002221_<hash>.png") — the temp path itself 404s
  // immediately after. useUpdateCustomer's onSuccess already invalidates
  // this customer's query, so the real permanent path arrives shortly after
  // via `savedPath` (the refetched prop) — never build the View link from
  // the temp path itself.
  const [justSaved, setJustSaved] = useState(false);

  const viewUrl = resolveImageSrc(savedPath);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file after an error
    if (!file) return;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError('Use a JPG, PNG, or PDF file.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError('File is too large — max 5MB.');
      return;
    }

    setError(null);
    setIsUploading(true);
    try {
      const tempPath = await uploadTemporaryFile(file);
      if (!tempPath) throw new Error('Upload did not return a file path.');
      await updateCustomer.mutateAsync({
        partyId: customerId,
        originalRaw,
        formChanges: { pan_document: tempPath, party_name: customerName },
      });
      setJustSaved(true);
      // Reports the temp path upward purely as a truthy "a document now
      // exists" signal (checkoutSchema's gate is `!!panDocument`, never a
      // display URL) — see this component's own viewUrl comment above for
      // why the temp path itself is never used for display.
      onSaved?.(tempPath);
    } catch (err) {
      setError(err?.serverMessage ?? err?.message ?? 'Could not save the document — please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(',')}
        onChange={handleFileChange}
        className="hidden"
        aria-label="PAN card or document"
      />
      {justSaved || savedPath ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2">
          <span className="flex items-center gap-1.5 text-sm text-status-in-stock truncate">
            <CheckCircle2 size={15} className="shrink-0" aria-hidden="true" />
            Document on file
          </span>
          <div className="flex items-center gap-3 shrink-0">
            {viewUrl && (
              <a
                href={viewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
              >
                View
                <ExternalLink size={12} aria-hidden="true" />
              </a>
            )}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              {isUploading ? 'Uploading…' : 'Replace'}
            </button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full gap-2"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
        >
          <Paperclip size={15} />
          {isUploading ? 'Uploading…' : 'Attach PAN card / document'}
        </Button>
      )}
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}
