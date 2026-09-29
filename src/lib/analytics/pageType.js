// src/lib/analytics/pageType.js
//
// Route-prefix -> semantic page type (2026-09-28, explicit direction) — so
// PAGE_VIEW events can be segmented by "what kind of screen was this"
// (checkout, catalog, product_detail, ...) instead of only the raw
// pathname. Longer/more specific prefixes are listed before their shorter
// parents (e.g. '/customers/' before '/customers') since getPageType below
// returns on the FIRST match.
const ROUTES = [
  ['/products/',        'product_detail'],
  ['/customers/',       'customer_profile'],
  ['/customers',        'customers'],
  ['/catalog',          'catalog'],
  ['/checkout',         'checkout'],
  ['/dashboard',        'dashboard'],
  ['/orders',           'orders'],
  ['/invoices',         'invoices'],
  ['/transactions',     'transactions'],
  ['/transfers',        'interstore_return'],
  ['/schemes',          'schemes'],
  ['/walkins',          'walkins'],
  ['/settings',         'settings'],
  ['/store-selection',  'store_selection'],
  ['/login',            'login'],
];

export function getPageType(pathname) {
  if (!pathname) return 'other';
  const match = ROUTES.find(([prefix]) => pathname.startsWith(prefix));
  return match ? match[1] : 'other';
}
