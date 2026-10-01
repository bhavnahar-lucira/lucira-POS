'use client';

// Single-select category list inside ProductFilterPanel — reported directly
// (2026-10-01): the old pill/chip layout (flex-wrap full of rounded chips)
// grew as tall as the category count and could fill the whole filter sheet
// on mobile. Rebuilt to match every OTHER section in that panel (Karat,
// Metal Color, ...) — a checkbox-styled row list, searchable past
// SEARCHABLE_THRESHOLD, capped at max-h-56 with its own scrollbar — same
// visual language as those sections. Still SINGLE-select underneath (one
// requested directly right after the first pass, which used a radio input):
// picking a category still replaces whatever was active, never adds to it —
// see CategoryCheckboxRow's own comment. This was already the ONLY surviving
// consumer of this component (the old "sticky top bar" chip-row variant was
// moved into this panel on 2026-09-28 and never used standalone since), so
// there's no second layout to preserve.

import { useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

const EXCLUDED_TYPE_IDS = new Set([0]);
const EXCLUDED_NAME_PATTERN = /^(metal|color diamond|cubic zirconia|lab ?grown? colou?r? ?stone|labgrown diamond|natural diamond|precious|semi[- ]precious|synthetic)$/i;
// Matches ProductFilterPanel's own CheckboxGroup threshold — same rule,
// same reason: a short list never needs a search box.
const SEARCHABLE_THRESHOLD = 10;

function toSlug(name) {
  return name.toLowerCase().replace(/\s+/g, '-');
}

// Styled as a checkbox (reported directly, 2026-10-01: match the other
// sections' look) but still SINGLE-select underneath — clicking a row just
// calls onSelectCategory(slug) same as before, never toggles independently;
// "All Categories" is the only way back to none selected, same as the radio
// version this replaced.
function CategoryCheckboxRow({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2.5 py-2 cursor-pointer select-none text-sm text-foreground">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-4 w-4 rounded border-border text-accent focus-visible:ring-2 focus-visible:ring-accent accent-accent"
      />
      {label}
    </label>
  );
}

/**
 * @param {object}      props
 * @param {object[]}    props.categories         - Raw API categories array
 * @param {string|null} props.activeCategorySlug - Active slug from URL
 * @param {function}    props.onSelectCategory   - Called with slug or null
 */
export default function CategoryFilter({
  categories = [],
  activeCategorySlug,
  onSelectCategory,
}) {
  const [query, setQuery] = useState('');

  const visibleCategories = categories
    .filter((c) => !c.is_disabled)
    .filter((c) => !EXCLUDED_TYPE_IDS.has(c.type_id))
    .filter((c) => !EXCLUDED_NAME_PATTERN.test(c.type_name?.trim() ?? ''))
    .map((c) => ({ ...c, displayName: c.type_name }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  const searchable = visibleCategories.length > SEARCHABLE_THRESHOLD;
  const filtered = searchable && query.trim()
    ? visibleCategories.filter((c) => c.displayName.toLowerCase().includes(query.trim().toLowerCase()))
    : visibleCategories;

  return (
    <div className="flex flex-col">
      {searchable && (
        <div className="relative mb-1">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="h-9 pl-8 text-sm"
          />
        </div>
      )}
      <div className="max-h-56 overflow-y-auto pr-1">
        <CategoryCheckboxRow
          label="All Categories"
          checked={!activeCategorySlug}
          onChange={() => onSelectCategory(null)}
        />
        {filtered.map((cat) => {
          const slug = toSlug(cat.displayName);
          return (
            <CategoryCheckboxRow
              key={cat.type_id}
              label={cat.displayName}
              checked={activeCategorySlug === slug}
              onChange={() => onSelectCategory(slug)}
            />
          );
        })}
        {searchable && !filtered.length && (
          <p className="py-2 text-xs text-muted-foreground">No match.</p>
        )}
      </div>
    </div>
  );
}
