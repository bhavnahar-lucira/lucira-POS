'use client'

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { TooltipProvider } from '@/components/ui/tooltip';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import PageLoader from '@/components/shared/PageLoader';
import PageTransition from '@/components/shared/PageTransition';
import ScrollToTopButton from '@/components/shared/ScrollToTopButton';
import { NavigationGuardProvider } from '@/contexts/NavigationGuardContext';
import { useAllCatalog } from '@/hooks/catalog/useAllCatalog';
import { selectActiveStoreId } from '@/store/slices/storeSlice';

export default function AppShell({ children }) {
  const pathname = usePathname();
  const activeStoreId = useSelector(selectActiveStoreId);
  const [sweepReady, setSweepReady] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSweepReady(true), 1500);
    return () => clearTimeout(timer);
  }, []);

  useAllCatalog(activeStoreId, { enabled: sweepReady });

  return (
    <TooltipProvider delayDuration={300}>
      <NavigationGuardProvider>
        <div className="flex h-screen w-screen overflow-hidden bg-background">
          <Sidebar />
          <div className="flex flex-col flex-1 overflow-hidden">
            <Header />
            <main
              className="flex-1 overflow-y-auto"
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
      </NavigationGuardProvider>
    </TooltipProvider>
  );
}