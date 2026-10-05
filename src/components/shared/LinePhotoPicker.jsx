'use client';

import { Camera } from 'lucide-react';

// Mirrors OrnaVerse's own upload button exactly (confirmed from its real
// client bundle, DynJS.axd/Bundle.Base.js — the addUploadInput factory
// behind every FileUploadEditor/ImageUploadEditor): the real
// <input type="file"> is layered directly ON TOP of the visible button,
// sized to cover it, opacity:0 — every click lands on the real input
// itself, no indirection. Reported directly (2026-10-05): "unable to
// attach anything" with the previous label-wrapped / ref.click()-proxied
// versions, both of which depend on browser-specific label-forwarding or
// user-activation semantics that this sidesteps entirely by construction.
export default function LinePhotoPicker({ file, onChange }) {
  return (
    <div className="relative overflow-hidden flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground hover:bg-muted/40 cursor-pointer min-h-11">
      <Camera size={14} className="shrink-0" aria-hidden="true" />
      <span className="truncate">{file ? file.name : 'Attach a photo (required)'}</span>
      <input
        type="file"
        accept="image/jpeg,image/png"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </div>
  );
}
