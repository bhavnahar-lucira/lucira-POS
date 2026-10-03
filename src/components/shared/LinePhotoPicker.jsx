'use client';

// A single mandatory-photo file input for one Interstore Return line — used
// wherever a cross-store item needs a condition photo before it can be
// submitted (transactions/page.jsx's cross-store Return/Exchange/Buyback
// lines, and transfers/page.jsx's own IRR create flow). Extracted 2026-10-02
// so both call sites share one implementation.

import { Camera } from 'lucide-react';

export default function LinePhotoPicker({ file, onChange }) {
  return (
    <label className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground hover:bg-muted/40 cursor-pointer min-h-11">
      <Camera size={14} className="shrink-0" aria-hidden="true" />
      <span className="truncate">{file ? file.name : 'Attach a photo (required)'}</span>
      <input
        type="file"
        accept="image/jpeg,image/png"
        className="sr-only"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
    </label>
  );
}
