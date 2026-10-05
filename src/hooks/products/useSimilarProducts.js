import { useMemo } from 'react';
import { useAllCatalog } from '@/hooks/catalog/useAllCatalog';

/**
 * @param {{
 *   item_id: number, type_id?: number, sub_type_id?: number,
 *   item_group_id?: number, metal_id?: number, karat_id?: number,
 * }|null} product
 * @param {number|null} storeId — the active store (same as useAllCatalog).
 * @param {{ limit?: number, enabled?: boolean }} [options]
 * @returns {{ items: object[], isLoading: boolean }} 
 */
export function useSimilarProducts(product, storeId, { limit = 12, enabled = true } = {}) {
  const { data: catalog = [], isLoading } = useAllCatalog(storeId, { enabled });

  const items = useMemo(() => {
    const currentId = product?.item_id;
    if (!currentId || catalog.length === 0) return [];

    const subTypeId = product.sub_type_id ?? null;
    const typeId    = product.type_id ?? null;
    const groupId   = product.item_group_id ?? null;
    const metalId   = product.metal_id ?? null;
    const karatId   = product.karat_id ?? null;
    const closenessScore = (p) => {
      let score = 0;
      if (metalId != null && p.metal_id === metalId) score += 2;
      if (karatId != null && p.karat_id === karatId) score += 1;
      if (p.has_stock === true) score += 1;
      return score;
    };
    const byCloseness = (a, b) => closenessScore(b) - closenessScore(a);

    const pool = catalog.filter((p) => p.item_id !== currentId);
    const sameSubType = subTypeId != null && typeId != null
      ? pool.filter((p) => p.sub_type_id === subTypeId && p.type_id === typeId).sort(byCloseness)
      : [];

    const sameTypeOnly = typeId != null
      ? pool
          .filter((p) => p.type_id === typeId && p.sub_type_id !== subTypeId)
          .sort(byCloseness)
      : [];

    const sameGroupOnly = groupId != null
      ? pool
          .filter((p) => p.item_group_id === groupId && p.type_id !== typeId)
          .sort(byCloseness)
      : [];

    return [...sameSubType, ...sameTypeOnly, ...sameGroupOnly].slice(0, limit);
  }, [
    catalog,
    product?.item_id,
    product?.sub_type_id,
    product?.type_id,
    product?.item_group_id,
    product?.metal_id,
    product?.karat_id,
    limit,
  ]);

  return { items, isLoading };
}
