'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { Input } from '@/components/ui/input';
import RangeSlider from '@/components/shared/RangeSlider';
import CategoryFilter from '@/components/features/catalog/CategoryFilter';
import { formatAmountOrNull as formatINR } from '@/lib/priceUtils';

function toggle(arr, value) {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}

function CheckboxRow({ label, checked, onChange }) {
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

const SEARCHABLE_THRESHOLD = 10;

function CheckboxGroup({ options, selected, onToggle, isLoading, emptyLabel }) {
  const [query, setQuery] = useState('');

  if (isLoading) {
    return <p className="py-2 text-xs text-muted-foreground">Loading…</p>;
  }
  if (!options.length) {
    return <p className="py-2 text-xs text-muted-foreground">{emptyLabel ?? 'No options available.'}</p>;
  }

  const visible = options.length > SEARCHABLE_THRESHOLD && query.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()))
    : options;

  return (
    <div className="flex flex-col">
      {options.length > SEARCHABLE_THRESHOLD && (
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
        {visible.map((opt) => (
          <CheckboxRow
            key={opt.value}
            label={opt.label}
            checked={selected.includes(opt.value)}
            onChange={() => onToggle(opt.value)}
          />
        ))}
        {options.length > SEARCHABLE_THRESHOLD && !visible.length && (
          <p className="py-2 text-xs text-muted-foreground">No match.</p>
        )}
      </div>
    </div>
  );
}
function RangePair({ label, unit, fromValue, toValue, onChange }) {
  const [local, setLocal] = useState({ from: fromValue, to: toValue });
  const [lastProps, setLastProps] = useState({ from: fromValue, to: toValue });
  if (lastProps.from !== fromValue || lastProps.to !== toValue) {
    const wasInSync = local.from === lastProps.from && local.to === lastProps.to;
    setLastProps({ from: fromValue, to: toValue });
    if (wasInSync) setLocal({ from: fromValue, to: toValue });
  }

  const commit = (next) => {
    setLocal(next);
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">
        {label} {unit && <span className="text-muted-foreground/70">({unit})</span>}
      </span>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          inputMode="decimal"
          value={local.from ?? ''}
          onChange={(e) => commit({ from: e.target.value === '' ? null : Number(e.target.value), to: local.to })}
          placeholder="From"
          className="h-9 text-sm"
        />
        <span className="text-muted-foreground" aria-hidden="true">–</span>
        <Input
          type="number"
          inputMode="decimal"
          value={local.to ?? ''}
          onChange={(e) => commit({ from: local.from, to: e.target.value === '' ? null : Number(e.target.value) })}
          placeholder="To"
          className="h-9 text-sm"
        />
      </div>
    </div>
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

function MobileFilterMasterDetail({ sections }) {
  const [activeKey, setActiveKey] = useState(sections[0]?.key);
  const active = sections.find((s) => s.key === activeKey) ?? sections[0];

  return (
    <div className="md:hidden -mx-3 flex h-[58vh]">
      <div className="w-[38%] shrink-0 overflow-y-auto border-r border-border bg-muted/40">
        {sections.map((s) => {
          const isActive = s.key === activeKey;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => setActiveKey(s.key)}
              className={[
                'flex w-full items-center justify-between gap-1.5 border-l-2 px-3 py-3 text-left text-xs font-medium transition-colors',
                isActive
                  ? 'border-l-primary bg-card text-primary font-semibold'
                  : 'border-l-transparent text-muted-foreground hover:bg-muted/70',
              ].join(' ')}
            >
              <span className="truncate">{s.title}</span>
              {s.badge ? (
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                  {s.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="min-w-0 flex-1 overflow-y-auto px-3 py-2">
        {active?.node}
      </div>
    </div>
  );
}

/**
 * @param {{
 *   categories: object[], activeCategorySlug: string|null, onSelectCategory: (slug: string|null) => void,
 *   subCategoryOptions: {value:number,label:string}[], subCategoryLoading: boolean,
 *   karatOptions: {value:number,label:string}[],
 *   metalColorOptions: {value:number,label:string}[],
 *   diamondShapeOptions: {value:number,label:string}[],
 *   itemSizeOptions: {value:number,label:string}[],
 *   collectionOptions: {value:number,label:string}[],
 *   priceBounds: {min:number,max:number}|null — the Price slider's own
 *     track bounds, live-computed from whatever's currently priced (see
 *     lib/catalogFacets.js's getPriceBounds) — section hides while null
 *     (nothing priced yet, or every price identical).
 *   facets: object, onFacetsChange: (patch: object) => void,
 *   showOutOfStock: boolean, onShowOutOfStockChange: (val: boolean) => void,
 *   hasActiveFilters: boolean, onClearFilters: () => void,
 * }}
 */
export default function ProductFilterPanel({
  categories,
  activeCategorySlug,
  onSelectCategory,
  subCategoryOptions,
  subCategoryLoading,
  karatOptions,
  metalColorOptions,
  diamondShapeOptions,
  itemSizeOptions,
  collectionOptions,
  priceBounds,
  facets,
  onFacetsChange,
  showOutOfStock,
  onShowOutOfStockChange,
  hasActiveFilters,
  onClearFilters,
}) {
  
  const sections = [
    {
      key: 'Category', title: 'Category',
      badge: activeCategorySlug ? 1 : null,
      node: (
        <CategoryFilter
          categories={categories}
          activeCategorySlug={activeCategorySlug}
          onSelectCategory={onSelectCategory}
        />
      ),
    },
    {
      key: 'Sub Category', title: 'Sub Category',
      badge: facets.subTypeIds.length || null,
      node: !activeCategorySlug ? (
        <p className="py-2 text-xs text-muted-foreground">Select a category first.</p>
      ) : (
        <CheckboxGroup
          options={subCategoryOptions}
          selected={facets.subTypeIds}
          isLoading={subCategoryLoading}
          onToggle={(value) => onFacetsChange({ subTypeIds: toggle(facets.subTypeIds, value) })}
        />
      ),
    },
    {
      key: 'Availability', title: 'Availability',
      badge: showOutOfStock ? 1 : null,
      node: (
        <CheckboxRow
          label="Include out of stock"
          checked={showOutOfStock}
          onChange={(e) => onShowOutOfStockChange(e.target.checked)}
        />
      ),
    },
    {
      key: 'Price', title: 'Price', badge: null,
      node: priceBounds ? (
        <RangeSlider
          min={priceBounds.min}
          max={priceBounds.max}
          value={[
            facets.priceMin ?? priceBounds.min,
            facets.priceMax ?? priceBounds.max,
          ]}
          onChange={(lo, hi) => onFacetsChange({ priceMin: lo, priceMax: hi })}
          formatValue={formatINR}
        />
      ) : (
        <p className="py-2 text-xs text-muted-foreground">
          Waiting for prices to load…
        </p>
      ),
    },
    {
      key: 'Karat', title: 'Karat',
      badge: facets.karatIds.length || null,
      node: (
        <CheckboxGroup
          options={karatOptions}
          selected={facets.karatIds}
          onToggle={(value) => onFacetsChange({ karatIds: toggle(facets.karatIds, value) })}
        />
      ),
    },
    {
      key: 'Metal Color', title: 'Metal Color',
      badge: facets.metalColorIds.length || null,
      node: (
        <CheckboxGroup
          options={metalColorOptions}
          selected={facets.metalColorIds}
          onToggle={(value) => onFacetsChange({ metalColorIds: toggle(facets.metalColorIds, value) })}
        />
      ),
    },
    {
      key: 'Diamond Shape', title: 'Diamond Shape',
      badge: facets.shapeIds.length || null,
      node: (
        <CheckboxGroup
          options={diamondShapeOptions}
          selected={facets.shapeIds}
          onToggle={(value) => onFacetsChange({ shapeIds: toggle(facets.shapeIds, value) })}
        />
      ),
    },
    {
      key: 'Item Size', title: 'Item Size',
      badge: facets.itemSizeIds.length || null,
      node: (
        <CheckboxGroup
          options={itemSizeOptions}
          selected={facets.itemSizeIds}
          onToggle={(value) => onFacetsChange({ itemSizeIds: toggle(facets.itemSizeIds, value) })}
        />
      ),
    },
    {
      key: 'Collection', title: 'Collection',
      badge: facets.collectionIds.length || null,
      node: (
        <CheckboxGroup
          options={collectionOptions}
          selected={facets.collectionIds}
          onToggle={(value) => onFacetsChange({ collectionIds: toggle(facets.collectionIds, value) })}
        />
      ),
    },
    {
      key: 'Measurements', title: 'Measurements', badge: null,
      node: (
        <div className="flex flex-col gap-4">
          <RangePair
            label="Weight" unit="g"
            fromValue={facets.weightFrom} toValue={facets.weightTo}
            onChange={({ from, to }) => onFacetsChange({ weightFrom: from, weightTo: to })}
          />
          <RangePair
            label="Diamond Weight" unit="ct"
            fromValue={facets.diamondWeightFrom} toValue={facets.diamondWeightTo}
            onChange={({ from, to }) => onFacetsChange({ diamondWeightFrom: from, diamondWeightTo: to })}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-1">
      {hasActiveFilters && (
        <button
          type="button"
          onClick={onClearFilters}
          className="hidden self-end text-xs font-medium text-destructive hover:underline mb-1 md:block"
        >
          Clear all
        </button>
      )}

      <Accordion type="multiple" defaultValue={['Category']} className="hidden w-full md:block">
        {sections.map((s) => (
          <Section key={s.key} title={s.title}>{s.node}</Section>
        ))}
      </Accordion>

      <MobileFilterMasterDetail sections={sections} />
    </div>
  );
}
