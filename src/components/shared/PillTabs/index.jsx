'use client';

import {
  Tabs, TabsList, TabsTrigger,
} from '@/components/ui/tabs';

const VARIANT_TRIGGER = {
  pill: 'h-8 flex-1 shrink-0 whitespace-nowrap rounded-md px-4 py-1.5 text-xs font-medium text-center transition-colors duration-standard ease-premium '
    + 'data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:font-semibold data-[state=active]:shadow-sm '
    + 'data-[state=inactive]:bg-transparent data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground',
  chip: 'h-9 flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors duration-standard ease-premium '
    + 'data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none '
    + 'data-[state=inactive]:bg-muted/40 data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-muted/70',
};

const VARIANT_LIST = {
  pill: 'gap-1 rounded-md bg-muted p-1',
  chip: 'gap-1 bg-transparent p-0',
};

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
