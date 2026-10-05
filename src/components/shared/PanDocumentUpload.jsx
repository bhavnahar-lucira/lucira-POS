'use client';

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
