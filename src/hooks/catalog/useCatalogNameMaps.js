import { useMemo } from 'react';
import { useCategories, useSubTypes, useItemGroups } from './useCategoryFilters';

export function useCatalogNameMaps() {
  const types     = useCategories();
  const subTypes  = useSubTypes();
  const groups    = useItemGroups();

  const maps = useMemo(() => ({
    typeNames:    new Map((types.data ?? []).map((t) => [t.type_id, t.type_name])),
    subTypeNames: new Map((subTypes.data ?? []).map((s) => [s.sub_type_id, s.sub_type_name])),
    groupNames:   new Map((groups.data ?? []).map((g) => [g.item_group_id, g.item_group_name])),
  }), [types.data, subTypes.data, groups.data]);

  const isReady = !types.isLoading && !subTypes.isLoading && !groups.isLoading;
  return { ...maps, isReady };
}
