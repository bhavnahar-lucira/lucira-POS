export const SCROLL_TO_TOP_PAGES = [
  '/catalog',
  '/products',   // covers /products/[itemId] (product detail)
  '/invoices',
  '/orders',
  '/customers',
  '/schemes'
];

/**
 * @param {string} pathname - current route pathname (from usePathname)
 * @returns {boolean}
 */
export function isScrollToTopEnabled(pathname) {
  if (!pathname) return false;
  return SCROLL_TO_TOP_PAGES.some(
    (page) => pathname === page || pathname.startsWith(`${page}/`)
  );
}