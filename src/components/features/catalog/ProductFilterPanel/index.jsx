'use client';

// Full catalog filter panel (2026-09-28) — Category + Diamond Shape + Carat
// + Weight (Gold|Diamond) + Material + Price, all in one place instead of
// Category sitting alone as a top-row chip strip. Rendered as BottomSheet's
// content — a right-side drawer on desktop/tablet, a bottom sheet on mobile
// (BottomSheet itself picks the layout) — so this ONE component is the
// whole filter UI on every breakpoint, no separate mobile/desktop
// implementations to keep in sync. Color removed (2026-09-28, direction).
//
// Options are computed live from whatever's currently loaded (facetOptions
// prop, from lib/catalogFacets.js's buildFacetOptions) — every checkbox
// shows a real count and options that don't exist in the current store/
// category never appear, rather than a static list that's often empty.

import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import RangeSlider from '@/components/shared/RangeSlider';
import CategoryFilter from '@/components/features/catalog/CategoryFilter';
import { formatAmountOrNull as formatINR } from '@/lib/priceUtils';

function toggle(arr, value) {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}

function CheckboxRow({ label, count, checked, onChange }) {
  return (
    <label className="flex items-center justify-between gap-2 py-2 cursor-pointer select-none">
      <span className="flex items-center gap-2.5 text-sm text-foreground">
        <input
          type="checkbox"
          checked={checked}
          onChange={onChange}
          className="h-4 w-4 rounded border-border text-accent focus-visible:ring-2 focus-visible:ring-accent accent-accent"
        />
        {label}
      </span>
      {count != null && <span className="text-xs text-muted-foreground">({count})</span>}
    </label>
  );
}

function Section({ title, children }) {
  return (
    <AccordionItem value={title}>
      <AccordionTrigger>{title}</AccordionTrigger>
      <AccordionContent>{children}</AccordionContent>
    </AccordionItem>
  );
}

/**
 * @param {{
 *   categories: object[], activeCategorySlug: string|null, onSelectCategory: (slug: string|null) => void,
 *   facetOptions: ReturnType<typeof import('@/lib/catalogFacets').buildFacetOptions>,
 *   facets: object, onFacetsChange: (patch: object) => void,
 *   showOutOfStock: boolean, onShowOutOfStockChange: (val: boolean) => void,
 *   hasActiveFilters: boolean, onClearFilters: () => void,
 * }}
 */
export default function ProductFilterPanel({
  categories,
  activeCategorySlug,
  onSelectCategory,
  facetOptions,
  facets,
  onFacetsChange,
  showOutOfStock,
  onShowOutOfStockChange,
  hasActiveFilters,
  onClearFilters,
}) {
  const weightOptions = facets.weightMode === 'diamond' ? facetOptions.diamondWeightBuckets : facetOptions.goldWeightBuckets;

  return (
    <div className="flex flex-col gap-1">
      {hasActiveFilters && (
        <button
          type="button"
          onClick={onClearFilters}
          className="self-end text-xs font-medium text-destructive hover:underline mb-1"
        >
          Clear all
        </button>
      )}

      <Accordion type="multiple" defaultValue={['Category']} className="w-full">
        <Section title="Category">
          <CategoryFilter
            categories={categories}
            activeCategorySlug={activeCategorySlug}
            hasActiveFilters={false}
            onSelectCategory={onSelectCategory}
            onClearFilters={() => {}}
            wrap
          />
        </Section>

        {/* Moved in from the sticky bar's own standalone toggle (2026-09-28,
            explicit direction) — it's a filter like any other here. */}
        <Section title="Availability">
          <CheckboxRow
            label="Include out of stock"
            checked={showOutOfStock}
            onChange={(e) => onShowOutOfStockChange(e.target.checked)}
          />
        </Section>

        {facetOptions.priceMin != null && facetOptions.priceMax > facetOptions.priceMin && (
          <Section title="Price">
            <RangeSlider
              min={Math.floor(facetOptions.priceMin)}
              max={Math.ceil(facetOptions.priceMax)}
              value={[
                facets.priceMin ?? Math.floor(facetOptions.priceMin),
                facets.priceMax ?? Math.ceil(facetOptions.priceMax),
              ]}
              onChange={(lo, hi) => onFacetsChange({ priceMin: lo, priceMax: hi })}
              formatValue={formatINR}
            />
          </Section>
        )}

        {facetOptions.caratBuckets.length > 0 && (
          <Section title="Carat Range">
            {facetOptions.caratBuckets.map((opt) => (
              <CheckboxRow
                key={opt.value}
                label={opt.label}
                count={opt.count}
                checked={facets.caratBuckets.includes(opt.value)}
                onChange={() => onFacetsChange({ caratBuckets: toggle(facets.caratBuckets, opt.value) })}
              />
            ))}
          </Section>
        )}

        {facetOptions.shapes.length > 0 && (
          <Section title="Diamond Shape">
            {facetOptions.shapes.map((opt) => (
              <CheckboxRow
                key={opt.value}
                label={opt.label}
                count={opt.count}
                checked={facets.shapes.includes(opt.value)}
                onChange={() => onFacetsChange({ shapes: toggle(facets.shapes, opt.value) })}
              />
            ))}
          </Section>
        )}

        {(facetOptions.goldWeightBuckets.length > 0 || facetOptions.diamondWeightBuckets.length > 0) && (
          <Section title="Weight">
            <div className="flex gap-1 mb-3 rounded-lg bg-secondary p-1">
              {['gold', 'diamond'].map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onFacetsChange({ weightMode: mode, weightBuckets: [] })}
                  className={`flex-1 rounded-md py-1.5 text-xs font-medium capitalize transition-colors ${
                    facets.weightMode === mode ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
            {/* Diamond can legitimately have nothing to show (most catalog
                rows carry no diamond weight at all) — a blank list under an
                otherwise-working tab reads as broken, so say so explicitly. */}
            {weightOptions.length === 0 && (
              <p className="py-2 text-xs text-muted-foreground">
                No {facets.weightMode} weight data in the current results.
              </p>
            )}
            {weightOptions.map((opt) => (
              <CheckboxRow
                key={opt.value}
                label={opt.label}
                count={opt.count}
                checked={facets.weightBuckets.includes(opt.value)}
                onChange={() => onFacetsChange({ weightBuckets: toggle(facets.weightBuckets, opt.value) })}
              />
            ))}
          </Section>
        )}

        {facetOptions.materials.length > 0 && (
          <Section title="Material Type">
            {facetOptions.materials.map((opt) => (
              <CheckboxRow
                key={opt.value}
                label={opt.label}
                count={opt.count}
                checked={facets.materials.includes(opt.value)}
                onChange={() => onFacetsChange({ materials: toggle(facets.materials, opt.value) })}
              />
            ))}
          </Section>
        )}
      </Accordion>
    </div>
  );
}
