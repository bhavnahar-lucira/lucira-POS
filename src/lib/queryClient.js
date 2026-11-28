// src/lib/queryClient.js
// TanStack Query client configuration for Lucira POS.
// Stale times per data category defined in APP_CONFIG.STALE_TIME.
// Source of truth: CODING_STANDARDS.md Section 6, ARCHITECTURE.md Section 19

import { QueryClient } from '@tanstack/react-query';
import APP_CONFIG from '@/constants/appConfig';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Default stale time — overridden per hook where needed
      staleTime: APP_CONFIG.STALE_TIME.CATALOG,

      gcTime: 10 * 60 * 1000, // 10 minutes

      retry: (failureCount, error) => failureCount < 1 && !(error?.code === 429 || error?.code >= 500),

      // Off by default: tab switches multiplied OrnaVerse load. Billing pages opt in.
      refetchOnWindowFocus: false,

      refetchOnReconnect: true,
    },
    mutations: {
      // Mutations are never auto-retried — user must explicitly resubmit
      retry: 0,
    },
  },
});

export default queryClient;