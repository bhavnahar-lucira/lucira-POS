'use client'

import { usePathname } from 'next/navigation';
import { TooltipProvider } from '@/components/ui/tooltip';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import PageLoader from '@/components/shared/PageLoader';
import PageTransition from '@/components/shared/PageTransition';
import ScrollToTopButton from '@/components/shared/ScrollToTopButton';
import { NavigationGuardProvider } from '@/contexts/NavigationGuardContext';
import VocEndVisitProvider from '@/components/features/voc/VocEndVisitProvider';
import { useGoldCoinPromoManager } from '@/hooks/checkout/useGoldCoinPromoManager';

export default function AppShell({ children }) {
  const pathname = usePathname();
  // Mounted exactly once here (AppShell persists across client-side
  // navigation within the whole POS route group) so the gold-coin promo's
  // auto-apply/eligibility/quantity-discovery effects never run more than
  // once concurrently — see the hook's own header for the race this avoids.
  useGoldCoinPromoManager();

  return (
    <TooltipProvider delayDuration={300}>
      <NavigationGuardProvider>
        <VocEndVisitProvider>
        <div className="flex h-screen w-screen overflow-hidden bg-background">
          <Sidebar />
          <div className="flex flex-col flex-1 overflow-hidden">
            <Header />
            <main
              className="relative flex-1 overflow-y-auto"
              id="main-content"
              role="main"
              tabIndex={-1}
            >
              <PageTransition>{children}</PageTransition>
            </main>
          </div>
          <PageLoader />
          <ScrollToTopButton key={pathname} />
        </div>
        </VocEndVisitProvider>
      </NavigationGuardProvider>
    </TooltipProvider>
  );
}