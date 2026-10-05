import { useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useNavigationGuardContext } from '@/contexts/NavigationGuardContext';

export const BACK_FALLBACKS = [
  { match: (p) => p === '/checkout',          fallback: '/cart' },
  { match: (p) => p === '/cart',              fallback: '/catalog' },
  { match: (p) => p.startsWith('/products/'), fallback: '/catalog' },
];

export function resolveBackFallback(pathname) {
  const entry = BACK_FALLBACKS.find(({ match }) => match(pathname));
  return entry?.fallback ?? null;
}

export function useSmartBack() {
  const router = useRouter();
  const pathname = usePathname();
  const { runGuard, clearGuard } = useNavigationGuardContext();

  const fallback = resolveBackFallback(pathname);
  const canGoBack = fallback !== null;

  const goBack = useCallback(() => {
    if (!runGuard()) return;
    if (fallback) router.push(fallback);
  }, [runGuard, fallback, router]);

  return { canGoBack, goBack, fallback, clearGuard };
}