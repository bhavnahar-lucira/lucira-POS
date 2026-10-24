/**
 * @param {object[]} catalogRows — ProductCatalogRow[] (item_code, item_id, …)
 * @returns {Map<string, object>} item_code -> catalog row
 */
export function buildSkuIndex(catalogRows) {
  const index = new Map();
  for (const row of catalogRows ?? []) {
    if (row.item_code) index.set(row.item_code, row);
  }
  return index;
}

/**
 * @param {string|null|undefined} sku — a website item's own sku field
 * @param {Map<string, object>} skuIndex
 * @returns {object|null} the matching OrnaVerse catalog row, or null
 */
export function matchBySku(sku, skuIndex) {
  if (!sku) return null;
  return skuIndex.get(sku) ?? null;
}
