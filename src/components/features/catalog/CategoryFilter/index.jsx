'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

const EXCLUDED_TYPE_IDS = new Set([0]);
const EXCLUDED_NAME_PATTERN = /^(metal|color diamond|cubic zirconia|lab ?grown? colou?r? ?stone|labgrown diamond|natural diamond|precious|semi[- ]precious|synthetic)$/i;
const SEARCHABLE_THRESHOLD = 10;

function toSlug(name) {
  return name.toLowerCase().replace(/\s+/g, '-');
}

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
