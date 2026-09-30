'use client';

// Shared horizontal tab strip built on shadcn/Radix Tabs, in two variants:
//   'pill' — segmented control with a shared bg-muted track and a raised
//            active segment (matches lucirajewelry.com's toggle style).
//   'chip' — rounded-lg, optional icon, horizontally scrollable nav strip
//            (kept as separate rounded chips on purpose — not a toggle).
//
// `tabs` accepts plain keys (paired with getLabel) or richer objects —
// getKey/getLabel/getIcon default to the {key,label,icon} shape.

import {
  Tabs, TabsList, TabsTrigger,
} from '@/components/ui/tabs';

// NOTE: h-8/h-9 below are explicit, not incidental — shadcn's base
// TabsTrigger sizes itself to h-[calc(100%-1px)] of TabsList's height,
// which only resolves against a parent with a definite height. TabsList
// here is h-auto, so without a fixed trigger height every tab silently
// falls back to its own content-driven height instead of filling the
// segmented track (visible as a sliver of unfilled track above the active
// pill). Don't remove these without giving TabsList a definite height.
const VARIANT_TRIGGER = {
  // shrink-0 + whitespace-nowrap only matter once a 'pill' caller also passes
  // scrollable (added for the dashboard's 4-tab row, which otherwise squished
  // and wrapped its labels on narrow phones instead of scrolling) — flex-1
  // still grows them to fill the track when they DO fit, same as before.
  pill: 'h-8 flex-1 shrink-0 whitespace-nowrap rounded-md px-4 py-1.5 text-xs font-medium text-center transition-colors duration-standard ease-premium '
    + 'data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:font-semibold data-[state=active]:shadow-sm '
    + 'data-[state=inactive]:bg-transparent data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground',
  chip: 'h-9 flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors duration-standard ease-premium '
    + 'data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none '
    + 'data-[state=inactive]:bg-muted/40 data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-muted/70',
};

// Shared "track" background — 'pill' only; 'chip' stays transparent since
// each chip carries its own background.
const VARIANT_LIST = {
  pill: 'gap-1 rounded-md bg-muted p-1',
  chip: 'gap-1 bg-transparent p-0',
};

// NOTE: 'chip' needs min-w-0 alongside w-full, not w-full alone. shadcn's
// base TabsList is `inline-flex w-fit` inside a flex column, so without
// min-w-0 it never shrinks below its content's intrinsic width —
// overflow-x-auto then has nothing to clip against and the page scrolls
// horizontally instead of the tab row. Applies whenever tabs overflow the
// viewport (e.g. the customer profile page's 6 tabs), not just on mobile.
const VARIANT_LIST_WIDTH = {
  pill: 'w-full',
  chip: 'w-full min-w-0',
};

export default function PillTabs({
  tabs,
  value,
  onChange,
  getKey = (t) => t.key ?? t,
  getLabel = (t) => t.label ?? t,
  getIcon = (t) => t.icon,
  variant = 'pill',
  scrollable = false,
  className = '',
}) {
  return (
    <Tabs value={value} onValueChange={onChange}>
      <TabsList
        className={`h-auto justify-start ${VARIANT_LIST_WIDTH[variant]} ${VARIANT_LIST[variant]} ${
          scrollable ? 'flex-nowrap overflow-x-auto scrollbar-none' : 'flex-wrap'
        } ${className}`}
      >
        {tabs.map((tab) => {
          const Icon = getIcon(tab);
          return (
            <TabsTrigger key={getKey(tab)} value={String(getKey(tab))} className={VARIANT_TRIGGER[variant]}>
              {Icon && <Icon className="w-3.5 h-3.5" />}
              {getLabel(tab)}
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}
