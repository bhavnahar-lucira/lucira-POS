const DAY_MS = 24 * 60 * 60 * 1000;

// Days since the buyer's last purchase. Bands don't overlap, so each buyer falls in exactly one.
export const RECENCY_OPTIONS = [
  { value: 'all', label: 'Any time' },
  { value: '90',  label: 'Last 90 days',  min: 0,   max: 90 },
  { value: '180', label: '91–180 days',   min: 91,  max: 180 },
  { value: '275', label: '181–275 days',  min: 181, max: 275 },
  { value: '365', label: '276–365 days',  min: 276, max: 365 },
  { value: '365+', label: 'More than 365 days', min: 366, max: Infinity },
];

// Number of purchases (posted invoices + orders, cancelled ones excluded).
export const FREQUENCY_OPTIONS = [
  { value: 'all', label: 'Any frequency' },
  { value: '1',   label: '1 purchase',       min: 1, max: 1 },
  { value: '1-3', label: '2–3 purchases',    min: 2, max: 3 },
  { value: '3-5', label: '4–5 purchases',    min: 4, max: 5 },
  { value: '5+',  label: 'More than 5',      min: 6, max: Infinity },
];

// Non-Buyers: number of visits, same groups as purchase frequency.
export const VISIT_FREQUENCY_OPTIONS = [
  { value: 'all', label: 'Any number of visits' },
  { value: '1',   label: '1 visit',          min: 1, max: 1 },
  { value: '1-3', label: '2–3 visits',       min: 2, max: 3 },
  { value: '3-5', label: '4–5 visits',       min: 4, max: 5 },
  { value: '5+',  label: 'More than 5 visits', min: 6, max: Infinity },
];

/** True when `value` falls in the band `selected` picks from `options` ('all' always matches). */
export function matchesBand(value, options, selected) {
  if (!selected || selected === 'all') return true;
  const option = options.find((o) => o.value === selected);
  return !option?.max || (value != null && value >= option.min && value <= option.max);
}

export const SORT_OPTIONS = [
  { value: 'recent',     label: 'Most recent purchase' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'price_asc',  label: 'Price: low to high' },
];

const startOfDay = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };

/** Calendar days between the date and today (yesterday = 1, whatever the time of day). */
export function daysSince(date, now = Date.now()) {
  if (!date) return null;
  const ms = new Date(date).getTime();
  return Number.isFinite(ms) ? Math.max(0, Math.round((startOfDay(now) - startOfDay(ms)) / DAY_MS)) : null;
}

/** Applies the Days, Frequency and By Price controls to grouped buyers (groupPurchasesByBuyer rows). */
export function applyBuyerFilters(buyers, { recency = 'all', frequency = 'all', sort = 'recent', now = Date.now() } = {}) {
  const rows = buyers
    .map((b) => ({ ...b, daysSinceLastPurchase: daysSince(b.lastPurchaseDate, now) }))
    .filter((b) => matchesBand(b.daysSinceLastPurchase, RECENCY_OPTIONS, recency)
      && matchesBand(b.purchaseCount, FREQUENCY_OPTIONS, frequency));
  if (sort === 'price_desc') return rows.sort((a, b) => b.totalSpend - a.totalSpend);
  if (sort === 'price_asc') return rows.sort((a, b) => a.totalSpend - b.totalSpend);
  return rows;
}
