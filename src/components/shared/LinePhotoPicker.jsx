'use client';

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
