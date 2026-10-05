// src/lib/catalogSort.js
//
// Shared sort logic for the catalog grid and the "Available at other
// stores" section, so both stay in sync via one comparator.

export function getWeight(product) {
  return product.net_weight ?? product.weight ?? 0;
}

export function getPrice(product) {
  return product.price ?? null;
}

/**
 * Shared comparator for both search-mode and browse-mode sorting.
 * Items with no price always sort after priced ones, regardless of
 * ascending/descending direction.
 */
export function compareProducts(a, b, sortBy) {
  switch (sortBy) {
    case 'name_asc':  return (a.item_name ?? '').localeCompare(b.item_name ?? '');
    case 'name_desc': return (b.item_name ?? '').localeCompare(a.item_name ?? '');
    case 'price_asc':
    case 'price_desc': {
      const pa = getPrice(a);
      const pb = getPrice(b);
      if (pa == null && pb == null) return 0;
      if (pa == null) return 1;
      if (pb == null) return -1;
      return sortBy === 'price_asc' ? pa - pb : pb - pa;
    }
    case 'weight_asc':  return getWeight(a) - getWeight(b);
    case 'weight_desc': return getWeight(b) - getWeight(a);
    default: return 0;
  }
}

/**
 * THE ONLY sort step, for both browse and search mode (and the other-stores
 * lane), applied ONCE — after live prices are merged in. Must only run
 * after a price has been merged onto each row, or price_asc/price_desc
 * becomes a no-op (comparing null against null).
 */
export function sortProducts(products, sortBy) {
  return [...products].sort((a, b) => compareProducts(a, b, sortBy));
}

/**
 * FIXED (2026-10-05, reported: "low to high sort isn't aligned properly").
 * Used to freeze already-rendered cards in their first-seen position and
 * only sort/append whatever a pagination fetch or a price settling added —
 * meant to avoid a full-list reshuffle jumping cards the operator was
 * already scrolling past. In practice this made every sort mode WRONG
 * across more than one page: a frozen prefix is never re-merged against
 * later-arriving rows, so page 2's items (or, for price sort, a batch of
 * prices that settles later) only ever get sorted among themselves and
 * tacked on at the end — never correctly interleaved into the accumulated
 * list. Confirmed live: Rings + Price Low→High kept permanently-unpriced
 * Silver 925 rows (price never resolves on this tenant) frozen at the very
 * front forever, with real priced rows appended after in disconnected
 * batches instead of one true ascending order.
 *
 * A plain full re-sort of every currently-known row (relying on
 * Array.prototype.sort's stability for ties) is simply correct here: name/
 * weight are synchronous and never need to "settle", and compareProducts'
 * null-sorts-after-priced rule already keeps a still-pricing card from
 * jumping to the top. The occasional card moving mid-scroll once its real
 * price arrives is the CORRECT behavior for a live price sort, not jank to
 * engineer around.
 *
 * @param {object[]} _prevOrder — unused, kept so existing call sites don't
 *   need to change.
 * @param {object[]} nextItems — the latest full, unsorted list.
 * @param {string} sortBy
 */
export function stableSortProducts(_prevOrder, nextItems, sortBy) {
  return sortProducts(nextItems, sortBy);
}
