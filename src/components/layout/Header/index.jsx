'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { useDispatch, useSelector } from 'react-redux';
import { AnimatePresence, motion } from 'motion/react';
import { ShoppingCart, LogOut, ChevronDown, Store, ArrowLeft, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/hooks/auth/useAuth';
import { useActiveStore } from '@/hooks/store/useActiveStore';
import { useCartItemCount } from '@/hooks/cart/useCartItemCount';
import { useSmartBack } from '@/hooks/navigation/useSmartBack';
import { useSidebar } from '@/hooks/ui/useSidebar';
import { openCart, closeCart, selectCartOpen } from '@/store/slices/uiSlice';
import StoreSelectModal from '@/components/features/auth/StoreSelectModal';
import CartDrawer from '@/components/features/cart/CartDrawer';
import HeaderCustomerControl from '@/components/layout/Header/HeaderCustomerControl';
import { NAV_ITEMS, BOTTOM_ITEMS } from '@/constants/navItems';
import { cn } from '@/lib/utils';
import { EASE_PREMIUM, DURATION } from '@/lib/motion';

// Derives the header title from the same NAV_ITEMS/BOTTOM_ITEMS the Sidebar
// uses, so there's no second label list to keep in sync. Routes not present
// in nav config fall back to a capitalized version of the last path segment.

const ALL_NAV_ITEMS = [...NAV_ITEMS, ...BOTTOM_ITEMS];

function usePageTitle() {
  const pathname = usePathname();

  // Checked before the generic fallback so a raw numeric ID isn't shown as the title.
  if (pathname.startsWith('/products/')) return 'Product Detail';

  const match = ALL_NAV_ITEMS.find(
    (item) => pathname === item.href || pathname.startsWith(item.href + '/')
  );
  if (match) return match.label;

  const segments = pathname.split('/').filter(Boolean);
  const last = segments[segments.length - 1] ?? 'Lucira POS';
  return last
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function CartBadge({ onOpen }) {
  const itemCount = useCartItemCount();

  return (
    <Button
      variant="ghost"
      size="icon"
      className="relative min-h-[44px] min-w-[44px]"
      onClick={onOpen}
      aria-label={`Cart — ${itemCount} ${itemCount === 1 ? 'item' : 'items'}`}
    >
      <ShoppingCart size={20} aria-hidden="true" />
      <AnimatePresence>
        {itemCount > 0 && (
          <motion.span
            key={itemCount > 99 ? '99+' : itemCount}
            className={cn(
              'absolute top-0.5 -right-1 flex h-5 w-5 items-center justify-center',
              'rounded-full bg-primary text-primary-foreground text-xs font-bold',
              'pointer-events-none'
            )}
            aria-hidden="true"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            transition={{ duration: DURATION.micro, ease: EASE_PREMIUM }}
          >
            {itemCount > 99 ? '99+' : itemCount}
          </motion.span>
        )}
      </AnimatePresence>
    </Button>
  );
}

function StoreIndicator({ onOpen }) {
  const { activeStoreName, availableStores } = useActiveStore();
  const hasMultipleStores = availableStores.length > 1;

  return (
    <button
      type="button"
      onClick={hasMultipleStores ? onOpen : undefined}
      aria-label={
        hasMultipleStores
          ? `Active store: ${activeStoreName ?? 'None'}. Tap to switch.`
          : `Active store: ${activeStoreName ?? 'None'}`
      }
      className={cn(
        'flex items-center gap-1.5 rounded-lg border border-input bg-card px-3 py-2 min-h-[44px]',
        'text-sm font-medium text-foreground transition-colors duration-standard ease-premium',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        hasMultipleStores ? 'hover:bg-gray-100 hover:shadow-sm cursor-pointer' : 'cursor-default'
      )}
    >
      <Store size={15} aria-hidden="true" className="shrink-0 text-muted-foreground" />
      {/* Icon-only below 1200px — the action cluster (customer control, cart,
          user menu) overflows real tablet viewports before that point. */}
      <span className="hidden min-[1200px]:inline truncate max-w-[140px]">
        {activeStoreName ?? '—'}
      </span>
      {hasMultipleStores && (
        <ChevronDown size={14} aria-hidden="true" className="shrink-0 text-muted-foreground" />
      )}
    </button>
  );
}

function getInitial(name) {
  return name?.trim()?.[0]?.toUpperCase() ?? '?';
}

function UserMenu() {
  const { user, logout } = useAuth();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-primary transition-colors duration-standard ease-premium hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`User menu — signed in as ${user?.username ?? 'Staff'}`}
        >
          {getInitial(user?.username)}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
          Signed in as <span className="truncate">{user?.username ?? 'Staff'}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={logout}
          className="text-destructive focus:text-white cursor-pointer"
        >
          <LogOut size={15} aria-hidden="true" className="mr-2" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function Header() {
  const dispatch = useDispatch();
  const [storeModalOpen, setStoreModalOpen] = useState(false);
  const cartOpen = useSelector(selectCartOpen);
  const pageTitle = usePageTitle();
  const { canGoBack, goBack } = useSmartBack();
  const { toggle: toggleSidebar } = useSidebar();

  return (
    <>
      <header
        className="flex items-center justify-between gap-4 border-b bg-card px-4 min-h-[64px] shrink-0"
        role="banner"
      >
        <div className="flex items-center gap-2 shrink-0 min-w-0">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            aria-label="Toggle navigation menu"
            className="min-h-[40px] min-w-[40px] shrink-0 md:hidden"
          >
            <Menu size={18} aria-hidden="true" />
          </Button>
          {/* Hidden on mobile — ate too much of the row for the title/action
              cluster to fit; kept on tablet/desktop where there's room. */}
          {canGoBack && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={goBack}
              aria-label="Go back"
              className="hidden min-h-[40px] min-w-[40px] shrink-0 sm:inline-flex"
            >
              <ArrowLeft size={18} aria-hidden="true" />
            </Button>
          )}
          <h1 className="font-heading text-base text-foreground truncate sm:text-lg md:text-xl">
            {pageTitle}
          </h1>
        </div>

        {/* Spacer — pushes the action cluster to the right on wide screens */}
        <div className="hidden flex-1 md:block" />

        <div className="flex items-center gap-2 shrink-0 overflow-x-auto">
          <HeaderCustomerControl />
          <CartBadge onOpen={() => dispatch(openCart())} />
          <StoreIndicator onOpen={() => setStoreModalOpen(true)} />
          {/* Hidden on mobile — moved into Sidebar's own mobile-drawer
              footer (signed-in operator + Sign out), keeping the mobile
              header down to just the essentials. Unchanged at md+. */}
          <div className="hidden md:block">
            <UserMenu />
          </div>
        </div>
      </header>

      {/* Store switcher modal — rendered outside header flow */}
      <StoreSelectModal
        isOpen={storeModalOpen}
        onClose={() => setStoreModalOpen(false)}
      />

      {/* Cart drawer — rendered outside header flow, available on every POS screen */}
      <CartDrawer
        isOpen={cartOpen}
        onClose={() => dispatch(closeCart())}
      />
    </>
  );
}