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
