'use client';

const ALLOWED_CATEGORIES = [
  'Rings',
  'Earrings',
  'Bracelets',
  'Necklaces',
  'Pendants',
  'Mangalsutra',
  'Bestsellers',
];

function toSlug(name) {
  return name.toLowerCase().replace(/\s+/g, '-');
}

function CategoryChip({ label, isActive, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      className={[
        'shrink-0 min-h-[38px] px-5 py-1.5 rounded-full text-sm font-medium',
        'border transition-all duration-standard ease-premium whitespace-nowrap',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
        isActive
          ? 'bg-accent border-accent text-white shadow-sm'
          : 'bg-card border-border text-muted-foreground hover:border-accent/50 hover:text-accent hover:shadow-xs',
      ].join(' ')}
    >
      {label}
    </button>
  );
}

/**
 * @param {object}      props
 * @param {object[]}    props.categories          - Raw API categories array
 * @param {string|null} props.activeCategorySlug  - Active slug from URL
 * @param {boolean}     props.hasActiveFilters    - Whether any filter is active
 * @param {function}    props.onSelectCategory    - Called with slug or null
 * @param {function}    props.onClearFilters      - Clears all filters
 * @param {boolean}     [props.wrap]              - false (default): the
 *   desktop sticky bar's single-row horizontal scroller, with its fade-hint
 *   gradient. true: MobileSortFilterBar's Filter sheet — a bottom sheet
 *   already scrolls vertically as a whole, so a SECOND, nested horizontal
 *   scroll region here just for categories was reported as unnecessary/
 *   confusing on mobile; wraps chips onto as many lines as needed instead.
 */
export default function CategoryFilter({
  categories = [],
  activeCategorySlug,
  hasActiveFilters,
  onSelectCategory,
  onClearFilters,
  wrap = false,
}) {
  const visibleCategories = ALLOWED_CATEGORIES
    .map((allowedName) => {
      const allowed = allowedName.toLowerCase();
      const match = categories.find((c) => {
        const apiName = c.type_name?.toLowerCase() ?? '';
        if (apiName === allowed) return true;
        if (apiName.startsWith(allowed)) return true;
        return false;
      });
      return match ? { ...match, displayName: allowedName } : null;
    })
    .filter(Boolean);

  return (
    <div className="relative">
      <div
        className={
          wrap
            ? 'flex flex-wrap items-center gap-2 py-1'
            : 'flex items-center gap-2 overflow-x-auto scrollbar-none py-1 pr-6'
        }
      >

        <CategoryChip
          label="ALL"
          isActive={!activeCategorySlug}
          onClick={() => onSelectCategory(null)}
        />

        {visibleCategories.map((cat) => {
          const slug     = toSlug(cat.displayName);
          const isActive = activeCategorySlug === slug;
          return (
            <CategoryChip
              key={cat.type_id}
              label={cat.displayName.toUpperCase()}
              isActive={isActive}
              onClick={() => onSelectCategory(isActive ? null : slug)}
            />
          );
        })}

        {hasActiveFilters && activeCategorySlug && (
          <>
            <div className="w-px h-5 bg-border shrink-0 mx-1" aria-hidden="true" />
            <button
              type="button"
              onClick={onClearFilters}
              className="shrink-0 min-h-[38px] px-3 py-1.5 rounded-full text-xs font-medium border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring whitespace-nowrap"
            >
              Clear
            </button>
          </>
        )}
      </div>

      {/* Fade hint — only meaningful for the scrolling variant, signals the
          chip row scrolls horizontally when it overflows. */}
      {!wrap && (
        <div
          className="pointer-events-none absolute right-0 top-0 h-full w-8 bg-gradient-to-l from-white to-transparent"
          aria-hidden="true"
        />
      )}
    </div>
  );
}