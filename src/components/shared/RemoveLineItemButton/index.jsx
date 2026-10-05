'use client';

import { Trash2 } from 'lucide-react';

export default function RemoveLineItemButton({ onClick, label = 'Remove item' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="text-muted-foreground hover:text-destructive"
    >
      <Trash2 size={14} />
    </button>
  );
}
